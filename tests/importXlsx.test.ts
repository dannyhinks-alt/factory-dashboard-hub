import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { cells, compareRows, timeSplit } from '../src/engine/calc';
import { runChecks } from '../src/engine/checks';
import { classify, headKey, parseDataSheet } from '../src/engine/importXlsx';
import { readWorkbook } from '../src/engine/xlsx';
import { scopedCells } from '../src/engine/story';

const BANNER = ['FACTORY > CELL > ASSET', '', '', '', '', '', 'FACTORY MODEL', '', '', '', '', 'ASSET LINE: PASSPORT (OEE-adjusted)', '', '', '', '', '', '', '', '', '', ''];
const HEAD = ['Factory', 'Cell', 'Asset\n(blank on a cell line)', 'Note', 'Demand (units / yr),\r\n optional, per cell', 'Quantity', 'Complexity class', 'Model Shift', 'Model OEE %', 'Model Planned losses', 'Model Load',
  'Utilisation', 'OEE %', 'Shift  pattern', 'Planned losses (hrs/yr)', 'Actual load (hrs/yr)', 'Operation quantity', 'VA (hrs/yr)', 'ENVA (hrs/yr)', 'NVA (hrs/yr)', 'Inspection (hrs/yr)', 'Extra footprint'];
const pad = (r: unknown[]) => [...r, ...Array(22 - r.length).fill('')];
// cell line, then a Passport-only asset line (nothing in the Factory Model block)
const CELL = pad(['HT', '02_HTMF_UTAQW', '', 'Heat treat', 300, '', '', '', '', '', '', '', '', '', '', '', '', 1200, 500, 300, 100, 12]);
const ASSET = pad(['HT', '02_HTMF_UTAQW', 'Furnace A', '', '', 2, 'Standard', '', '', '', '', 0.6, 0.68, '2 Shifts', 0, 1909, 4, '', '', '', '', '']);

