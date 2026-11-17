import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { demoModel, emptyModel } from '../src/engine/demo';
import { RULES, runChecks } from '../src/engine/checks';
import { runSelfTest } from '../src/engine/selftest';
import { calcAsset, cells, costByFactory, compareRows } from '../src/engine/calc';
import { biggestLevers, findCycles, monteCarlo, solve } from '../src/engine/flow';
import { exportWorkbook, modelToWorkbookBytes, parseWorkbook, readWorkbook } from '../src/engine/xlsx';
import { gateStatus, level } from '../src/engine/governance';
import { pressureList } from '../src/engine/sensitivity';

describe('engine', () => {
  const m = demoModel();
  it('has exactly 34 data check rules', () => { expect(RULES.length).toBe(34); expect(new Set(RULES.map((r) => r.id)).size).toBe(34); });
  it('demo flags gaps in all severities', () => { const r = runChecks(m, '2026-01-01'); expect(r.counts.ERROR + r.counts.WARN + r.counts.INFO).toBeGreaterThan(5); expect(r.counts.WARN).toBeGreaterThan(0); });
  it('headroom formula', () => {
    const a = m.assets[0]; const c = calcAsset(m, a, 'model');
    const cap = 0.35 * 46 * 120 * 2 * 0.78; expect(c.headroom).toBeCloseTo((cap - 2900) / cap, 9);
  });
  it('cells GREEN/AMBER/RED bands', () => { const cs = cells(m, 'model'); expect(cs.length).toBe(3); expect(cs.map((c) => c.band)).toEqual(['AMBER', 'RED', 'GREEN']); });
  it('critical chain matches workbook narrative', () => { expect(solve(m, 0).chain).toEqual(['FPD-10', 'FPD-08', 'FPD-05', 'FPD-01']); });
  it('detects circular loops', () => { const c = demoModel(); c.links.push({ id: 'X', parent: 'FPD-10', child: 'FPD-01', rule: 'Complete', param: null, transferDays: 0, adjustTakts: 0 }); expect(findCycles(c).length).toBeGreaterThan(0); expect(runChecks(c).perRule.DC09).toBeGreaterThan(0); expect(solve(c, 0).endDay).toBeGreaterThan(0); });
  it('self-test passes 10/10 on demo', () => { const r = runSelfTest(m); expect(r.length).toBe(10); r.forEach((t) => expect(t.pass, `${t.id} ${t.name} ${t.detail}`).toBe(true)); });
  it('empty workbook is safe', () => { const e = emptyModel(); expect(runChecks(e).empty).toBe(true); expect(cells(e, 'model')).toEqual([]); expect(solve(e, 0).endDay).toBe(0); expect(() => runSelfTest(e)).not.toThrow(); expect(costByFactory(e).length).toBe(2); expect(compareRows(e)).toEqual([]); });
  it('partial xlsx ingestion', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x'], [], ['Factory', 'Cell', 'Asset', 'OEE %', 'Annual Load (h)'], ['HT', 'C1', 'Oven', 'TBC', ''], ['HT', 'C1', 'Oven2', '85%', 1000]]), 'Data');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Label', 'Value'], ['Planned Weeks HT', '[enter]']]), 'Settings');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const r = readWorkbook(buf, 'partial'); expect(r.model.assets.length).toBe(2); expect(r.model.assets[1].oee).toBeCloseTo(0.85);
    expect(r.model.assets[0].oee).toBeNull(); expect(r.tabsMissing.length).toBeGreaterThan(5);
    const c = runChecks(r.model); expect(c.counts.ERROR).toBeGreaterThan(3); expect(() => runSelfTest(r.model)).not.toThrow();
  });
  it('xlsx round trip & gap fill export', () => {
    const bytes = modelToWorkbookBytes(m); const back = readWorkbook(bytes, 'x');
    expect(back.tabsMissing).toEqual([]); expect(back.model.assets.length).toBe(m.assets.length); expect(back.model.links.length).toBe(m.links.length);
    expect(back.model.assessor.ratings['Design|7']).toBe('Not met'); expect(back.model.register.length).toBe(m.register.length);
    const filled = structuredClone(back.model); filled.assets[2].passportOee = 0.8;
    const out = exportWorkbook(filled, back.wb); const again = parseWorkbook(XLSX.read(out, { type: 'array' }), 'y').model;
    expect(again.assets[2].passportOee).toBeCloseTo(0.8); expect(again.settings.confirmed['Planned weeks per factory']).toBe(true);
  });
  it('governance', () => { expect(gateStatus(m, 'Design').blocked).toBe(true); expect(gateStatus(m, 'Define').label).toBe('PASSED'); expect(level(15)).toBe('HIGH'); expect(level(8)).toBe('MEDIUM'); expect(level(7)).toBe('LOW'); });
  it('sensitivity, levers & monte carlo', () => {
    expect(pressureList(m)[0].headroom).toBeLessThanOrEqual(pressureList(m)[1].headroom);
    const l = biggestLevers(m, 0); expect(l[0].deltaDays).toBeGreaterThanOrEqual(l[l.length - 1].deltaDays);
    const mc = monteCarlo(m, 0.3, 200); expect(mc.p10).toBeLessThanOrEqual(mc.p50); expect(mc.p50).toBeLessThanOrEqual(mc.p90);
  });
});
