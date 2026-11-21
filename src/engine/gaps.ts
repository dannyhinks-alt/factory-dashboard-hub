/**
 * Export Gaps (.xlsx) / Import Filled Gaps (.xlsx).
 * The `Cell & Asset Gaps`, `Product Flow (FPD) Gaps` and `Gate Readiness Gaps` sheets use one shared schema so the same
 * workbook can be filled in once and imported into either Factory Dashboard Hub or Cell Design Passport.
 */
import ExcelJS from 'exceljs/dist/exceljs.bare.min.js';
import * as XLSX from 'xlsx';
import { SHIFTS, GP_GATES, GP_THEME_NUMS, GP_THEMES } from './constants';
import { normalisePct, shiftHoursFor } from './calc';
import { PLAIN } from './plainEnglish';
import { issueFactories } from './overview';
import { gpRatingKey, gpDateKey } from './governance';
import type { Asset, CellLine, Fpd, Issue, Model, Rating, Severity } from './types';

export const SHEET_OVERVIEW = 'Overview & Instructions';
export const SHEET_CELLS = 'Cell & Asset Gaps';
export const SHEET_FPD = 'Product Flow (FPD) Gaps';
export const SHEET_GATES = 'Gate Readiness Gaps';
export const GAP_SHEETS = [SHEET_CELLS, SHEET_FPD, SHEET_GATES];

const AMBER = 'FFFEF3C7', CONTEXT = 'FFF8FAFC', HEAD = 'FF0F172A', BORDER = 'FFCBD5E1', AMBER_BORDER = 'FFD97706';
const SEV_ORDER: Record<Severity, number> = { ERROR: 0, WARN: 1, INFO: 2 };
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
const key = (s: unknown) => String(s ?? '').toLowerCase().replace(/\([^)]*\)?/g, '').replace(/[^a-z0-9]/g, '');

export const CELL_COLS = ['Factory', 'Cell ID', 'Cell Name', 'Asset', 'Severity', 'What Is Missing', 'Shift Pattern', 'Complexity', 'Machines', 'OEE (%)', 'Actual Load (hrs/yr)', 'Planned Losses (hrs/yr)', 'Demand (units/yr)', 'VA (hrs)', 'ENVA (hrs)', 'NVA (hrs)', 'Inspection (hrs)', 'CapEx (£)', 'Footprint (m²)', 'Passport Version', 'Passport Date'] as const;
type Col = typeof CELL_COLS[number];
export const FPD_COLS = ['FPD ID', 'Severity', 'What Is Missing', 'Name', 'Route Cells', 'Hours', 'Volume', 'Working hrs/day', 'Version', 'Date'] as const;
export const GATE_COLS = ['Cell ID', 'Gate', 'Status', 'Date Reviewed', ...GP_THEME_NUMS.map((n) => `Theme ${n}: ${GP_THEMES[n]}`), 'Headline Note'] as const;

// ------------------------------------------------------------------ what each flagged rule makes the engineer fill
const ASSET_FIELDS: Record<string, Col[]> = { DC21: ['Complexity'], DC10: ['Actual Load (hrs/yr)'], DC11: ['Actual Load (hrs/yr)'], DC12: ['Actual Load (hrs/yr)', 'OEE (%)'], DC13: ['OEE (%)'], DC30: ['Planned Losses (hrs/yr)'] };
const CELL_FIELDS: Record<string, Col[]> = { DC05: ['Demand (units/yr)'], DC09: ['Passport Version', 'Passport Date'], DC29: ['Inspection (hrs)', 'VA (hrs)'], DC33: ['Footprint (m²)'], DC34: ['Footprint (m²)'] };

interface Row { factory: string; cellId: string; cellName: string; asset: string; sev: Severity; missing: string[]; vals: Partial<Record<Col, string | number>>; amber: Set<Col> }
const worst = (xs: Issue[]) => xs.reduce<Severity>((a, i) => (SEV_ORDER[i.severity] < SEV_ORDER[a] ? i.severity : a), 'INFO');
const headlines = (xs: Issue[]) => [...new Set(xs.map((i) => PLAIN[i.rule]?.headline ?? i.message))];

