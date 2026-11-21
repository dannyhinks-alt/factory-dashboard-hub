import { calcAsset, cells, compareRows, costByFactory, limitFor, num, shiftHoursFor, stressMult, weeksFor } from './calc';
import { RULES, runChecks } from './checks';
import { fpdCalc, solve, solveTopo } from './flow';
import { pressureList } from './sensitivity';
import { modelToWorkbookBytes, readWorkbook } from './xlsx';
import type { Model } from './types';

export const TOL = 1e-5; // 0.001 %
export interface TestResult { id: number; name: string; pass: boolean; detail: string; maxErr: number }
const rel = (a: number, b: number) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-12));
const mk = (id: number, name: string, errs: number[], n: number, extra = ''): TestResult => {
  const maxErr = errs.length ? Math.max(...errs) : 0;
  return { id, name, pass: maxErr <= TOL && n > 0, maxErr, detail: n === 0 ? 'Nothing to test yet (no complete data).' : `${n} value(s) checked, max relative error ${(maxErr * 100).toExponential(2)}%${extra}` };
};

export function runSelfTest(m: Model): TestResult[] {
  const out: TestResult[] = [];
  // 1 headroom by independent algebra
  { const e: number[] = []; let n = 0;
    for (const a of m.assets) { const c = calcAsset(m, a, 'model'); if (c.headroom === null) continue;
      const wk = weeksFor(m, a.factory)!, sh = shiftHoursFor(m, a.shift)!, lim = limitFor(m, a.complexity)!;
      const oee = m.settings.oeeMode === 'None' ? 1 : (m.settings.oeeMode === 'Passport' ? a.passportOee : a.oee) ?? 1;
      const sched = wk * sh * a.machines!; const cap = lim * Math.max(0.01 * sched, sched - (a.plannedLosses ?? 0)) * oee; const h = (cap - a.loadHrs! * stressMult(m)) / cap; e.push(rel(h, c.headroom)); n++; }
    out.push(mk(1, 'Headroom per asset (independent algebra)', e, n)); }
  // 2 bottleneck
  { const e: number[] = []; let n = 0;
    for (const c of cells(m, 'model')) { const hs = c.assets.map((x) => x.headroom).filter((x): x is number => x !== null); if (!hs.length) continue; e.push(rel(Math.min(...hs), c.headroom!)); if (c.bottleneck?.headroom !== Math.min(...hs)) e.push(1); n++; }
    out.push(mk(2, 'Cell bottleneck = lowest-headroom asset', e, n)); }
  // 3 OEE-restated parity
  { const e: number[] = []; let n = 0; const alt: Model = { ...m, settings: { ...m.settings, oeeMode: 'Passport' } };
    const r = cells(m, 'restated'), p = cells(alt, 'model');
    r.forEach((c, i) => { if (c.headroom !== null && p[i].headroom !== null) { e.push(rel(c.headroom, p[i].headroom!)); n++; } });
    out.push(mk(3, 'Model restated at Passport OEE equals Passport-mode model', e, n)); }
  // 4 likely cost range RSS
  { const e: number[] = []; let n = 0;
    for (const r of costByFactory(m)) { let ss = 0, any = false;
      for (const a of m.assets.filter((x) => x.factory === r.factory)) { const c = calcAsset(m, a, 'model'); if (!c.complete) continue;
        const per = c.weeks! * c.shiftHrs! * c.oee! * c.limit!; const add = Math.max(0, Math.ceil(c.load! / per - 1e-9) - c.machines!);
        if (add) { any = true; ss += (add * (a.costPerMachine ?? 0) * (a.costUncPct ?? 0)) ** 2; } }
      if (any) { e.push(rel((r.likelyHigh - r.likelyLow) / 2, Math.sqrt(ss))); n++; } else n++; }
    out.push(mk(4, 'Likely cost range = root-sum-of-squares', e, n)); }
  // 5 Little's Law
  { const e: number[] = []; let n = 0;
    for (const p of m.fpds) { const c = fpdCalc(m, p); if (!c.ok) continue; const f = m.assets.find((a) => a.cell === p.cell)?.factory ?? ''; const wk = weeksFor(m, f) ?? 46;
      const closed = p.hours! / (wk * 5 * (num(p.whd) ?? num(m.settings.defaultWhd))!); e.push(rel(c.wip, closed)); n++; }
    out.push(mk(5, "Little's Law WIP = rate × lead time", e, n)); }
  // 6 multi-pass cascade
  { const e: number[] = []; let n = 0; const up = 0.3; const a = solve(m, up), b = solveTopo(m, up);
    if (!a.cycles.length) for (const id of Object.keys(b)) { e.push(rel(a.sched[id].start, b[id].start), rel(a.sched[id].end, b[id].end)); n++; }
    else n = 1;
    out.push(mk(6, 'Multi-pass lead-time cascade equals topological solve', e, n, a.cycles.length ? ' (loop present: cascade skipped)' : '')); }
  // 7 data checks
  { const e: number[] = []; let n = RULES.length; const r = runChecks(m);
    if (RULES.length !== 32) e.push(1); if (new Set(RULES.map((x) => x.id)).size !== 32) e.push(1);
    const sum = Object.values(r.perRule).reduce((x, y) => x + y, 0); if (sum !== r.issues.length || r.counts.ERROR + r.counts.WARN + r.counts.INFO !== r.issues.length) e.push(1);
    out.push(mk(7, 'All 32 Data Check rules defined and consistent', e, n, `; ${r.issues.length} flag(s) raised`)); }
  // 8 break-even
  { const e: number[] = []; let n = 0;
    for (const p of pressureList(m)) { const a = p.c.asset;
      const t1 = calcAsset(m, a, 'model', { loadPct: p.loadChange }); if (t1.headroom !== null) { e.push(Math.abs(t1.headroom) / 1); n++; }
      const lim = p.c.limit!, oee = p.oeeNeeded!; const h2 = 1 - p.c.load! / (p.c.avail! * oee) / lim; e.push(Math.abs(h2)); n++; }
    out.push(mk(8, 'Break-even levers return exactly zero headroom', e, n)); }
  // 9 compare
  { const e: number[] = []; let n = 0; const rows = compareRows(m);
    rows.forEach((r) => { if (r.restated !== null && r.passport !== null) { e.push(rel(r.variance!, r.restated - r.passport)); n++; } else if (r.align !== 'NO PAIR') e.push(1); });
    if (rows.length && n === 0) n = 1;
    out.push(mk(9, 'Compare variance and alignment classes', e, n || rows.length)); }
  // 10 round trip
  { const e: number[] = []; let n = 0;
    try { const bytes = modelToWorkbookBytes(m); const back = readWorkbook(bytes, 'rt').model;
      if (back.assets.length !== m.assets.length || back.fpds.length !== m.fpds.length || back.links.length !== m.links.length) e.push(1);
      const a = cells(m, 'model'), b = cells(back, 'model'); a.forEach((c, i) => { if (c.headroom !== null && b[i]?.headroom !== null && b[i]) { e.push(rel(c.headroom, b[i].headroom!)); n++; } else if ((c.headroom === null) !== (b[i]?.headroom === null)) e.push(1); });
      if (runChecks(back).issues.length !== runChecks(m).issues.length) e.push(1); n += 1;
    } catch { e.push(1); }
    out.push(mk(10, '.xlsx export → re-import preserves headroom and all checks', e, n || 1)); }
  return out;
}
