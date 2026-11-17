import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { demoModel } from './fixtures/sample';
import { RULES, runChecks } from '../src/engine/checks';
import { PLAIN } from '../src/engine/plainEnglish';
import { normalisePct, cells } from '../src/engine/calc';
import { executiveTakeaway, factoryOverview, fpdFactories, nextActions, readiness, scopeChecks, statusReason } from '../src/engine/overview';
import { gateStatus, ratingKey } from '../src/engine/governance';
import { impactMessage } from '../src/engine/toast';
import { exportWorkbook, parseWorkbook, readWorkbook } from '../src/engine/xlsx';
import { verdictOf } from '../src/engine/story';
import { solve } from '../src/engine/flow';

const F = { factory: 'All', topN: 10, source: 'Both', board: 'All', sort: 'Worst first', show: 'Headroom', uplift: 'Typical' } as const;

describe('4-workspace UX logic', () => {
  const m = demoModel();
  it('every data check has plain-English wording and help', () => { RULES.forEach((r) => { expect(PLAIN[r.id].headline.length).toBeGreaterThan(10); expect(r.help).toBe(PLAIN[r.id].help); }); expect(Object.keys(PLAIN).length).toBe(34); });
  it('check targets only point at the 4 workspaces', () => { runChecks(m).issues.forEach((i) => { if (i.target) expect([1, 2, 3, 4]).toContain(i.target.ws); }); });
  it('OEE input normalises 68 and 0.68 to 68%', () => { expect(normalisePct(68)).toBeCloseTo(0.68); expect(normalisePct(0.68)).toBeCloseTo(0.68); expect(normalisePct(1)).toBe(1); expect(normalisePct(100)).toBe(1); });
  it('global factory filter scopes issues, readiness and next actions', () => {
    const all = runChecks(m, '2026-01-01'); const ht = scopeChecks(m, all, 'HT'); const dpf = scopeChecks(m, all, 'DPF');
    expect(ht.issues.length).toBeLessThan(all.issues.length); expect(dpf.issues.length).toBeLessThan(all.issues.length);
    expect(ht.issues.every((i) => i.rule !== 'DC13' || /Temper|Quench|Vacuum/.test(i.message))).toBe(true);
    expect(readiness(all).pct).toBeGreaterThanOrEqual(0); expect(readiness(all).pct).toBeLessThanOrEqual(100);
    expect(nextActions(m, dpf.issues, { ...F, factory: 'DPF' }).length).toBeLessThanOrEqual(3);
  });
  it('status reason names the overloaded cell and factory', () => {
    const cs = cells(m, 'model'); const v = verdictOf(cs, 0); expect(v).toBe('BAD');
    expect(statusReason(v, cs.filter((c) => c.factory === 'DPF'), 0, 'DPF')).toMatch(/1 cell overloaded in DPF/);
  });
  it('factory cards and 3-point takeaway', () => {
    const o = factoryOverview(m, 'DPF'); expect(o.cells.length).toBe(2); expect(o.red).toBe(1); expect(o.bottleneck!.asset.asset).toBe('Weld Robot 1'); expect(o.utilisation).toBeGreaterThan(0);
    const t = executiveTakeaway(m, { ...F }, 0); expect(t.length).toBe(3); expect(t[1]).toMatch(/crossing factories \(HT \+ DPF\)/);
  });
  it('cross-factory FPD routes derive their factories and stay visible under either factory', () => {
    expect(fpdFactories(m, m.fpds[2].route).sort()).toEqual(['DPF', 'HT']); expect(fpdFactories(m, m.fpds[0].route)).toEqual(['HT']);
    const hit = (f: string) => m.fpds.filter((p) => fpdFactories(m, p.route).includes(f)).map((p) => p.id);
    expect(hit('HT')).toContain('FPD-03'); expect(hit('DPF')).toContain('FPD-03');
    expect(solve(m, 0).chain).toEqual(['FPD-10', 'FPD-08', 'FPD-05', 'FPD-01']);
  });
  it('FPD route round-trips through .xlsx and blank template rows are ignored (no false DC26)', () => {
    const back = readWorkbook(exportWorkbook(m, null), 'x').model; expect(back.fpds[2].route).toEqual(['02_HTMF_UTAQW', '07_DPF_MACHN']);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['t'], ['FPD', 'Name', 'Cell', 'Hours', 'Volume'], ['FPD-01', 'Real', 'C1', 100, 10], ['FPD-02', 'XXX', '', '', ''], ['FPD-03', '', '', '', '']]), 'FPD');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['t'], ['Parent FPD', 'Child FPD', 'Start rule', 'N / Overlap %', 'Transfer days', 'Adjust in takts'], ['FPD-02', 'FPD-02', '', '', '', ''], ['', '', '', '', '', ''], ['FPD-03', 'FPD-02', '', '', '', ''], ['FPD-01', 'FPD-01', '', '', '', '']]), 'Lead time');
    const p = parseWorkbook(wb, 'tpl').model; expect(p.fpds.map((x) => x.id)).toEqual(['FPD-01']); expect(p.links.length).toBe(0); expect(runChecks(p).perRule.DC26).toBe(0);
  });
  it('a genuine self-loop that was typed is still an error', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['FPD', 'Name', 'Cell', 'Hours', 'Volume'], ['FPD-01', 'Real', 'C1', 100, 10]]), 'FPD');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Parent FPD', 'Child FPD', 'Start rule', 'Transfer days'], ['FPD-01', 'FPD-01', 'Complete', 2]]), 'Lead time');
    expect(runChecks(parseWorkbook(wb, 'x').model).perRule.DC26).toBeGreaterThan(0);
  });
  it('programme name, brief and factory roles persist through .xlsx', () => {
    const back = readWorkbook(exportWorkbook(m, null), 'x').model; expect(back.programmeName).toBe('Sample programme'); expect(back.contextBrief).toBe(m.contextBrief); expect(back.factoryRoles.DPF).toBe(m.factoryRoles.DPF);
  });
  it('per-cell gate ratings and Mark Gate Met', () => {
    const c = structuredClone(m); const cell = '02_HTMF_UTAQW'; for (let t = 1; t <= 7; t++) c.assessor.ratings[ratingKey('Prove', t, cell)] = 'Met';
    expect(gateStatus(c, 'Prove', cell).label).toBe('PASSED'); expect(gateStatus(c, 'Prove').label).not.toBe('PASSED');
    const back = readWorkbook(exportWorkbook(c, null), 'x').model; expect(gateStatus(back, 'Prove', cell).label).toBe('PASSED');
  });
  it('toasts state the exact impact', () => {
    const after = structuredClone(m); after.assets[3].shift = '3 Shifts + Sat'; after.assets[3].modelShift = '3 Shifts + Sat';
    const r = impactMessage(m, after, '2026-01-01'); expect(r.msg).toMatch(/Updated shift pattern — cell headroom recalculated to [+-]\d+\.\d%/);
    const fixed = structuredClone(m); fixed.settings.defaultComplexity = 'Nope'; const r2 = impactMessage(fixed, m, '2026-01-01'); expect(r2.msg).toMatch(/Gap resolved — 0 critical errors remaining/);
  });
  it('custom shifts without hours raise DC07 until defined', () => {
    const c = structuredClone(m); c.assets[0].shift = '7 Shifts'; c.settings.shiftHours['7 Shifts'] = null;
    expect(runChecks(c).issues.some((i) => i.rule === 'DC07' && /7 Shifts/.test(i.message))).toBe(true);
    c.settings.shiftHours['7 Shifts'] = 168; expect(runChecks(c).issues.some((i) => i.rule === 'DC07' && /7 Shifts/.test(i.message))).toBe(false);
  });
});
