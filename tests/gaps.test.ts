import ExcelJS from 'exceljs/dist/exceljs.bare.min.js';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { runChecks } from '../src/engine/checks';
import { applyFilledGaps, buildGapWorkbook, cellAssetRows, CELL_COLS, FPD_COLS, gapFileName, GAP_SHEETS, looksLikeGapWorkbook, SHEET_CELLS, SHEET_FPD, SHEET_GATES, SHEET_OVERVIEW } from '../src/engine/gaps';
import { gpRatingKey } from '../src/engine/governance';
import { scopeChecks } from '../src/engine/overview';
import { parseWorkbook } from '../src/engine/xlsx';
import { demoModel } from './fixtures/sample';

const m0 = () => { const m = demoModel(); m.fpds[1].hours = null; m.fpds[1].volume = null; m.fpds[3].name = ''; return m; };
const load = async (bytes: Uint8Array) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes as unknown as ArrayBuffer); return wb; };
const sheetWb = (bytes: Uint8Array) => XLSX.read(bytes, { type: 'array' });

describe('Export Gaps (.xlsx)', () => {
  it('file name carries the factory filter and the date', () => { expect(gapFileName('HT', '2026-11-20')).toBe('Factory_Data_Gaps_HT_2026-11-20.xlsx'); expect(gapFileName('All', '2026-11-20')).toBe('Factory_Data_Gaps_All_2026-11-20.xlsx'); });
  it('has the four tabs with the shared schema headers', async () => {
    const m = m0(); const bytes = await buildGapWorkbook(m, runChecks(m, '2026-01-01').issues, 'All', '2026-11-20'); const wb = sheetWb(bytes);
    expect(wb.SheetNames.filter((n) => n !== 'Lists')).toEqual([SHEET_OVERVIEW, SHEET_CELLS, SHEET_FPD, SHEET_GATES]);
    const cells = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[SHEET_CELLS], { header: 1 }); expect(cells[0]).toEqual([...CELL_COLS]);
    expect((XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[SHEET_FPD], { header: 1 })[0])).toEqual([...FPD_COLS]);
    expect(['Factory', 'Cell ID', 'Cell Name', 'Asset', 'Severity', 'What Is Missing', 'Shift Pattern', 'Complexity', 'Machines', 'OEE (%)', 'Actual Load (hrs/yr)', 'Planned Losses (hrs/yr)', 'Demand (units/yr)', 'VA (hrs)', 'ENVA (hrs)', 'NVA (hrs)', 'Inspection (hrs)', 'CapEx (£)', 'Footprint (m²)']).toEqual(CELL_COLS.slice(0, 19));
  });
  it('is sorted Factory → Cell ID → Asset with the cell line first', () => {
    const rows = cellAssetRows(m0(), runChecks(m0(), '2026-01-01').issues); const keys = rows.map((r) => `${r.factory}|${r.cellId}|${r.asset}`);
    expect(keys).toEqual([...keys].sort((a, b) => { const [fa, ca, aa] = a.split('|'), [fb, cb, ab] = b.split('|'); return fa.localeCompare(fb) || ca.localeCompare(cb) || (aa === '' ? -1 : ab === '' ? 1 : aa.localeCompare(ab)); }));
  });
  it('colours only missing/flagged cells amber (#FEF3C7) and existing values soft grey (#F8FAFC)', async () => {
    const m = m0(); m.assets[2].shift = ''; m.assets[2].modelShift = ''; m.assets[2].oee = null; m.assets[2].modelOee = null; m.assets[2].passportOee = null;
    const wb = await load(await buildGapWorkbook(m, runChecks(m, '2026-01-01').issues, 'All', '2026-11-20')); const ws = wb.getWorksheet(SHEET_CELLS)!;
    const argb = (c: ExcelJS.Cell) => (c.fill as ExcelJS.FillPattern)?.fgColor?.argb; const col = (n: string) => (CELL_COLS as readonly string[]).indexOf(n) + 1;
    let seen = false;
    ws.eachRow((row, n) => { if (n > 1 && row.getCell(4).value === 'Temper Oven') { seen = true;
      expect(argb(row.getCell(col('Shift Pattern')))).toBe('FFFEF3C7'); expect(argb(row.getCell(col('OEE (%)')))).toBe('FFFEF3C7'); expect(row.getCell(col('Shift Pattern')).border?.top?.style).toBe('thin');
      expect(argb(row.getCell(col('Machines')))).toBe('FFF8FAFC'); expect(argb(row.getCell(col('Actual Load (hrs/yr)')))).toBe('FFF8FAFC'); expect(argb(row.getCell(col('Factory')))).toBe('FFF8FAFC'); } });
    expect(seen).toBe(true);
  });
  it('adds Excel dropdowns for Shift Pattern, Complexity and gate ratings', async () => {
    const m = m0(); m.assets[2].shift = ''; const zip = await JSZip.loadAsync(await buildGapWorkbook(m, runChecks(m, '2026-01-01').issues, 'All', '2026-11-20'));
    const sheets = Object.keys(zip.files).filter((f) => /xl\/worksheets\/sheet\d+\.xml$/.test(f)); const xml = await Promise.all(sheets.map((f) => zip.file(f)!.async('string')));
    const withDd = xml.filter((x) => x.includes('<dataValidation ') && x.includes('type="list"')); expect(withDd.length).toBeGreaterThanOrEqual(2); expect(withDd.join('')).toMatch(/Lists!\$[ABC]\$1:\$[ABC]\$\d+/);
    const lists = XLSX.utils.sheet_to_json<unknown[]>(sheetWb(await buildGapWorkbook(m, runChecks(m, '2026-01-01').issues, 'All', 'x')).Sheets.Lists, { header: 1 }).flat(); ['2 Shifts', '4 Shifts', 'Continuous 24/7', 'Standard', 'Met', 'Partial', 'Not met'].forEach((v) => expect(lists).toContain(v));
  });
  it('overview tab lists ERROR / WARN / INFO counts by factory', async () => {
    const m = m0(); const wb = sheetWb(await buildGapWorkbook(m, runChecks(m, '2026-01-01').issues, 'All', '2026-11-20'));
    const txt = JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets[SHEET_OVERVIEW], { header: 1 })); expect(txt).toContain('How to complete'); expect(txt).toContain('AMBER'); expect(txt).toContain('HT'); expect(txt).toContain('DPF'); expect(txt).toContain('Programme-wide'); expect(txt).toContain('Cell Design Passport');
  });
  it('respects the active factory filter', async () => {
    const m = m0(); const all = runChecks(m, '2026-01-01'); const ht = scopeChecks(m, all, 'HT');
    const rows = (issues: typeof all.issues) => cellAssetRows(m, issues); expect(rows(ht.issues).every((r) => r.factory === 'HT')).toBe(true); expect(rows(ht.issues).length).toBeLessThan(rows(all.issues).length);
    const wb = sheetWb(await buildGapWorkbook(m, ht.issues, 'HT', '2026-11-20')); const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[SHEET_CELLS]); expect(data.every((r) => r.Factory === 'HT')).toBe(true);
  });
});

