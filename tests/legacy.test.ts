import { describe, expect, it } from 'vitest';
import { calendarHours, cells, compareFactory, compareRows, costByFactory, factoriesOf, timeSplit } from '../src/engine/calc';
import { runChecks } from '../src/engine/checks';
import { emptyModel } from '../src/engine/blank';
import { demoModel } from './fixtures/sample';
import { normaliseModel } from '../src/engine/normalise';
import { executiveTakeaway, factoryOverview, nextActions, readiness, scopeChecks } from '../src/engine/overview';
import { solve } from '../src/engine/flow';
import { runSelfTest } from '../src/engine/selftest';
import { deserialise, serialise } from '../src/persist';
import { exportWorkbook } from '../src/engine/xlsx';

const F = { factory: 'DPF', topN: 10, source: 'Both', board: 'All', sort: 'Worst first', show: 'Headroom', uplift: 'Typical' } as const;
/** Everything the screens call, on a given model: none of it may throw. */
function exercise(m: ReturnType<typeof emptyModel>) {
  factoriesOf(m); cells(m, 'model'); cells(m, 'passport'); compareRows(m); compareFactory(m); costByFactory(m); calendarHours(m); timeSplit(m, 'DPF'); solve(m, 0); runSelfTest(m);
  const r = runChecks(m, '2026-01-01'); scopeChecks(m, r, 'DPF'); readiness(r); nextActions(m, r.issues, F); executiveTakeaway(m, F, 0); factoriesOf(m).forEach((f) => factoryOverview(m, f)); exportWorkbook(m, null);
}

describe('blank default and legacy caches', () => {
  it('the blank model has no factories, cells, assets, FPDs or register items', () => {
    const e = emptyModel(); expect(factoriesOf(e)).toEqual([]); expect(Object.keys(e.settings.plannedWeeks)).toEqual([]);
    expect([e.assets, e.cellLines, e.fpds, e.register, e.scenarios].map((x) => x.length)).toEqual([0, 0, 0, 0, 0]); exercise(e);
  });
  it('lookups for a factory that is not in the model never throw', () => {
    const e = emptyModel(); expect(() => { factoryOverview(e, 'DPF'); timeSplit(e, 'DPF'); compareFactory(e); scopeChecks(e, runChecks(e), 'DPF'); }).not.toThrow();
  });
  it.each([
    ['null', null], ['empty object', {}], ['wrong types', { assets: 'x', settings: 5, fpds: {}, links: 7, register: null }],
    ['old save: no cellLines, routes, lists or levers', { assets: [{ id: 'A1', factory: 'DPF', cell: 'C', asset: 'Mill', shift: '2 Shifts', machines: 2, oee: 0.7, loadHrs: 1000 }], fpds: [{ id: 'FPD-01', name: 'x', cell: 'C', hours: 10, volume: 1 }], settings: { plannedWeeks: { HT: 46 } } }],
    ['settings without facility keys', { assets: [{ id: 'A1', factory: 'DPF', cell: 'C', asset: 'Mill' }], settings: { limits: {} } }],
  ])('normaliseModel rebuilds %s into a safe model', (_n, raw) => { const m = normaliseModel(raw); exercise(m); expect(Array.isArray(m.cellLines)).toBe(true); expect(m.levers.length).toBe(3); });
  it('a facility used on a line always gets a planned-weeks slot', () => { expect(normaliseModel({ assets: [{ factory: 'DPF', cell: 'C', asset: 'A' }] }).settings.plannedWeeks.DPF).toBeNull(); });
  it('old fpd.cell becomes a one-cell route', () => { expect(normaliseModel({ fpds: [{ id: 'FPD-01', cell: 'C1' }] }).fpds[0].route).toEqual(['C1']); });
  it('save files round-trip, and garbage is rejected cleanly', () => {
    const d = demoModel(); expect(deserialise(serialise(d)).assets.length).toBe(d.assets.length); expect(() => deserialise('{"nope":1}')).toThrow(/save file/); expect(() => deserialise('not json')).toThrow();
    exercise(deserialise(JSON.stringify({ model: { assets: [], settings: {} } })));
  });
});