const book = (hidden = false) => {
  const ws = XLSX.utils.aoa_to_sheet([['LEAN CELL DESIGN'], [], BANNER, HEAD, CELL, ASSET]);
  ws['!merges'] = [{ s: { r: 2, c: 11 }, e: { r: 2, c: 21 } }];
  if (hidden) ws['!cols'] = HEAD.map((_, i) => ({ hidden: i >= 6 && i <= 10 }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Label', 'Value'], ['Planned Weeks HT', 46]]), 'Settings');
  return wb;
};
const load = (hidden = false) => readWorkbook(XLSX.write(book(hidden), { type: 'array', bookType: 'xlsx' }), 'exact.xlsx').model;

describe('exact Data-sheet layout', () => {
  it('normalises multi-line headers and drops helper notes', () => {
    expect(headKey('Asset\n(blank on a cell line)')).toBe('asset'); expect(headKey('Demand (units / yr),\r\n optional')).toBe('demand'); expect(headKey('Shift  pattern')).toBe('shiftpattern');
    expect(classify('Quantity', 'model')).toBe('qtyModel'); expect(classify('OEE %', 'passport')).toBe('passportOee'); expect(classify('OEE %', 'model')).toBe('modelOee');
    expect(classify('Actual load (hrs/yr)', 'passport')).toBe('passportLoadHrs'); expect(classify('Operation quantity', 'passport')).toBe('operationQty');
  });
  it('maps every column by header and banner', () => {
    const r = parseDataSheet([['t'], [], BANNER, HEAD, CELL, ASSET]); expect(r.hadBanner).toBe(true);
    expect(r.cellLines.length).toBe(1); expect(r.assets.length).toBe(1);
    const c = r.cellLines[0]; expect([c.note, c.demandUnits, c.vaHrs, c.envaHrs, c.nvaHrs, c.inspectionHrs, c.extraFootprint]).toEqual(['Heat treat', 300, 1200, 500, 300, 100, 12]); expect(c.passport).toBe(true);
    const a = r.assets[0];
    expect([a.machines, a.passportOee, a.passportShift, a.passportPlannedLosses, a.passportLoadHrs, a.operationQty, a.passportUtilisation, a.complexity]).toEqual([2, 0.68, '2 Shifts', 0, 1909, 4, 0.6, 'Standard']);
    expect([a.modelOee, a.modelLoad, a.modelShift]).toEqual([null, null, '']);
  });
  it('passport-only rows fill the active fields without gaps', () => {
    const a = load().assets[0];
    expect([a.machines, a.shift, a.oee, a.plannedLosses, a.loadHrs]).toEqual([2, '2 Shifts', 0.68, 0, 1909]);
  });
  it('hidden columns are still imported', () => { const a = load(true).assets[0]; expect([a.machines, a.oee, a.loadHrs]).toEqual([2, 0.68, 1909]); });
  it('dashboard computes headroom, utilisation and VA/ENVA/NVA for every Source', () => {
    const m = load(); m.settings.limits = { Standard: 0.65 };
    for (const source of ['Both', 'Passport', 'Model'] as const) {
      const cs = scopedCells(m, { factory: 'All', topN: 10, source, board: 'All', sort: 'Worst first', show: 'Headroom', uplift: 'Typical' });
      expect(cs[0].headroom, source).not.toBeNull(); expect(cs[0].bottleneck!.effUtil).not.toBeNull();
    }
    const eff = 1909 / (46 * 80 * 2 * 0.68); expect(cells(m, 'model')[0].bottleneck!.effUtil).toBeCloseTo(eff, 9); expect(cells(m, 'passport')[0].headroom).toBeCloseTo(1 - eff / 0.65, 9);
    const t = timeSplit(m, 'All'); expect([t.va, t.enva, t.nva]).toEqual([1200, 500, 300]);
  });
  it('compare flags the un-paired Passport asset without hiding its numbers (check 11)', () => {
    const m = load(); const row = compareRows(m)[0];
    expect(row.align).toBe('NO PAIR'); expect(row.passport).not.toBeNull(); expect(row.restated).toBeNull();
    expect(runChecks(m).issues.some((i) => i.rule === 'DC11' && /Furnace A/.test(i.message))).toBe(true);
    const a = m.assets[0]; expect(runChecks(m).issues.some((i) => /machines|shift|OEE|load/i.test(i.message) && ['DC03', 'DC07', 'DC10', 'DC12'].includes(i.rule) && i.target?.ref === a.id && i.rule !== 'DC03')).toBe(false);
  });
});

import { importSummary } from '../src/engine/importXlsx';
import { SHIFTS } from '../src/engine/constants';

describe('column variants and import summary', () => {
  const rowsWith = (qtyHeader: string) => {
    const head = [...HEAD]; head[5] = qtyHeader;
    return [['t'], [], BANNER, head, CELL, ASSET, pad(['HT', '02_HTMF_UTAQW', 'Quench', '', '', 1, 'Standard', '3 Shifts', 0.85, 0, 2400, '', 0.7, '3 Shifts', 0, 2330])];
  };
  it('Quantity, Machines and No. of machines all map to machines', () => {
    for (const h of ['Quantity', 'Machines', 'No. of machines']) { const r = parseDataSheet(rowsWith(h)); expect(r.assets.map((a) => a.machines), h).toEqual([2, 1]); }
  });
  it('model and passport values stay separate and the model value wins as active', () => {
    const q = parseDataSheet(rowsWith('Quantity')).assets[1];
    expect([q.modelOee, q.passportOee, q.oee, q.modelLoad, q.passportLoadHrs, q.loadHrs, q.shift]).toEqual([0.85, 0.7, 0.85, 2400, 2330, 2400, '3 Shifts']);
  });
  it('finds the banner and header within the first 15 rows only', () => {
    const lead = Array.from({ length: 10 }, () => ['']); expect(parseDataSheet([...lead, ...rowsWith('Quantity')]).assets.length).toBe(2);
    const far = Array.from({ length: 20 }, () => ['']); expect(parseDataSheet([...far, ...rowsWith('Quantity')]).assets.length).toBe(0);
  });
  it('import summary counts model and passport cells and assets', () => {
    const m = readWorkbook(XLSX.write(book(), { type: 'array', bookType: 'xlsx' }), 'x').model;
    expect(importSummary(m)).toMatchObject({ modelCells: 0, passportCells: 1, modelAssets: 0, passportAssets: 1, cellLines: 1, assetLines: 1 });
    const two = parseDataSheet(rowsWith('Quantity')); const mm = { ...m, assets: two.assets, cellLines: two.cellLines };
    expect(importSummary(mm)).toMatchObject({ modelCells: 1, passportCells: 1, modelAssets: 1, passportAssets: 2 });
  });
  it('shift pattern list supports 1 to 6 shifts, continuous and Saturday patterns', () => {
    for (const s of ['1 Shift', '2 Shifts', '3 Shifts', '4 Shifts', '5 Shifts', '6 Shifts', 'Continuous 24/7', '2 Shifts + Sat', '3 Shifts + Sat']) expect(SHIFTS as readonly string[]).toContain(s);
  });
});
