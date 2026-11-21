import ExcelJS from 'exceljs/dist/exceljs.bare.min.js';
import { describe, expect, it } from 'vitest';
import { runChecks } from '../src/engine/checks';
import { calcAsset, cells } from '../src/engine/calc';
import { DEFAULT_RULES, applyWizard, assetKey, assumedCount, factoryKey, fieldValue, pruneAssumed, revertUnverified, scanGaps, validShiftNames } from '../src/engine/assumed';
import { normaliseModel } from '../src/engine/normalise';
import { ASSUMPTION_NOTE, buildGapWorkbook, CELL_COLS, SHEET_CELLS } from '../src/engine/gaps';
import { deserialise, readCachedSession, serialise } from '../src/persist';
import { injectEmbeddedState, pickBootState } from '../src/selfSave';
import { demoModel } from './fixtures/sample';

/** A project with the kinds of blanks the wizard targets. */
const blanky = () => { const m = demoModel(); m.sourceName = 'Real.xlsx'; m.settings.plannedWeeks = { HT: null, DPF: 46 }; m.assets[0].shift = ''; m.assets[0].modelShift = ''; m.assets[1].complexity = ''; m.assets[2].oee = null; m.assets[2].modelOee = null; m.assets[2].passportOee = null; m.assets[3].shift = ''; m.assets[3].modelShift = ''; return m; };
const ALL = { factory: 'All' };

describe('Gap Auto-Fill Wizard', () => {
  it('scans the blanks that block calculations', () => {
    const s = scanGaps(blanky(), ALL); expect(s.factories).toEqual(['HT']); expect(s.shiftAssets.length).toBe(2); expect(s.complexityAssets.length).toBe(1); expect(s.oeeAssets.length).toBe(1);
    const dpf = scanGaps(blanky(), { factory: 'DPF' }); expect(dpf.factories).toEqual([]); expect(dpf.shiftAssets.length).toBe(1);
  });
  it('defaults: 48 weeks, 2 Shifts, Complex ticked; Global OEE 70% ticked', () => { expect(DEFAULT_RULES).toEqual({ plannedWeeks: { on: true, weeks: 48 }, shift: { on: true, pattern: '2 Shifts' }, complexity: { on: true, className: 'Complex' }, oee: { on: true, fraction: 0.70 } }); });
  it('fills only ticked rules, only blanks, and records provenance with labels', () => {
    const m = blanky(); const before = structuredClone(m); const rep = applyWizard(m, ALL, DEFAULT_RULES);
    expect(rep).toMatchObject({ plannedWeeks: 1, shift: 2, complexity: 1, oee: 1, total: 5 });
    expect(m.settings.plannedWeeks.HT).toBe(48); expect(m.settings.plannedWeeks.DPF).toBe(46); expect(m.assets[0].shift).toBe('2 Shifts'); expect(m.assets[0].modelShift).toBe('2 Shifts'); expect(m.assets[1].complexity).toBe('Complex');
    expect(m.assets[2].oee).toBe(0.70); expect(m.assets[2].modelOee).toBe(0.70); expect(m.assets[4].shift).toBe(before.assets[4].shift); // typed values are never overwritten
    expect(m.assumedFields).toEqual({ [factoryKey('HT')]: 'Wizard default (48 wks)', [assetKey(m.assets[0].id, 'shift')]: 'Wizard default (2 Shifts)', [assetKey(m.assets[3].id, 'shift')]: 'Wizard default (2 Shifts)', [assetKey(m.assets[1].id, 'complexity')]: 'Wizard default (Complex — 50% limit)', [assetKey(m.assets[2].id, 'oee')]: 'Wizard default (70% OEE)' });
  });
  it('OEE fills blank OEE at the configured fraction and is labelled', () => { const m = blanky(); applyWizard(m, ALL, { ...DEFAULT_RULES, oee: { on: true, fraction: 0.85 } }); expect(m.assets[2].oee).toBe(0.85); expect(m.assets[2].modelOee).toBe(0.85); expect(m.assumedFields[assetKey(m.assets[2].id, 'oee')]).toBe('Wizard default (85% OEE)'); });
  it('is idempotent: a second run fills nothing (all 5 fields already filled)', () => { const m = blanky(); applyWizard(m, ALL, DEFAULT_RULES); expect(applyWizard(m, ALL, DEFAULT_RULES).total).toBe(0); });
  it('respects the factory scope and unticked rules', () => {
    const m = blanky(); applyWizard(m, { factory: 'DPF' }, { ...DEFAULT_RULES, shift: { on: false, pattern: '2 Shifts' } }); expect(m.assets[0].shift).toBe(''); expect(m.settings.plannedWeeks.HT).toBeNull(); expect(Object.keys(m.assumedFields)).toEqual([]);
  });
  it('recalculates headroom and clears ERROR flags (DC07 and planned weeks)', () => {
    const m = blanky(); const before = runChecks(m, '2026-01-01').counts.ERROR; expect(before).toBeGreaterThan(0); const cellBefore = cells(m, 'model').find((c) => c.cell === '02_HTMF_UTAQW')!.headroom;
    applyWizard(m, ALL, DEFAULT_RULES); const after = runChecks(m, '2026-01-01'); expect(after.counts.ERROR).toBeLessThan(before); expect(after.issues.filter((i) => i.rule === 'DC07')).toEqual([]);
    expect(calcAsset(m, m.assets[0], 'model').headroom).not.toBeNull(); expect(cellBefore).toBeNull();
  });
  it('shift choices include valid calendar names only', () => { const m = blanky(); m.settings.shiftHours['Early + Late'] = 72; m.settings.shiftHours['Nights only'] = null; const names = validShiftNames(m); expect(names).toContain('2 Shifts'); expect(names).toContain('Early + Late'); expect(names).not.toContain('Nights only'); });
});

