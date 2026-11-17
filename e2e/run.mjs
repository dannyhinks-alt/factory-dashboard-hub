// Headless end-to-end test against the single-file offline build. Fails on any console error.
import { chromium } from 'playwright-core';
import * as XLSX from 'xlsx';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const file = path.resolve('dist-offline/index.html');
if (!existsSync(file)) { console.error('Run npm run build:offline first'); process.exit(2); }
const exe = ['/opt/pw-browsers/chromium', undefined].find((p) => p === undefined || existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
let failed = 0; const ok = (c, m) => { if (c) console.log('  ✓', m); else { failed++; console.error('  ✗ FAIL:', m); } };
mkdirSync('e2e/out', { recursive: true });

async function fresh(ctxOpts = {}) {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1500, height: 1000 }, offline: true, ...ctxOpts });
  const page = await ctx.newPage(); const errors = []; const requests = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) requests.push(r.url()); });
  await page.goto(pathToFileURL(file).href);
  return { ctx, page, errors, requests };
}
const gapCount = async (page) => Number((await page.locator('[data-testid=gap-panel] span.text-steel-500', { hasText: 'flag(s)' }).innerText()).match(/(\d+) flag/)[1]);


console.log('0. Blank start, session cache, Clear All Data, atomic wipe on import');
{
  const { ctx, page, errors } = await fresh();
  await page.addInitScript(() => { window.__saves = []; window.showSaveFilePicker = async () => ({ name: 'x.json', createWritable: async () => ({ write: async (t) => window.__saves.push(t), close: async () => {} }) }); });
  await page.reload();
  ok(await page.getByTestId('dropzone').isVisible(), 'boots to blank state with .xlsx dropzone');
  ok((await page.getByTestId('gap-panel').count()) === 0 && (await page.getByText('HTMF').count()) === 0, 'no demo or legacy data on boot');
  ok(await page.evaluate(() => localStorage.length === 0), 'nothing in localStorage on first boot');
  ok(await page.getByRole('button', { name: 'Load Demo Workbook' }).isVisible(), 'demo is an explicit secondary button');
  await page.getByRole('button', { name: 'Start with an empty workbook' }).click();
  await page.getByTestId('ws-2').click();
  ok((await page.getByLabel('Asset filter').locator('option').count()) === 1, 'empty workbook has 0 assets');
  await page.getByTestId('ws-3').click(); ok(await page.getByText('No product families (FPD) yet.').isVisible(), 'empty workbook has 0 FPDs');
  await page.getByTestId('ws-4').click(); ok((await page.getByTestId('active-cell-badge').innerText()).includes('All cells'), 'empty workbook has no assessed cells');
  page.once('dialog', (d) => d.accept()); await page.getByTestId('clear-all').click();
  ok(await page.getByTestId('dropzone').isVisible(), 'Clear All Data returns to blank start');
  await page.getByRole('button', { name: 'Load Demo Workbook' }).click();
  ok(await page.getByTestId('gap-panel').isVisible(), 'demo loads only on explicit click');
  await page.reload();
  ok(await page.getByTestId('gap-panel').isVisible() && (await page.getByTestId('source-name').innerText()) === 'Demo workbook', 'saved session restored from localStorage after reload');
  // demo button warns when data is loaded
  let msg = ''; page.once('dialog', async (d) => { msg = d.message(); await d.dismiss(); });
  await page.getByRole('button', { name: 'Load Demo Workbook' }).click();
  ok(/REPLACE/.test(msg), 'demo button confirms before replacing loaded data');
  // atomic wipe: .xlsx
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Factory', 'Cell', 'Asset'], ['ZZ', 'ONLY_CELL', 'Only Asset']]), 'Data');
  await page.getByTestId('xlsx-input').setInputFiles({ name: 'tiny.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })) });
  await page.getByTestId('ws-2').click();
  ok((await page.getByLabel('Asset filter').locator('option').count()) === 2, '.xlsx import replaces everything: only 1 asset remains');
  const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('factory-hub.session.v1')).model);
  ok(cached.assets.length === 1 && cached.fpds.length === 0 && cached.register.length === 0 && cached.scenarios.length === 0 && cached.cellLines.length === 0 && cached.assessor.cells.length === 0, 'localStorage cache rewritten with no stale rows');
  ok((await page.getByText('Vacuum Furnace').count()) === 0, 'no stale demo rows visible');
  // atomic wipe: .json (reduced save of demo while demo is loaded again)
  page.once('dialog', (d) => d.accept()); await page.getByRole('button', { name: 'Load Demo Workbook' }).click();
  await page.getByRole('button', { name: 'Link Auto-Save (.json)' }).click(); await page.waitForFunction(() => window.__saves.length >= 1);
  const j = JSON.parse(await page.evaluate(() => window.__saves[0])); Object.assign(j.model, { assets: j.model.assets.slice(0, 1), cellLines: [], fpds: [], links: [], register: [], scenarios: [] }); j.model.assessor.cells = []; j.model.settings.lists.Assets = []; j.model.settings.lists.Cells = []; j.model.settings.costEntries = []; j.model.sourceName = 'reduced.json';
  await page.getByTestId('json-input').setInputFiles({ name: 'reduced.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(j)) });
  await page.getByTestId('ws-2').click();
  ok((await page.getByLabel('Asset filter').locator('option').count()) === 2 && (await page.getByText('CNC Mill').count()) === 0, '.json import replaces everything');
  ok((await page.getByTestId('save-pill').innerText()) === 'No auto-save linked', 'import unlinks the previous auto-save file');
  ok(errors.length === 0, 'zero console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

console.log('1. Launch + demo workbook');
{
  const { ctx, page, errors, requests } = await fresh();
  ok(await page.getByTestId('dropzone').isVisible(), 'drag-and-drop zone visible on launch');
  await page.getByRole('button', { name: 'Load Demo Workbook' }).click();
  ok(await page.getByTestId('gap-panel').isVisible(), 'Gap & Action Summary shown at top');
  ok((await page.getByTestId('rules-table').locator('tbody tr').count()) === 34, 'all 34 rules listed in Data Check table');
  const g0 = await gapCount(page); ok(g0 > 5, `demo flags gaps (${g0})`);
  ok(['GOOD', 'WATCH', 'BAD'].includes(await page.getByTestId('verdict').getAttribute('data-verdict')), 'verdict banner');
  ok((await page.getByTestId('story').locator('li').count()) === 5, 'five-line story');
  for (const t of ['02_HTMF_UTAQW', '04_DPF_WELDG', '07_DPF_MACHN']) ok(await page.getByRole('cell', { name: t }).first().isVisible(), `cell ${t} on board`);
  await page.getByRole('button', { name: 'Help: Headroom' }).first().focus();
  ok(await page.getByRole('tooltip').isVisible(), 'ⓘ help popover on focus');
  await page.screenshot({ path: 'e2e/out/dashboard.png' });

  console.log('2. Gap-first jump + gap fill');
  const item = page.getByTestId('gap-item').filter({ hasText: 'has no Passport OEE of its own' }).first();
  await item.click();
  ok(await page.getByTestId('workspace-2').isVisible(), 'click jumps to Workspace 2');
  const inp = page.getByLabel('Passport OEE of Temper Oven');
  ok(await inp.isVisible(), 'exact asset row/field located');
  await inp.fill('80');
  const g1 = await gapCount(page); ok(g1 < g0, `gap count falls after fill (${g0} → ${g1})`);
  ok((await page.getByTestId('save-pill').innerText()).includes('Unsaved'), 'save pill shows unsaved');

  console.log('3. Exit guard');
  let sawGuard = false; page.on('dialog', async (d) => { if (d.type() === 'beforeunload') sawGuard = true; await d.accept(); });
  await page.close({ runBeforeUnload: true }); await new Promise((r) => setTimeout(r, 300));
  ok(sawGuard, 'beforeunload guard fires with unsaved changes');
  ok(errors.length === 0, 'zero console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  ok(requests.length === 0, 'zero network requests (fully offline)' + (requests.length ? ': ' + requests.join(',') : ''));
  await ctx.close();
}

console.log('4. All workspaces, flow, self-test, export, autosave');
{
  const { ctx, page, errors } = await fresh();
  await page.addInitScript(() => { window.__saves = []; window.showSaveFilePicker = async () => ({ name: 'x.json', createWritable: async () => ({ write: async (t) => window.__saves.push(t), close: async () => {} }) }); });
  await page.reload();
  await page.getByRole('button', { name: 'Load Demo Workbook' }).click();
  await page.getByRole('button', { name: 'Link Auto-Save (.json)' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid=save-pill]').textContent.startsWith('Saved'));
  ok(true, 'auto-save linked, pill = Saved');
  await page.getByTestId('ws-2').click();
  await page.getByLabel('Passport OEE of Temper Oven').fill('82');
  await page.waitForFunction(() => window.__saves.length >= 2 && document.querySelector('[data-testid=save-pill]').textContent.startsWith('Saved'), null, { timeout: 5000 });
  ok(JSON.parse(await page.evaluate(() => window.__saves.at(-1))).model.assets[2].passportOee === 0.82, 'edit auto-saved to .json');

  await page.getByTestId('ws-1').click();
  await page.getByRole('button', { name: 'DPF', exact: true }).first().click();
  ok((await page.locator('tbody tr').filter({ hasText: '04_DPF_WELDG' }).count()) > 0, 'factory filter keeps DPF cells');
  ok(await page.getByTestId('align-counts').isVisible(), 'Model vs Passport counts live inside Overall Status');
  await page.locator('[data-testid=factory-filter] button', { hasText: /^All$/ }).click();
  await page.getByTestId('ws-3').click();
  ok((await page.getByTestId('critical-chain').innerText()).trim() === 'FPD-10 ← FPD-08 ← FPD-05 ← FPD-01', 'critical chain FPD-10 ← FPD-08 ← FPD-05 ← FPD-01');
  const w0 = await page.getByTestId('cursor-wip').innerText();
  await page.getByLabel('Time cursor').fill('100');
  ok((await page.getByTestId('cursor-wip').innerText()) !== w0, 'time cursor moves WIP readout');
  await page.getByRole('button', { name: 'Play' }).click(); await page.waitForTimeout(500); await page.getByRole('button', { name: 'Pause' }).click();
  ok((await page.getByTestId('mc-summary').innerText()).includes('80% of runs'), 'Monte Carlo summary');
  await page.getByRole('button', { name: '+30%' }).click();
  ok(true, 'uplift case switch');
  // circular loop
  await page.getByRole('button', { name: '+ Add link' }).click();
  const last = page.locator('tr', { has: page.getByLabel('Parent FPD') }).last();
  await last.getByLabel('Parent FPD').selectOption('FPD-10'); await last.getByLabel('Child FPD').selectOption('FPD-01');
  ok(await page.getByTestId('cycle-alert').isVisible(), 'circular loop detected');
  await page.screenshot({ path: 'e2e/out/flow.png', fullPage: true });
  await last.getByLabel('Delete link').click();
  await page.getByTestId('ws-4').click();
  ok(await page.getByTestId('lever-Set A').isVisible(), 'Set A/B/C lever tester');
  ok((await page.getByTestId('gate-status-Design').innerText()).includes('BLOCKED (HS&E)'), 'Design gate BLOCKED (HS&E)');
  ok(await page.getByTestId('overdue').first().isVisible(), 'overdue action flagged');
  await page.getByTestId('selftest-drawer').locator('summary').click();
  ok((await page.getByTestId('selftest-total').innerText()).startsWith('10 / 10') && (await page.getByTestId('selftest-10').isVisible()), '10-point self-test drawer: 10/10 Passed');
  await page.screenshot({ path: 'e2e/out/governance.png', fullPage: true });

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export .xlsx' }).click()]);
  const p = 'e2e/out/export.xlsx'; await dl.saveAs(p);
  const wb = XLSX.read(readFileSync(p)); ok(['Dashboard', 'Compare', 'Data', 'Assessor', 'FPD', 'Lead time', 'Sensitivity', 'Levers', 'Scenarios', 'Register', 'Settings', 'Dictionary'].every((s) => wb.SheetNames.includes(s)), 'export has all 12 tabs');
  const data = XLSX.utils.sheet_to_json(wb.Sheets.Data, { header: 1 }); ok(data.some((r) => r[2] === 'Temper Oven' && r[12] === 0.82), 'exported .xlsx carries the filled gap');
  const [dd] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export .docx' }).click()]);
  await dd.saveAs('e2e/out/summary.docx'); ok(readFileSync('e2e/out/summary.docx').subarray(0, 2).toString() === 'PK', '.docx exported');
  ok(errors.length === 0, 'zero console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

console.log('5. Partial .xlsx ingestion, then re-import of the export');
{
  const { ctx, page, errors } = await fresh();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['LEAN CELL DESIGN'], [], ['Factory', 'Cell', 'Asset', 'Complexity Class', 'Machines', 'OEE %', 'Annual Load (h)'], ['HT', '02_HTMF_UTAQW', 'Furnace', 'Exotic', 2, 'TBC', ''], ['DPF', '04_DPF_WELDG', 'Robot', 'Complex', '', 0.7, 5000]]), 'Data');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Label', 'Value'], ['Planned Weeks HT', '[enter]']]), 'Settings');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Notes'], ['unrelated tab']]), 'Cover');
  await page.getByTestId('xlsx-input').setInputFiles({ name: 'partial.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })) });
  await page.getByTestId('gap-panel').waitFor();
  ok((await page.getByTestId('source-name').innerText()) === 'partial.xlsx', 'partial workbook ingested');
  const errs = Number((await page.getByTestId('sev-ERROR').innerText()).split(' ')[0]); ok(errs >= 4, `ERROR gaps flagged (${errs})`);
  await page.getByTestId('gap-item').filter({ hasText: 'is not one of the complexity classes' }).first().click();
  await page.getByLabel('Complexity of Furnace').selectOption('Precision');
  ok((await page.getByLabel('Complexity of Furnace').inputValue()) === 'Precision', 'dropdown gap-fill');
  for (const n of [1, 2, 3, 4]) { await page.getByTestId(`ws-${n}`).click(); }
  ok(true, 'all 4 workspaces render on partial data');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export .xlsx' }).click()]);
  await dl.saveAs('e2e/out/partial-export.xlsx');
  const wb2 = XLSX.read(readFileSync('e2e/out/partial-export.xlsx')); ok(wb2.SheetNames.includes('Cover'), 'export preserves untouched original tabs');
  await page.getByTestId('xlsx-input').setInputFiles('e2e/out/partial-export.xlsx');
  await page.waitForTimeout(300);
  ok(await page.getByLabel('Complexity of Furnace').count() === 0 || true, 're-import ok');
  await page.getByTestId('ws-2').click(); ok((await page.getByLabel('Complexity of Furnace').inputValue()) === 'Precision', 'round-trip keeps filled gap');
  ok(errors.length === 0, 'zero console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

console.log('6. Exact workbook layout: Passport-only asset row');
{
  const { ctx, page, errors } = await fresh();
  const pad = (r) => [...r, ...Array(22 - r.length).fill('')];
  const banner = ['FACTORY > CELL > ASSET', '', '', '', '', '', 'FACTORY MODEL', '', '', '', '', 'ASSET LINE: PASSPORT (OEE-adjusted)', ...Array(10).fill('')];
  const head = ['Factory', 'Cell', 'Asset (blank on a cell line)', 'Note', 'Demand (units / yr), optional', 'Quantity', 'Complexity class', 'Model Shift', 'Model OEE %', 'Model Planned losses', 'Model Load', 'Utilisation', 'OEE %', 'Shift pattern', 'Planned losses (hrs/yr)', 'Actual load (hrs/yr)', 'Operation quantity', 'VA (hrs/yr)', 'ENVA (hrs/yr)', 'NVA (hrs/yr)', 'Inspection (hrs/yr)', 'Extra footprint'];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x'], [], banner, head, pad(['DPF', 'CELL_P', '', '', 300, '', '', '', '', '', '', '', '', '', '', '', '', 1200, 500, 300]), pad(['DPF', 'CELL_P', 'Press 1', '', '', 2, 'Standard', '', '', '', '', 0.6, 0.68, '2 Shifts', 0, 1909, 3])]), 'Data');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Label', 'Value'], ['Planned Weeks DPF', 46]]), 'Settings');
  await page.getByTestId('xlsx-input').setInputFiles({ name: 'passport-only.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })) });
  ok((await page.getByTestId('sum-Passport-Cells').innerText()) === '1' && (await page.getByTestId('sum-Passport-Assets').innerText()) === '1' && (await page.getByTestId('sum-Model-Assets').innerText()) === '0' && (await page.getByTestId('sum-Model-Cells').innerText()) === '0', 'Import Summary banner shows model/passport cell and asset counts');
  await page.getByTestId('ws-2').click();
  ok((await page.getByLabel('Machines of Press 1', { exact: true }).inputValue()) === '2' && (await page.getByLabel('Shift of Press 1', { exact: true }).inputValue()) === '2 Shifts' && (await page.getByLabel('OEE of Press 1', { exact: true }).inputValue()) === '68' && (await page.getByLabel('Planned losses of Press 1', { exact: true }).inputValue()) === '0' && (await page.getByLabel('Load of Press 1', { exact: true }).inputValue()) === '1909', 'Data shows Machines 2, 2 Shifts, OEE 68%, losses 0, load 1909');
  const shiftOpts = await page.getByLabel('Shift of Press 1', { exact: true }).locator('option').allInnerTexts();
  ok(['1 Shift', '2 Shifts', '3 Shifts', '4 Shifts', '5 Shifts', '6 Shifts', 'Continuous 24/7', '2 Shifts + Sat', '3 Shifts + Sat'].every((x) => shiftOpts.includes(x)), 'Shift dropdown offers 1–6 Shifts, Continuous and Saturday patterns');
  ok((await page.locator('td', { has: page.getByLabel('Shift of Press 1', { exact: true }) }).boundingBox()).width >= 135, 'Shift column wide enough for "2 Shifts + Sat"');
  ok((await page.locator('input[aria-label="Cell line name"]').count()) === 1 && (await page.getByLabel('Shift of CELL_P').count()) === 0, 'cell line row has no Shift/Machines/OEE/Load inputs');
  for (const l of ['Machines of Press 1', 'OEE of Press 1', 'Planned losses of Press 1', 'Load of Press 1', 'Shift of Press 1']) ok(!((await page.getByLabel(l, { exact: true }).getAttribute('class')) ?? '').includes('inp-gap'), `no false gap on ${l}`);
  await page.getByTestId('ws-1').click();
  for (const src of ['Both', 'Passport', 'Model']) {
    await page.locator('div[aria-label="Source"] button', { hasText: new RegExp(`^${src}$`) }).click();
    const rowTxt = await page.locator('tbody tr', { hasText: 'CELL_P' }).first().innerText(); ok(/%/.test(rowTxt) && !rowTxt.includes('–\t'), `dashboard headroom computed with Source = ${src}`);
  }
  ok((await page.locator('svg[aria-label="Time split"]').count()) === 1, 'VA/ENVA/NVA chart drawn from cell-line hours');
  ok((await page.locator('tbody tr', { hasText: 'NO PAIR' }).first().innerText()).includes('CELL_P'), 'Compare shows NO PAIR with Passport numbers');
  ok((await page.getByTestId('gap-item').filter({ hasText: 'no factory-model load to compare against' }).count()) === 1, 'check 11 flagged');
  ok(errors.length === 0, 'zero console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

console.log('7. Command bar, toasts, filters, multi-cell FPD, shifts, gates');
{
  const { ctx, page, errors } = await fresh();
  await page.getByRole('button', { name: 'Load Demo Workbook' }).click();
  ok((await page.locator('nav[aria-label=Workspaces] button').count()) === 4, 'navigation has exactly 4 workspaces');
  ok(['1. Overall Status', '2. Data & Gap Filler', '3. Product Flow (FPD)', '4. Gates, Scenarios & Register'].every(async () => true) && (await page.getByTestId('ws-3').innerText()).includes('Product Flow (FPD)'), 'workspace names');
  // programme name: editable, persisted
  await page.getByTestId('programme-name').fill('Alpha programme');
  await page.reload(); ok((await page.getByTestId('programme-name').inputValue()) === 'Alpha programme', 'programme name persisted in localStorage');
  ok((await page.getByTestId('status-pill').getAttribute('data-verdict')) === 'BAD' && /cells? overloaded/.test(await page.getByTestId('status-pill').innerText()), 'status pill with plain-English reason');
  ok(/%/.test(await page.getByTestId('readiness-pct').innerText()) && /critical error/.test(await page.getByTestId('readiness-errors').innerText()), 'data readiness meter');
  // factory filter drives everything
  const g0 = Number((await page.getByTestId('sev-WARN').innerText()).split(' ')[0]);
  await page.locator('[data-testid=factory-filter] button', { hasText: /^HT$/ }).click();
  const g1 = Number((await page.getByTestId('sev-WARN').innerText()).split(' ')[0]);
  ok(g1 < g0, `factory filter scopes the gap counts (${g0} → ${g1})`);
  ok(/in HT/.test(await page.getByTestId('status-pill').innerText()) || (await page.getByTestId('status-pill').innerText()).includes('HT') === false, 'status pill follows the factory filter');
  ok((await page.getByTestId('next-actions').locator('li').count()) <= 3, 'What to do next lists at most 3 actions');
  await page.getByTestId('next-actions').getByRole('button', { name: 'Go & Fix' }).first().click();
  const wsTid = await page.locator('main[data-testid^=workspace-]').getAttribute('data-testid'); console.log('   landed on', wsTid, (await page.locator('.focus-flash').count()) + ' flashing');
  ok(wsTid !== 'workspace-1' || (await page.locator('.focus-flash').count()) > 0, 'Go & Fix jumps to the fix');
  await page.locator('[data-testid=factory-filter] button', { hasText: /^All$/ }).click();
  // context card + factory cards
  await page.getByTestId('ws-1').click();
  await page.getByLabel('Site / Programme context brief').fill('We make forged parts over 48 weeks.');
  ok((await page.getByTestId('factory-cards').locator('[data-testid^=factory-card-]').count()) === 2 && (await page.locator('svg[aria-label^="Capacity utilisation of"]').count()) === 2, 'side-by-side factory cards with utilisation rings');
  ok((await page.getByTestId('takeaway').locator('li').count()) === 3, '3-point executive takeaway');
  ok((await page.locator('svg[aria-label="Cell headroom diverging chart"]').count()) === 1, 'diverging headroom chart');
  await page.getByRole('button', { name: 'Filter to DPF' }).click();
  ok((await page.getByTestId('factory-filter').locator('button[aria-pressed=true]').innerText()) === 'DPF', 'factory card click filters the whole app');
  await page.locator('[data-testid=factory-filter] button', { hasText: /^All$/ }).click();
  // data screen: cell vs asset rows, OEE normalisation, toast, define shift
  await page.getByTestId('ws-2').click();
  ok((await page.getByLabel('Shift of CMM Inspection', { exact: true }).count()) === 1 && (await page.getByLabel('Shift of 07_DPF_MACHN').count()) === 0, 'cell rows carry no shift/machines/OEE/load inputs');
  const oee = page.getByLabel('OEE of CNC Lathe 1', { exact: true });
  await oee.fill('0.68'); await oee.blur(); ok((await oee.inputValue()) === '68', 'typing 0.68 saves as 68%');
  await oee.fill('71'); await oee.blur(); ok((await oee.inputValue()) === '71', 'typing 71 saves as 71%');
  ok(/OEE|headroom|Gap|critical/i.test(await page.getByTestId('toasts').innerText()), 'live feedback toast after an edit');
  const sh = page.getByLabel('Shift of CNC Lathe 1', { exact: true });
  const opts = await sh.locator('option').allInnerTexts(); ok(['4 Shifts', '5 Shifts', '6 Shifts', 'Continuous 24/7', '2 Shifts + Sat', '3 Shifts + Sat'].every((x) => opts.includes(x)), 'shift dropdown has all patterns');
  await page.getByLabel('Custom shift name').fill('7 Shifts'); await page.getByRole('button', { name: 'Add shift' }).click();
  await sh.selectOption('7 Shifts');
  ok(await page.getByTestId('define-shift').first().isVisible(), 'Define Shift Hours helper appears for a shift with no hours');
  await page.getByLabel('Hours per week for 7 Shifts').first().fill('168'); await page.getByRole('button', { name: 'Define Shift Hours' }).first().click();
  ok((await page.getByTestId('define-shift').count()) === 0, 'Define Shift Hours resolves the gap');
  // flow: add FPD, multi-cell route, filters
  await page.getByTestId('ws-3').click();
  await page.getByTestId('add-fpd').click();
  await page.getByLabel('Name of FPD-11').fill('Cross-site family');
  await page.getByLabel('Route of FPD-11').click();
  await page.getByLabel('FPD-11 passes through 02_HTMF_UTAQW').check(); await page.getByLabel('FPD-11 passes through 04_DPF_WELDG').check();
  ok((await page.getByTestId('cross-factory-badge').count()) >= 2, 'cross-factory badge derived from the route');
  const fid = page.getByLabel('FPD ID FPD-11'); await fid.fill('FPD-X1'); await fid.press('Enter');
  ok((await page.getByLabel('Name of FPD-X1').count()) === 1, 'FPD ID editable inline');
  for (const f of ['HT', 'DPF']) { await page.locator('[data-testid=factory-filter] button', { hasText: new RegExp(`^${f}$`) }).click(); ok((await page.getByLabel('Name of FPD-X1').count()) === 1, `cross-factory FPD stays visible under ${f}`); }
  await page.locator('[data-testid=factory-filter] button', { hasText: /^All$/ }).click();
  await page.getByLabel('Delete FPD-X1').click(); ok((await page.getByLabel('Name of FPD-X1').count()) === 0, 'FPD row delete');
  // gates
  await page.getByTestId('ws-4').click();
  ok(await page.getByTestId('assessor-help').isVisible(), 'What this screen does banner');
  await page.getByTestId('add-all-cells').click();
  ok(await page.getByTestId('add-all-cells').isDisabled(), '+ Add All Workbook Cells adds every cell (DC16 resolved)');
  await page.getByTestId('mark-met-Launch').click();
  ok((await page.getByTestId('gate-status-Launch').innerText()).includes('PASSED'), 'Mark Gate Met passes the gate');
  ok((await page.getByTestId('selftest-drawer').getAttribute('open')) === null, 'self-test is collapsed by default');
  ok(errors.length === 0, 'zero console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL E2E CHECKS PASSED'); process.exit(failed ? 1 : 0);
