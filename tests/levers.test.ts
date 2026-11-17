import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { emptyModel } from '../src/engine/blank';
import { demoModel } from './fixtures/sample';
import { LEVER_PRESETS, QUICK_PRESETS } from '../src/engine/constants';
import { normalisePct } from '../src/engine/calc';
import { testSets } from '../src/engine/sensitivity';
import { exportWorkbook, parseWorkbook, readWorkbook } from '../src/engine/xlsx';

const sheetOf = (rows: unknown[][]) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Levers'); return parseWorkbook(wb, 'x').model; };
const HEAD = ['Set', 'Name', 'Scope Factory', 'Load Change %', 'OEE Change (pts)', 'Machines Added', 'Shift Pattern'];

describe('lever presets', () => {
  it('a blank model and a workbook with no Levers tab get the three presets', () => {
    for (const m of [emptyModel(), parseWorkbook(XLSX.utils.book_new(), 'none').model]) {
      expect(m.levers.map((l) => l.name)).toEqual(['Set A — OEE & Method Uplift', 'Set B — 3-Shift Expansion', 'Set C — CapEx + OEE Lift']);
      expect(m.levers.map((l) => [l.factory, l.loadPct, l.oeePts, l.machinesAdd, l.shift])).toEqual([['', -0.1, 0.05, 0, ''], ['', 0, 0, 0, '3 Shifts'], ['', 0, 0.03, 1, '']]);
    }
  });
  it('populated sets from the Levers tab are imported, empty ones are pre-loaded', () => {
    const m = sheetOf([['t'], HEAD, ['Set A', 'Mine', 'DPF', -5, 2, 0, '2 Shifts + Sat'], ['Set B', '', 'All', 0, 0, 0, 'Unchanged'], ['Set C', 'Own C', 'All', 0.1, 0.02, 1, 'Unchanged']]);
    expect(m.levers[0]).toMatchObject({ id: 'Set A', name: 'Mine', factory: 'DPF', loadPct: -0.05, oeePts: 0.02, shift: '2 Shifts + Sat' });
    expect(m.levers[1]).toEqual(LEVER_PRESETS[1]);
    expect(m.levers[2]).toMatchObject({ name: 'Own C', loadPct: 0.1, oeePts: 0.02, machinesAdd: 1, shift: '' });
  });
  it('signed percentages like -10 and +5 import as fractions', () => {
    const m = sheetOf([HEAD, ['Set A', 'x', 'All', '-10', '+5', 0, '']]);
    expect(m.levers[0].loadPct).toBeCloseTo(-0.1); expect(m.levers[0].oeePts).toBeCloseTo(0.05); expect(normalisePct(-10)).toBeCloseTo(-0.1); expect(normalisePct(-0.1)).toBeCloseTo(-0.1);
  });
  it('levers round-trip through .xlsx', () => {
    const m = demoModel(); const back = readWorkbook(exportWorkbook(m, null), 'rt').model;
    expect(back.levers.map((l) => [l.name, l.factory, l.loadPct, l.oeePts, l.machinesAdd, l.shift])).toEqual(m.levers.map((l) => [l.name, l.factory, l.loadPct, l.oeePts, l.machinesAdd, l.shift]));
  });
  it('presets give live before/after comparisons and quick presets are defined', () => {
    const m = demoModel(); m.levers = LEVER_PRESETS.map((p) => ({ ...p })); const r = testSets(m);
    expect(r.results.length).toBe(3); expect(r.results[0].improvement).toBeGreaterThan(0); expect(r.results.every((x) => x.worst !== null)).toBe(true);
    expect(Object.keys(QUICK_PRESETS)).toEqual(['Quick Win (-10% Load, +5 OEE)', 'Shift Expansion (3 Shifts)', 'Add +1 Machine', 'Stress Test (+20% Demand)', 'Reset to 0']);
    expect(QUICK_PRESETS['Stress Test (+20% Demand)'].loadPct).toBe(0.2);
  });
});