export const ASSUMPTION_NOTE = 'Wizard assumption — please verify';
const ASSUMED_COLS: Record<string, Col> = { shift: 'Shift Pattern', complexity: 'Complexity', oee: 'OEE (%)' };
/** Assumed (wizard-filled) fields of one asset: the Excel column and the label the engineer sees. */
const assumedOf = (m: Model, a: Asset): { col: Col; label: string }[] => Object.entries(ASSUMED_COLS).flatMap(([kind, col]) => { const why = m.assumedFields?.[`asset:${a.id}:${kind}`]; return why ? [{ col, label: why }] : []; });

export function assetRow(m: Model, a: Asset, xs: Issue[]): Row {
  const amber = new Set<Col>(); const assumed = assumedOf(m, a); assumed.forEach((x) => amber.add(x.col)); xs.forEach((i) => ASSET_FIELDS[i.rule]?.forEach((c) => amber.add(c)));
  if (!a.shift.trim() || shiftHoursFor(m, a.shift) === null) amber.add('Shift Pattern'); // only blank, or not resolvable to scheduled hours
  if (a.machines === null) amber.add('Machines'); if (a.oee === null) amber.add('OEE (%)'); if (a.loadHrs === null) amber.add('Actual Load (hrs/yr)');
  if (xs.some((i) => i.rule === 'DC20' || i.rule === 'DC21') && a.complexity) amber.add('Complexity');
  if ((a.machines !== null && a.machines <= 0) || xs.some((i) => i.rule === 'DC27' && /machines/.test(i.message))) amber.add('Machines');
  if (a.oee !== null && (a.oee <= 0 || a.oee > 1)) amber.add('OEE (%)'); if (a.loadHrs !== null && a.loadHrs <= 0) amber.add('Actual Load (hrs/yr)');
  const cl = m.cellLines.find((c) => c.cell === a.cell);
  return { factory: a.factory, cellId: a.cell, cellName: cl?.note || '', asset: a.asset, sev: xs.length ? worst(xs) : 'WARN', missing: [...headlines(xs), ...assumed.map((x) => `${ASSUMPTION_NOTE}: ${x.col} (${x.label})`)], amber,
    vals: { 'Shift Pattern': a.shift, Complexity: a.complexity, Machines: a.machines ?? '', 'OEE (%)': a.oee === null ? '' : Math.round(a.oee * 10000) / 100, 'Actual Load (hrs/yr)': a.loadHrs ?? '', 'Planned Losses (hrs/yr)': a.plannedLosses ?? '', 'Demand (units/yr)': a.demand ?? '', 'CapEx (£)': a.costPerMachine ?? '', 'Footprint (m²)': a.spacePerMachine ?? '' } };
}
export function cellRow(m: Model, c: CellLine, xs: Issue[]): Row {
  const amber = new Set<Col>(); xs.forEach((i) => CELL_FIELDS[i.rule]?.forEach((f) => amber.add(f)));
  const assetsDemand = m.assets.some((a) => a.cell === c.cell && a.demand !== null);
  if (c.demandUnits === null && !assetsDemand) amber.add('Demand (units/yr)');
  if (c.passport && !c.version) amber.add('Passport Version'); if (c.passport && !c.date) amber.add('Passport Date');
  if (c.passport) { if (c.vaHrs === null) amber.add('VA (hrs)'); if (c.envaHrs === null) amber.add('ENVA (hrs)'); if (c.nvaHrs === null) amber.add('NVA (hrs)'); }
  return { factory: c.factory, cellId: c.cell, cellName: c.note, asset: '', sev: worst(xs), missing: headlines(xs), amber,
    vals: { 'Demand (units/yr)': c.demandUnits ?? '', 'VA (hrs)': c.vaHrs ?? '', 'ENVA (hrs)': c.envaHrs ?? '', 'NVA (hrs)': c.nvaHrs ?? '', 'Inspection (hrs)': c.inspectionHrs ?? '', 'Footprint (m²)': c.footprint ?? '', 'Passport Version': c.version, 'Passport Date': c.date } };
}