describe('Import Filled Gaps (.xlsx)', () => {
  /** Fills the amber boxes the way an engineer would, by editing the exported workbook. */
  async function fill(m: ReturnType<typeof m0>, edit: (wb: ExcelJS.Workbook) => void) { const wb = await load(await buildGapWorkbook(m, runChecks(m, '2026-01-01').issues, 'All', '2026-11-20')); edit(wb); return XLSX.read(new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer), { type: 'array' }); }
  const colOf = (n: string) => (CELL_COLS as readonly string[]).indexOf(n) + 1;

  it('recognises the gap workbook by its sheet names (and not a normal project workbook)', async () => {
    const m = m0(); const wb = sheetWb(await buildGapWorkbook(m, runChecks(m, '2026-01-01').issues, 'All', '2026-11-20')); expect(looksLikeGapWorkbook(wb)).toBe(true);
    expect(GAP_SHEETS.every((s) => wb.SheetNames.includes(s))).toBe(true); expect(looksLikeGapWorkbook(XLSX.utils.book_new())).toBe(false);
    const proj = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(proj, XLSX.utils.aoa_to_sheet([['Factory']]), 'Data'); XLSX.utils.book_append_sheet(proj, XLSX.utils.aoa_to_sheet([['x']]), SHEET_CELLS); expect(looksLikeGapWorkbook(proj)).toBe(false);
  });
  it('patches filled cells, recalculates, and resolves flags without touching other data', async () => {
    const m = m0(); m.assets[8].oee = null; m.assets[8].modelOee = null; const before = runChecks(m, '2026-01-01').counts; const snapshot = JSON.stringify(m.assets.map((a) => [a.id, a.loadHrs, a.machines]));
    const wb = await fill(m, (x) => { const ws = x.getWorksheet(SHEET_CELLS)!; ws.eachRow((r, n) => { if (n > 1 && r.getCell(4).value === 'CMM Inspection') { r.getCell(colOf('Actual Load (hrs/yr)')).value = 1234; r.getCell(colOf('OEE (%)')).value = 71; } if (n > 1 && !r.getCell(4).value && r.getCell(2).value === '07_DPF_MACHN') r.getCell(colOf('Demand (units/yr)')).value = 400; if (n > 1 && !r.getCell(4).value && r.getCell(2).value === '04_DPF_WELDG') r.getCell(colOf('Passport Date')).value = '2026-01-10'; }); });
    const d = structuredClone(m); const rep = applyFilledGaps(d, wb); const cmm = d.assets.find((a) => a.asset === 'CMM Inspection')!;
    expect(cmm.loadHrs).toBe(1234); expect(cmm.modelLoad).toBe(1234); expect(cmm.oee).toBeCloseTo(0.71); expect(cmm.modelOee).toBeCloseTo(0.71);
    expect(d.cellLines.find((c) => c.cell === '07_DPF_MACHN')!.demandUnits).toBe(400);
    expect(rep.fieldsUpdated).toBeGreaterThanOrEqual(4); expect(rep.unmatched).toEqual([]);
    const other = d.assets.filter((a) => a.asset !== 'CMM Inspection'); expect(JSON.stringify(other.map((a) => [a.id, a.loadHrs, a.machines]))).toBe(JSON.stringify(m.assets.filter((a) => a.asset !== 'CMM Inspection').map((a) => [a.id, a.loadHrs, a.machines])));
    expect(d.cellLines.find((c) => c.cell === '04_DPF_WELDG')!.date).toBe('2026-01-10'); expect(snapshot).toContain('A9'); const after = runChecks(d, '2026-01-01').counts; expect(after.ERROR + after.WARN).toBeLessThan(before.ERROR + before.WARN);
  });
  it('empty boxes never wipe existing data, and re-importing an unchanged export changes nothing', async () => {
    const m = m0(); const wb = await fill(m, () => undefined); const d = structuredClone(m); const rep = applyFilledGaps(d, wb);
    expect(rep.fieldsUpdated).toBe(0); expect(JSON.stringify(d)).toBe(JSON.stringify(m));
    const wb2 = await fill(m, (x) => { x.getWorksheet(SHEET_CELLS)!.eachRow((r, n) => { if (n > 1) r.getCell(colOf('Machines')).value = null; }); }); const d2 = structuredClone(m); applyFilledGaps(d2, wb2); expect(JSON.stringify(d2.assets.map((a) => a.machines))).toBe(JSON.stringify(m.assets.map((a) => a.machines)));
  });
  it('matches by Factory + Cell ID + Asset, falling back to Cell ID + Asset, and reports unmatched rows', async () => {
    const m = m0(); m.assets[8].oee = null; m.assets[8].modelOee = null; const wb = await fill(m, (x) => { const ws = x.getWorksheet(SHEET_CELLS)!; ws.eachRow((r, n) => { if (n > 1 && r.getCell(4).value === 'CMM Inspection') { r.getCell(1).value = 'WRONG'; r.getCell(colOf('Actual Load (hrs/yr)')).value = 999; } });
      const nr = ws.addRow([]); nr.getCell(1).value = 'HT'; nr.getCell(2).value = 'NO_SUCH_CELL'; nr.getCell(4).value = 'Ghost'; nr.getCell(colOf('Machines')).value = 3; });
    const d = structuredClone(m); const rep = applyFilledGaps(d, wb); expect(d.assets.find((a) => a.asset === 'CMM Inspection')!.loadHrs).toBe(999); expect(rep.unmatched.length).toBe(1); expect(rep.unmatched[0]).toContain('Ghost');
  });
  it('accepts OEE as 68 or 0.68 and applies shift and complexity dropdown values', async () => {
    const m = m0(); m.assets[8].oee = null; m.assets[8].modelOee = null; m.assets[2].shift = ''; m.assets[2].modelShift = '';
    const wb = await fill(m, (x) => { x.getWorksheet(SHEET_CELLS)!.eachRow((r, n) => { if (n > 1 && r.getCell(4).value === 'Temper Oven') { r.getCell(colOf('Shift Pattern')).value = '4 Shifts'; r.getCell(colOf('OEE (%)')).value = 0.68; } if (n > 1 && r.getCell(4).value === 'CMM Inspection') r.getCell(colOf('OEE (%)')).value = 68; }); });
    const d = structuredClone(m); applyFilledGaps(d, wb); const t = d.assets.find((a) => a.asset === 'Temper Oven')!; expect(t.shift).toBe('4 Shifts'); expect(t.oee).toBeCloseTo(0.68); expect(d.assets.find((a) => a.asset === 'CMM Inspection')!.oee).toBeCloseTo(0.68);
  });
  it('patches product-family gaps and gate ratings, adding rated cells to the Assessor', async () => {
    const m = m0(); m.assessor.cells = [];
    const wb = await fill(m, (x) => { const f = x.getWorksheet(SHEET_FPD)!; f.eachRow((r, n) => { if (n > 1 && r.getCell(1).value === 'FPD-02') { r.getCell(FPD_COLS.indexOf('Hours') + 1).value = 800; r.getCell(FPD_COLS.indexOf('Volume') + 1).value = 100; r.getCell(FPD_COLS.indexOf('Route Cells') + 1).value = '02_HTMF_UTAQW; 04_DPF_WELDG'; } if (n > 1 && r.getCell(1).value === 'FPD-04') r.getCell(FPD_COLS.indexOf('Name') + 1).value = 'Finish machining';});
      const g = x.getWorksheet(SHEET_GATES)!; g.eachRow((r, n) => { if (n > 1 && r.getCell(1).value === '07_DPF_MACHN') { if (r.getCell(2).value === 'Define') r.getCell(7).value = 'Met'; if (r.getCell(2).value === 'Concept') r.getCell(7).value = 'Partial'; } }); });
    const d = structuredClone(m); const rep = applyFilledGaps(d, wb);
    expect(d.fpds[1].hours).toBe(800); expect(d.fpds[1].volume).toBe(100); expect(d.fpds[3].name).toBe('Finish machining'); expect(d.fpds[1].route).toEqual(['02_HTMF_UTAQW', '04_DPF_WELDG']); expect(d.fpds[1].cell).toBe('02_HTMF_UTAQW');
    expect(d.assessor.gpRatings[gpRatingKey('07_DPF_MACHN', 'Define', 3)]).toBe('Met'); expect(d.assessor.gpRatings[gpRatingKey('07_DPF_MACHN', 'Concept', 3)]).toBe('Partial'); expect(d.assessor.cells).toContain('07_DPF_MACHN'); expect(rep.ratingsSet).toBe(2); expect(rep.fpdsPatched).toBe(2);
  });
});