describe('assumed provenance', () => {
  const filled = () => { const m = blanky(); applyWizard(m, ALL, DEFAULT_RULES); return m; };
  it('a manual edit or imported real value clears the assumption; untouched ones stay', () => {
    const before = filled(); const after = structuredClone(before); after.assets[0].shift = '3 Shifts'; after.settings.plannedWeeks.HT = 50; pruneAssumed(before, after);
    expect(after.assumedFields[assetKey(after.assets[0].id, 'shift')]).toBeUndefined(); expect(after.assumedFields[factoryKey('HT')]).toBeUndefined(); expect(after.assumedFields[assetKey(after.assets[3].id, 'shift')]).toBeDefined(); expect(Object.keys(after.assumedFields).length).toBe(3);
  });
  it('wizard keys added in the same edit are not pruned; deleted rows are dropped', () => {
    const before = blanky(); const after = structuredClone(before); applyWizard(after, ALL, DEFAULT_RULES); pruneAssumed(before, after); expect(Object.keys(after.assumedFields).length).toBe(5);
    const b2 = filled(); const a2 = structuredClone(b2); a2.assets = a2.assets.filter((a) => a.id !== b2.assets[0].id); pruneAssumed(b2, a2); expect(a2.assumedFields[assetKey(b2.assets[0].id, 'shift')]).toBeUndefined();
  });
  it('field values are readable by key, and verify (key removal) keeps the value', () => { const m = filled(); expect(fieldValue(m, factoryKey('HT'))).toBe(48); expect(fieldValue(m, assetKey(m.assets[0].id, 'shift'))).toBe('2 Shifts'); expect(fieldValue(m, 'asset:NOPE:shift')).toBeUndefined(); delete m.assumedFields[assetKey(m.assets[0].id, 'shift')]; expect(m.assets[0].shift).toBe('2 Shifts'); });
  it('Revert Unverified Defaults restores blanks only for still-assumed fields', () => {
    const m = filled(); delete m.assumedFields[assetKey(m.assets[0].id, 'shift')]; const n = revertUnverified(m);
    expect(n).toBe(4); expect(m.assets[0].shift).toBe('2 Shifts'); expect(m.assets[3].shift).toBe(''); expect(m.assets[1].complexity).toBe(''); expect(m.assets[2].oee).toBeNull(); expect(m.settings.plannedWeeks.HT).toBeNull(); expect(m.assumedFields).toEqual({}); expect(assumedCount(m)).toBe(0);
  });
  it('counts per factory scope', () => { const m = filled(); expect(assumedCount(m)).toBe(5); expect(assumedCount(m, { factory: 'HT' })).toBe(4); expect(assumedCount(m, { factory: 'DPF' })).toBe(1); });
  it('persists through the browser cache, .json auto-save, the embedded .html state and normalisation', () => {
    const m = filled(); const keys = Object.keys(m.assumedFields).sort();
    expect(Object.keys(readCachedSession(serialise(m))!.assumedFields).sort()).toEqual(keys); expect(Object.keys(deserialise(serialise(m)).assumedFields).sort()).toEqual(keys);
    const html = injectEmbeddedState('<html><head><script id="embedded-master-state" type="application/json">{}</script></head></html>', m); const json = html.match(/type="application\/json">([\s\S]*?)<\/script>/)![1];
    expect(Object.keys(pickBootState(json, null).model!.assumedFields).sort()).toEqual(keys);
    expect(normaliseModel({ assets: [] }).assumedFields).toEqual({}); expect(normaliseModel({ assumedFields: { a: 'x', b: 5 } }).assumedFields).toEqual({ a: 'x' });
  });
});

describe('Export Gaps keeps wizard assumptions visible', () => {
  it('lists assumed asset fields in amber with "Wizard assumption — please verify"', async () => {
    const m = blanky(); applyWizard(m, ALL, DEFAULT_RULES); const wb = new ExcelJS.Workbook(); await wb.xlsx.load((await buildGapWorkbook(m, runChecks(m, '2026-01-01').issues, 'All', 'x')) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet(SHEET_CELLS)!; const col = (n: string) => (CELL_COLS as readonly string[]).indexOf(n) + 1; const argb = (c: ExcelJS.Cell) => (c.fill as ExcelJS.FillPattern)?.fgColor?.argb;
    let seen = false; ws.eachRow((r, n) => { if (n > 1 && r.getCell(4).value === m.assets[0].asset) { seen = true; expect(argb(r.getCell(col('Shift Pattern')))).toBe('FFFEF3C7'); expect(String(r.getCell(col('What Is Missing')).value)).toContain(ASSUMPTION_NOTE); expect(String(r.getCell(col('What Is Missing')).value)).toContain('Wizard default (2 Shifts)'); } });
    expect(seen).toBe(true);
    const ov = JSON.stringify(wb.getWorksheet('Overview & Instructions')!.getSheetValues()); expect(ov).toContain('Planned Weeks of HT'); expect(ov).toContain('Wizard default (48 wks)');
  });
});