export function cellAssetRows(m: Model, issues: Issue[]): Row[] {
  const by = new Map<string, Issue[]>(); issues.forEach((i) => { if (i.target && (i.target.kind === 'asset' || i.target.kind === 'cellline')) by.set(`${i.target.kind}:${i.target.ref}`, [...(by.get(`${i.target.kind}:${i.target.ref}`) ?? []), i]); });
  const rows: Row[] = [];
  m.cellLines.forEach((c) => { const xs = by.get(`cellline:${c.id}`); if (xs) rows.push(cellRow(m, c, xs)); });
  m.assets.forEach((a) => { const xs = by.get(`asset:${a.id}`); if (xs || assumedOf(m, a).length) rows.push(assetRow(m, a, xs ?? [])); });
  return rows.sort((a, b) => a.factory.localeCompare(b.factory) || a.cellId.localeCompare(b.cellId) || (a.asset === '' ? -1 : b.asset === '' ? 1 : a.asset.localeCompare(b.asset)));
}

export interface FpdRow { fpd: Fpd; sev: Severity; missing: string[]; amber: Set<string> }
export function fpdRows(m: Model, issues: Issue[]): FpdRow[] {
  const by = new Map<string, Issue[]>(); issues.forEach((i) => { if (i.target?.kind === 'fpd') by.set(i.target.ref, [...(by.get(i.target.ref) ?? []), i]); });
  return m.fpds.flatMap((p) => {
    const amber = new Set<string>(); const xs = by.get(p.id) ?? [];
    if (!p.name) amber.add('Name'); if (!p.route.length) amber.add('Route Cells'); if (p.hours === null) amber.add('Hours'); if (p.volume === null) amber.add('Volume'); if (p.whd === null && m.settings.defaultWhd === null) amber.add('Working hrs/day'); if (!p.version) amber.add('Version'); if (!p.date) amber.add('Date');
    if (!xs.length && !amber.size) return [];
    return [{ fpd: p, sev: xs.length ? worst(xs) : 'WARN', missing: xs.length ? headlines(xs) : ['A product family field is blank'], amber }];
  });
}

export function gateRows(m: Model, factory: string): { cell: string; gate: string }[] {
  const cells = [...new Set([...m.cellLines.map((c) => ({ c: c.cell, f: c.factory })), ...m.assets.map((a) => ({ c: a.cell, f: a.factory }))].filter((x) => x.c && (factory === 'All' || x.f === factory)).map((x) => x.c))].sort();
  return cells.flatMap((c) => GP_GATES.filter((g) => GP_THEME_NUMS.some((t) => !m.assessor.gpRatings[gpRatingKey(c, g, t)])).map((g) => ({ cell: c, gate: g })));
}

// ------------------------------------------------------------------ export
const fillOf = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });
const thin = (argb: string) => ({ style: 'thin' as const, color: { argb } });

export function gapFileName(factory: string, today: string) { return `Factory_Data_Gaps_${factory.replace(/[^A-Za-z0-9_-]+/g, '-')}_${today}.xlsx`; }