describe('false DC26 errors on blank Lead time template rows', () => {
  const wbOf = (fpd: unknown[][], links: unknown[][]) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fpd), 'FPD'); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(links), 'Lead time'); return parseWorkbook(wb, 't').model; };
  const F = [['FPD', 'Name', 'Cell', 'Hours', 'Volume'], ['FPD-01', 'Real', 'C1', 100, 10], ['FPD-02', 'XXX', '', '', ''], ['FPD-03', '', '', '', '']];
  it.each([
    ['blank parent and child', [['', '', '', '', '', '']]], ['XXX placeholders', [['XXX', 'XXX', '', '', '', '']]], ['one side blank', [['FPD-01', '', '', '', '', '']]],
    ['self-loop on a template FPD', [['FPD-02', 'FPD-02', '', '', '', '']]], ['links between unpopulated template FPDs', [['FPD-02', 'FPD-03', '', '', '', '']]],
    ['untyped link naming an FPD that does not exist', [['FPD-01', 'FPD-09', '', '', '', '']]], ['untyped self-loop on a real FPD', [['FPD-01', 'FPD-01', '', '', '', '']]],
  ])('ignores %s', (_n, rows) => { const m = wbOf(F, [['Parent FPD', 'Child FPD', 'Start rule', 'N / Overlap %', 'Transfer days', 'Adjust in takts'], ...rows]); expect(m.links.length).toBe(0); expect(runChecks(m).perRule.DC26).toBe(0); });
  it('still flags links that were really filled in', () => {
    const head = ['Parent FPD', 'Child FPD', 'Start rule', 'N / Overlap %', 'Transfer days', 'Adjust in takts'];
    expect(runChecks(wbOf(F, [head, ['FPD-01', 'FPD-01', 'Complete', '', 2, '']])).perRule.DC26).toBeGreaterThan(0);
    expect(runChecks(wbOf(F, [head, ['FPD-01', 'FPD-09', 'Complete', '', 1, '']])).perRule.DC26).toBeGreaterThan(0);
  });
});

