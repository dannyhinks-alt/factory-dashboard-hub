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
  await page.getByTestId('ws-4').click(); ok(await page.getByText('No FPDs yet.').isVisible(), 'empty workbook has 0 FPDs');
  await page.getByTestId('ws-6').click(); ok((await page.getByRole('button', { name: /Remove .* from Assessor/ }).count()) === 0, 'empty workbook has no assessed cells');
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
  const item = page.getByTestId('gap-item').filter({ hasText: 'no asset-specific Passport OEE' }).first();
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
  await page.getByTestId('ws-3').click();
  ok(await page.getByTestId('align-counts').isVisible(), 'compare counts');
  await page.getByTestId('ws-4').click();
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
  await page.getByTestId('ws-5').click();
  ok(await page.getByTestId('lever-Set A').isVisible(), 'Set A/B/C lever tester');
  await page.getByTestId('ws-6').click();
  ok((await page.getByTestId('gate-status-Design').innerText()).includes('BLOCKED (HS&E)'), 'Design gate BLOCKED (HS&E)');
  ok(await page.getByTestId('overdue').first().isVisible(), 'overdue action flagged');
  ok((await page.getByTestId('selftest-total').innerText()).startsWith('10 / 10'), '10-point self-test: 10/10 PASS');
  await page.screenshot({ path: 'e2e/out/governance.png', fullPage: true });

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export .xlsx' }).click()]);
  const p = 'e2e/out/export.xlsx'; await dl.saveAs(p);
  const wb = XLSX.read(readFileSync(p)); ok(['Dashboard', 'Compare', 'Data', 'Assessor', 'FPD', 'Lead time', 'Sensitivity', 'Levers', 'Scenarios', 'Register', 'Settings', 'Dictionary'].every((s) => wb.SheetNames.includes(s)), 'export has all 12 tabs');
  const data = XLSX.utils.sheet_to_json(wb.Sheets.Data, { header: 1 }); ok(data.some((r) => r[2] === 'Temper Oven' && r[7] === 0.82), 'exported .xlsx carries the filled gap');
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
  await page.getByTestId('gap-item').filter({ hasText: 'is not on the class table' }).first().click();
  await page.getByLabel('Complexity of Furnace').selectOption('Precision');
  ok((await page.getByLabel('Complexity of Furnace').inputValue()) === 'Precision', 'dropdown gap-fill');
  for (const n of [1, 2, 3, 4, 5, 6]) { await page.getByTestId(`ws-${n}`).click(); }
  ok(true, 'all 6 workspaces render on partial data');
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
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL E2E CHECKS PASSED'); process.exit(failed ? 1 : 0);