export async function buildGapWorkbook(m: Model, issues: Issue[], factory: string, today: string): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Factory Dashboard & Flow Hub'; wb.created = new Date();
  // lists for dropdowns live on a hidden sheet so long lists never hit Excel's 255-character limit
  const lists = wb.addWorksheet('Lists', { state: 'hidden' });
  // dropdown lists: the valid shift names from the active Settings calendar (plus the standard names, which always resolve)
  const shifts = [...new Set<string>([...SHIFTS, ...Object.keys(m.settings.shiftHours).filter((name) => shiftHoursFor(m, name) !== null)])], classes = Object.keys(m.settings.limits), ratings = ['Met', 'Partial', 'Not met'];
  [shifts, classes, ratings].forEach((arr, c) => arr.forEach((v, r) => { lists.getCell(r + 1, c + 1).value = v; }));
  const ref = (c: number, n: number) => `Lists!$${'ABC'[c]}$1:$${'ABC'[c]}$${Math.max(1, n)}`;

  // ---- Tab 1: overview
  const ov = wb.addWorksheet(SHEET_OVERVIEW, { views: [{ showGridLines: false }] }); ov.columns = [{ width: 30 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 70 }];
  const line = (r: number, text: string, bold = false, size = 11) => { const c = ov.getCell(r, 1); c.value = text; c.font = { bold, size, color: { argb: 'FF0F172A' } }; c.alignment = { wrapText: false }; };
  line(1, `Factory data gaps: ${factory === 'All' ? 'All Factories' : factory}`, true, 16); line(2, `${m.programmeName || 'Untitled programme'} · exported ${today}`);
  line(4, 'How to complete this workbook', true, 13);
  ['1. Open the tabs “Cell & Asset Gaps”, “Product Flow (FPD) Gaps” and “Gate Readiness Gaps”.',
    '2. Grey/white boxes are existing data for context. Please leave them as they are.',
    '3. Type a value into every AMBER box. In the Shift Pattern, Complexity and gate rating boxes, pick from the dropdown.',
    '4. OEE can be typed as 68 or 0.68; both mean 68%. Leave a box empty if you do not know the answer yet: empty boxes are never imported.',
    '5. Save the workbook and import it back with “Import Filled Gaps (.xlsx)” in Factory Dashboard & Flow Hub, or drop it on the upload panel.',
    '6. Cell Design Passport reads the same “Cell & Asset Gaps” sheet: choose the cell to load, and the populated fields are mapped in without overwriting anything.',
    '7. Rows are matched by Factory + Cell ID + Asset (or Cell ID + Asset), so please do not rename those three columns’ values.'].forEach((t, i) => line(5 + i, t));
  line(13, 'Flags by factory', true, 13);
  const head = ov.getRow(14); ['Factory', 'ERROR', 'WARN', 'INFO'].forEach((h, i) => { const c = head.getCell(i + 1); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fillOf(HEAD); });
  const facs = [...new Set([...m.assets.map((a) => a.factory), ...m.cellLines.map((c) => c.factory), ...Object.keys(m.settings.plannedWeeks)].filter(Boolean))].filter((f) => factory === 'All' || f === factory);
  const tally = (f: string | null) => (['ERROR', 'WARN', 'INFO'] as Severity[]).map((s) => issues.filter((i) => { const fs = issueFactories(m, i); return i.severity === s && (f === null ? fs.length === 0 : fs.includes(f)); }).length);
  [...facs.map((f) => [f, ...tally(f)]), ['Programme-wide', ...tally(null)]].forEach((r, ri) => r.forEach((v, ci) => { const c = ov.getCell(15 + ri, ci + 1); c.value = v; c.border = { bottom: thin(BORDER) }; if (ci > 0) c.alignment = { horizontal: 'center' }; }));
  const factoryAssumptions = Object.entries(m.assumedFields ?? {}).filter(([k]) => k.startsWith('factory:') && (factory === 'All' || k.split(':')[1] === factory));
  factoryAssumptions.forEach(([k, why], i) => { const c = ov.getCell(20 + facs.length + i, 1); c.value = `${ASSUMPTION_NOTE}: Planned Weeks of ${k.split(':')[1]} (${why})`; c.fill = fillOf(AMBER); c.border = { top: thin(AMBER_BORDER), left: thin(AMBER_BORDER), bottom: thin(AMBER_BORDER), right: thin(AMBER_BORDER) }; });
  const totalRow = 15 + facs.length + 1; ov.getCell(totalRow, 1).value = 'Total'; ov.getCell(totalRow, 1).font = { bold: true };
  (['ERROR', 'WARN', 'INFO'] as Severity[]).forEach((s, i) => { const c = ov.getCell(totalRow, i + 2); c.value = issues.filter((x) => x.severity === s).length; c.font = { bold: true }; c.alignment = { horizontal: 'center' }; });

  const styleHeader = (ws: ExcelJS.Worksheet, n: number) => { const r = ws.getRow(1); r.height = 30; for (let c = 1; c <= n; c++) { const x = r.getCell(c); x.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }; x.fill = fillOf(HEAD); x.alignment = { vertical: 'middle', wrapText: true }; } ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }]; ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: n } }; };
  const paint = (cell: ExcelJS.Cell, amber: boolean) => { cell.fill = fillOf(amber ? AMBER : CONTEXT); cell.border = amber ? { top: thin(AMBER_BORDER), left: thin(AMBER_BORDER), bottom: thin(AMBER_BORDER), right: thin(AMBER_BORDER) } : { top: thin(BORDER), left: thin(BORDER), bottom: thin(BORDER), right: thin(BORDER) }; cell.alignment = { vertical: 'middle', wrapText: false }; };

  // ---- Tab 2: Cell & Asset Gaps (shared schema)
  const cs = wb.addWorksheet(SHEET_CELLS); cs.columns = CELL_COLS.map((h) => ({ header: h, width: h === 'What Is Missing' ? 54 : h === 'Cell Name' ? 24 : h.length < 10 ? 14 : 20 })); styleHeader(cs, CELL_COLS.length);
  cellAssetRows(m, issues).forEach((r, i) => {
    const row = cs.getRow(i + 2);
    CELL_COLS.forEach((h, ci) => {
      const cell = row.getCell(ci + 1); const ctx: Record<string, string | number> = { Factory: r.factory, 'Cell ID': r.cellId, 'Cell Name': r.cellName, Asset: r.asset, Severity: r.sev, 'What Is Missing': r.missing.join('; ') };
      cell.value = h in ctx ? ctx[h] : (r.vals[h] === '' ? null : r.vals[h] ?? null);
      paint(cell, r.amber.has(h));
      if (r.amber.has(h)) cell.font = { bold: true, color: { argb: 'FF78350F' } };
      if (h === 'Severity') cell.font = { bold: true, color: { argb: r.sev === 'ERROR' ? 'FFB91C1C' : r.sev === 'WARN' ? 'FFB45309' : 'FF1D4ED8' } };
      if (h === 'Shift Pattern' && r.asset) cell.dataValidation = { type: 'list', allowBlank: true, formulae: [ref(0, shifts.length)], showErrorMessage: false };
      if (h === 'Complexity' && r.asset) cell.dataValidation = { type: 'list', allowBlank: true, formulae: [ref(1, classes.length)], showErrorMessage: false };
    });
    row.height = 22;
  });

  // ---- Tab 3: FPD gaps
  const fs = wb.addWorksheet(SHEET_FPD); fs.columns = FPD_COLS.map((h) => ({ header: h, width: h === 'What Is Missing' ? 50 : h === 'Route Cells' ? 40 : h === 'Name' ? 28 : 16 })); styleHeader(fs, FPD_COLS.length);
  fpdRows(m, issues).forEach((r, i) => {
    const p = r.fpd, vals: Record<string, string | number | null> = { 'FPD ID': p.id, Severity: r.sev, 'What Is Missing': r.missing.join('; '), Name: p.name, 'Route Cells': p.route.join('; '), Hours: p.hours, Volume: p.volume, 'Working hrs/day': p.whd, Version: p.version, Date: p.date };
    FPD_COLS.forEach((h, ci) => { const c = fs.getRow(i + 2).getCell(ci + 1); c.value = vals[h] === '' ? null : vals[h]; paint(c, r.amber.has(h)); if (r.amber.has(h)) c.font = { bold: true, color: { argb: 'FF78350F' } }; });
  });

  // ---- Tab 4: Gate & Passport Status (GP schema: rows = cell × gate, columns = details + 5 themes)
  const gs = wb.addWorksheet(SHEET_GATES); gs.columns = GATE_COLS.map((h) => ({ header: h, width: h.startsWith('Theme') ? 32 : h === 'Cell ID' ? 26 : h === 'Date Reviewed' ? 16 : h === 'Headline Note' ? 44 : 16 })); styleHeader(gs, GATE_COLS.length);
  gateRows(m, factory).forEach((r, i) => GATE_COLS.forEach((h, ci) => {
    const c = gs.getRow(i + 2).getCell(ci + 1);
    if (h === 'Cell ID') { c.value = r.cell; paint(c, false); }
    else if (h === 'Gate') { c.value = r.gate; paint(c, false); }
    else if (h === 'Status') {
      const met = GP_THEME_NUMS.filter((t) => m.assessor.gpRatings[gpRatingKey(r.cell, r.gate, t)] === 'Met').length;
      const rated = GP_THEME_NUMS.filter((t) => !!m.assessor.gpRatings[gpRatingKey(r.cell, r.gate, t)]).length;
      c.value = rated === 0 ? 'NOT STARTED' : met === GP_THEME_NUMS.length ? `PASSED ${met}/${GP_THEME_NUMS.length}` : 'IN PROGRESS'; paint(c, false);
    } else if (h === 'Date Reviewed') { const v = m.assessor.gpDateReviewed[gpDateKey(r.cell, r.gate)] || null; c.value = v; paint(c, !v); if (!v) c.font = { bold: true, color: { argb: 'FF78350F' } }; }
    else if (h === 'Headline Note') { c.value = m.assessor.gpHeadlineNote[gpDateKey(r.cell, r.gate)] || null; paint(c, false); }
    else {
      const tNum = parseInt(h.replace(/^Theme (\d+):.*/, '$1'));
      if (tNum) { const v = m.assessor.gpRatings[gpRatingKey(r.cell, r.gate, tNum)] || null; c.value = v; c.dataValidation = { type: 'list', allowBlank: true, formulae: [ref(2, 3)], showErrorMessage: false }; paint(c, !v); if (!v) c.font = { bold: true, color: { argb: 'FF78350F' } }; }
    }
  }));
  const buf = await wb.xlsx.writeBuffer(); return new Uint8Array(buf as ArrayBuffer);
}