describe('Shift Pattern highlighting and dropdown in Export Gaps', () => {
  const argb = (c: ExcelJS.Cell) => (c.fill as ExcelJS.FillPattern)?.fgColor?.argb ?? '';
  const col = (CELL_COLS as readonly string[]).indexOf('Shift Pattern') + 1;
  async function shiftFills(m: ReturnType<typeof demoModel>) {
    const wb = await load(await buildGapWorkbook(m, runChecks(m, '2026-01-01').issues, 'All', '2026-11-20')); const out: Record<string, string> = {};
    wb.getWorksheet(SHEET_CELLS)!.eachRow((r, n) => { if (n > 1 && r.getCell(4).value) out[String(r.getCell(4).value)] = argb(r.getCell(col)); }); return out;
  }
  it('is amber only when blank or unresolvable; standard labels resolve even with an empty calendar', async () => {
    const m = demoModel(); m.settings.shiftHours = {}; m.assets[0].shift = 'two shift'; m.assets[2].shift = ''; m.assets[3].shift = 'Mystery pattern'; m.assets[8].shift = 'Continuous 24/7';
    // make every asset appear in the sheet so the shift cell can be inspected
    const issues = m.assets.map((a) => ({ rule: 'DC27', severity: 'WARN' as const, message: `${a.asset}: x`, target: { ws: 2, kind: 'asset' as const, ref: a.id } }));
    const wb = await load(await buildGapWorkbook(m, issues, 'All', '2026-11-20')); const fills: Record<string, string> = {};
    wb.getWorksheet(SHEET_CELLS)!.eachRow((r, n) => { if (n > 1 && r.getCell(4).value) fills[String(r.getCell(4).value)] = argb(r.getCell(col)); });
    expect(fills[m.assets[0].asset]).toBe('FFF8FAFC'); expect(fills[m.assets[8].asset]).toBe('FFF8FAFC'); expect(fills[m.assets[1].asset]).toBe('FFF8FAFC');
    expect(fills[m.assets[2].asset]).toBe('FFFEF3C7'); expect(fills[m.assets[3].asset]).toBe('FFFEF3C7');
  });
  it('is not highlighted merely because a different rule flagged the asset (e.g. missing planned weeks)', async () => {
    const m = demoModel(); m.settings.plannedWeeks.HT = null; const f = await shiftFills(m); expect(Object.values(f).every((v) => v !== 'FFFEF3C7')).toBe(true);
  });
  it('dropdown lists valid calendar shift names and leaves out unresolved custom ones', async () => {
    const m = demoModel(); m.settings.shiftHours = { 'Early + Late': 72, 'Nights only': null, '2 Shifts': 78 };
    const lists = XLSX.utils.sheet_to_json<unknown[]>(sheetWb(await buildGapWorkbook(m, runChecks(m, '2026-01-01').issues, 'All', 'x')).Sheets.Lists, { header: 1 }).flat();
    expect(lists).toContain('Early + Late'); expect(lists).toContain('2 Shifts'); expect(lists).toContain('3 Shifts'); expect(lists).not.toContain('Nights only');
  });
});