// ------------------------------------------------------------------ import
export interface GapImportReport { sheets: string[]; rowsSeen: number; assetsPatched: number; cellsPatched: number; fpdsPatched: number; ratingsSet: number; fieldsUpdated: number; unmatched: string[] }
export const looksLikeGapWorkbook = (wb: XLSX.WorkBook) => wb.SheetNames.some((n) => GAP_SHEETS.some((g) => norm(g) === norm(n))) && !wb.SheetNames.some((n) => norm(n) === 'data');
const sheetRows = (wb: XLSX.WorkBook, name: string): unknown[][] => { const real = wb.SheetNames.find((n) => norm(n) === norm(name)); return real ? XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[real], { header: 1, defval: '', raw: true }) : []; };
const toNum = (v: unknown): number | null => { if (typeof v === 'number') return Number.isFinite(v) ? v : null; const s = String(v ?? '').replace(/[£,\s]/g, ''); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
const str = (v: unknown) => String(v ?? '').trim();

function table(rows: unknown[][], must: string): { cols: Record<string, number>; body: unknown[][] } | null {
  const hr = rows.findIndex((r) => r.some((c) => key(c) === key(must))); if (hr < 0) return null;
  const cols: Record<string, number> = {}; rows[hr].forEach((h, i) => { const k = key(h); if (k && cols[k] === undefined) cols[k] = i; }); return { cols, body: rows.slice(hr + 1) };
}

/** Patches `d` in place: only populated cells are applied; empty cells never wipe existing data. */
export function applyFilledGaps(d: Model, wb: XLSX.WorkBook): GapImportReport {
  const rep: GapImportReport = { sheets: [], rowsSeen: 0, assetsPatched: 0, cellsPatched: 0, fpdsPatched: 0, ratingsSet: 0, fieldsUpdated: 0, unmatched: [] };
  // ---- Cell & Asset Gaps
  const t = table(sheetRows(wb, SHEET_CELLS), 'Cell ID');
  if (t) {
    rep.sheets.push(SHEET_CELLS); const c = t.cols; const get = (r: unknown[], k: string) => (c[key(k)] === undefined ? '' : r[c[key(k)]]);
    for (const r of t.body) {
      const cellId = str(get(r, 'Cell ID')), asset = str(get(r, 'Asset')), fac = str(get(r, 'Factory')).toUpperCase(); if (!cellId) continue; rep.rowsSeen++;
      let n = 0; const bump = (changed: boolean) => { if (changed) n++; };
      if (asset) {
        const a = d.assets.find((x) => norm(x.factory) === norm(fac) && norm(x.cell) === norm(cellId) && norm(x.asset) === norm(asset)) ?? d.assets.find((x) => norm(x.cell) === norm(cellId) && norm(x.asset) === norm(asset));
        if (!a) { rep.unmatched.push(`${fac || '?'} / ${cellId} / ${asset}`); continue; }
        const shift = str(get(r, 'Shift Pattern')); if (shift && shift !== a.shift) { a.shift = shift; a.modelShift = shift; n++; if (d.settings.shiftHours[shift] === undefined && !(SHIFTS as readonly string[]).includes(shift)) d.settings.shiftHours[shift] = null; }
        const cx = str(get(r, 'Complexity')); if (cx && cx !== a.complexity) { a.complexity = cx; n++; }
        const mach = toNum(get(r, 'Machines')); if (mach !== null && mach !== a.machines) { a.machines = mach; n++; }
        const oeeRaw = toNum(get(r, 'OEE (%)')); if (oeeRaw !== null) { const v = normalisePct(oeeRaw); if (Math.abs(v - (a.oee ?? -1)) > 1e-9) { a.oee = v; a.modelOee = v; n++; } }
        const load = toNum(get(r, 'Actual Load (hrs/yr)')); if (load !== null && load !== a.loadHrs) { a.loadHrs = load; a.modelLoad = load; n++; }
        const pl = toNum(get(r, 'Planned Losses (hrs/yr)')); if (pl !== null && pl !== a.plannedLosses) { a.plannedLosses = pl; a.modelPlannedLosses = pl; n++; }
        const dem = toNum(get(r, 'Demand (units/yr)')); if (dem !== null && dem !== a.demand) { a.demand = dem; n++; }
        const cap = toNum(get(r, 'CapEx (£)')); if (cap !== null && cap !== a.costPerMachine) { a.costPerMachine = cap; n++; }
        const fp = toNum(get(r, 'Footprint (m²)')); if (fp !== null && fp !== a.spacePerMachine) { a.spacePerMachine = fp; n++; }
        if (n) rep.assetsPatched++;
      } else {
        const cl = d.cellLines.find((x) => norm(x.factory) === norm(fac) && norm(x.cell) === norm(cellId)) ?? d.cellLines.find((x) => norm(x.cell) === norm(cellId));
        if (!cl) { rep.unmatched.push(`${fac || '?'} / ${cellId} (cell line)`); continue; }
        const set = (k: 'demandUnits' | 'vaHrs' | 'envaHrs' | 'nvaHrs' | 'inspectionHrs' | 'footprint', head: string) => { const v = toNum(get(r, head)); if (v !== null && v !== cl[k]) { cl[k] = v; bump(true); } };
        set('demandUnits', 'Demand (units/yr)'); set('vaHrs', 'VA (hrs)'); set('envaHrs', 'ENVA (hrs)'); set('nvaHrs', 'NVA (hrs)'); set('inspectionHrs', 'Inspection (hrs)'); set('footprint', 'Footprint (m²)');
        const ver = str(get(r, 'Passport Version')); if (ver && ver !== cl.version) { cl.version = ver; n++; }
        const dt = get(r, 'Passport Date'); const iso = typeof dt === 'number' && dt > 20000 ? new Date(Math.round((dt - 25569) * 86400000)).toISOString().slice(0, 10) : str(dt).slice(0, 10); if (iso && iso !== cl.date) { cl.date = iso; n++; }
        const nm = str(get(r, 'Cell Name')); if (nm && !cl.note) { cl.note = nm; n++; }
        if (n) rep.cellsPatched++;
      }
      rep.fieldsUpdated += n;
    }
  }
  // ---- Product Flow (FPD) Gaps
  const f = table(sheetRows(wb, SHEET_FPD), 'FPD ID');
  if (f) {
    rep.sheets.push(SHEET_FPD); const c = f.cols; const get = (r: unknown[], k: string) => (c[key(k)] === undefined ? '' : r[c[key(k)]]);
    for (const r of f.body) {
      const id = str(get(r, 'FPD ID')); if (!id) continue; rep.rowsSeen++;
      const p = d.fpds.find((x) => norm(x.id) === norm(id)); if (!p) { rep.unmatched.push(`${id} (product family)`); continue; }
      let n = 0;
      const nm = str(get(r, 'Name')); if (nm && nm !== p.name) { p.name = nm; n++; }
      const route = str(get(r, 'Route Cells')).split(/[;|>]/).map((x) => x.trim()).filter(Boolean); if (route.length && route.join('|') !== p.route.join('|')) { p.route = route; p.cell = route[0]; n++; }
      for (const [k, head] of [['hours', 'Hours'], ['volume', 'Volume'], ['whd', 'Working hrs/day']] as const) { const v = toNum(get(r, head)); if (v !== null && v !== p[k]) { p[k] = v; n++; } }
      const ver = str(get(r, 'Version')); if (ver && ver !== p.version) { p.version = ver; n++; }
      const dt = get(r, 'Date'); const iso = typeof dt === 'number' && dt > 20000 ? new Date(Math.round((dt - 25569) * 86400000)).toISOString().slice(0, 10) : str(dt).slice(0, 10); if (iso && iso !== p.date) { p.date = iso; n++; }
      if (n) { rep.fpdsPatched++; rep.fieldsUpdated += n; }
    }
  }
  // ---- Gate & Passport Status (GP schema)
  const g = table(sheetRows(wb, SHEET_GATES), 'Gate');
  if (g) {
    rep.sheets.push(SHEET_GATES);
    for (const r of g.body) {
      const cell = str(r[g.cols[key('Cell ID')] ?? -1]), gate = str(r[g.cols[key('Gate')] ?? -1]); if (!cell || !gate) continue; rep.rowsSeen++;
      const dk = gpDateKey(cell, gate);
      const dtRaw = r[g.cols[key('Date Reviewed')] ?? -1]; const dt = typeof dtRaw === 'number' && dtRaw > 20000 ? new Date(Math.round((dtRaw - 25569) * 86400000)).toISOString().slice(0, 10) : str(dtRaw).slice(0, 10); if (dt && d.assessor.gpDateReviewed[dk] !== dt) { d.assessor.gpDateReviewed[dk] = dt; rep.fieldsUpdated++; }
      const note = str(r[g.cols[key('Headline Note')] ?? -1]); if (note && d.assessor.gpHeadlineNote[dk] !== note) { d.assessor.gpHeadlineNote[dk] = note; rep.fieldsUpdated++; }
      for (const tNum of GP_THEME_NUMS) {
        const colIdx = Object.entries(g.cols).find(([k]) => k.startsWith(`theme${tNum}`))?.[1]; if (colIdx === undefined) continue;
        const raw = str(r[colIdx]).toLowerCase(); const v: Rating = raw === 'met' ? 'Met' : raw.startsWith('part') ? 'Partial' : raw.replace(/\s/g, '') === 'notmet' ? 'Not met' : '';
        if (!v) continue; const rk = gpRatingKey(cell, gate, tNum);
        if (d.assessor.gpRatings[rk] !== v) { d.assessor.gpRatings[rk] = v; rep.ratingsSet++; rep.fieldsUpdated++; if (!d.assessor.cells.includes(cell)) d.assessor.cells.push(cell); }
      }
    }
  }
  return rep;
}
