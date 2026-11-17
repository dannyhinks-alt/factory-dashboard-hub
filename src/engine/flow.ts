import { UPLIFTS } from './constants';
import { num, weeksFor } from './calc';
import type { Fpd, Link, Model } from './types';

export interface FpdCalc {
  fpd: Fpd; ok: boolean;
  ltUnit: number; // process lead time, days per unit = hours / volume / working hours per day
  duration: number; // days for the whole volume
  rate: number; // units per working day
  wip: number; // Little's Law: rate × lead time
}

export const upliftOf = (_m: Model, name: string) => UPLIFTS[name] ?? 0;
export function whdFor(m: Model, p: Fpd): number | null { return num(p.whd) ?? num(m.settings.defaultWhd); }

export function fpdCalc(m: Model, p: Fpd, uplift = 0): FpdCalc {
  const whd = whdFor(m, p), h = num(p.hours), v = num(p.volume);
  if (h === null || v === null || v <= 0 || whd === null || whd <= 0) return { fpd: p, ok: false, ltUnit: 0, duration: 0, rate: 0, wip: 0 };
  const ltUnit = (h / v / whd) * (1 + uplift);
  const factory = m.assets.find((a) => a.cell === p.cell)?.factory ?? '';
  const weeks = weeksFor(m, factory) ?? 46;
  const rate = v / (weeks * 5);
  return { fpd: p, ok: true, ltUnit, duration: ltUnit * v, rate, wip: rate * ltUnit };
}

export function findCycles(m: Model): string[][] {
  const adj = new Map<string, string[]>();
  m.links.forEach((l) => { if (l.parent && l.child) adj.set(l.parent, [...(adj.get(l.parent) ?? []), l.child]); });
  const state = new Map<string, number>(); const stack: string[] = []; const cycles: string[][] = [];
  const dfs = (u: string) => {
    state.set(u, 1); stack.push(u);
    for (const v of adj.get(u) ?? []) {
      if (state.get(v) === 1) cycles.push(stack.slice(stack.indexOf(v)));
      else if (!state.get(v)) dfs(v);
    }
    stack.pop(); state.set(u, 2);
  };
  for (const k of adj.keys()) if (!state.get(k)) dfs(k);
  return cycles;
}

export interface Sched { start: number; end: number; driver: string | null }
export interface FlowResult {
  calcs: Record<string, FpdCalc>;
  sched: Record<string, Sched>;
  passes: number;
  cycles: string[][];
  chain: string[]; // child ← parent ← …
  endDay: number;
}

function linkStart(l: Link, pc: FpdCalc, ps: Sched, cc: FpdCalc): number {
  let s: number;
  if (l.rule === 'Complete') s = ps.end;
  else if (l.rule === 'After N units') s = ps.start + Math.min(num(l.param) ?? 0, num(pc.fpd.volume) ?? 0) * pc.ltUnit;
  else s = ps.start + (1 - Math.min(100, Math.max(0, num(l.param) ?? 0)) / 100) * pc.duration;
  return s + (l.transferDays || 0) + (l.adjustTakts || 0) * cc.ltUnit;
}

export function solve(m: Model, uplift: number, mult?: Record<string, number>): FlowResult {
  const calcs: Record<string, FpdCalc> = {};
  for (const p of m.fpds) {
    const c = fpdCalc(m, p, uplift);
    if (mult && mult[p.id] !== undefined) { c.duration *= mult[p.id]; c.ltUnit *= mult[p.id]; }
    calcs[p.id] = c;
  }
  const cycles = findCycles(m);
  const cyc = new Set(cycles.flat());
  const links = m.links.filter((l) => calcs[l.parent] && calcs[l.child] && l.parent !== l.child && !(cyc.has(l.parent) && cyc.has(l.child)));
  const sched: Record<string, Sched> = {};
  for (const id of Object.keys(calcs)) sched[id] = { start: 0, end: calcs[id].duration, driver: null };
  let passes = 0;
  for (; passes < m.fpds.length + 3; passes++) {
    let changed = false;
    for (const l of links) {
      const s = Math.max(0, linkStart(l, calcs[l.parent], sched[l.parent], calcs[l.child]));
      if (s > sched[l.child].start + 1e-9) { sched[l.child] = { start: s, end: s + calcs[l.child].duration, driver: l.parent }; changed = true; }
    }
    if (!changed) break;
  }
  let endId = '', endDay = 0;
  for (const id of Object.keys(sched)) if (sched[id].end > endDay + 1e-9 || !endId) { if (sched[id].end >= endDay) { endDay = sched[id].end; endId = id; } }
  const chain: string[] = []; let cur: string | null = endId || null; const seen = new Set<string>();
  while (cur && !seen.has(cur)) { chain.push(cur); seen.add(cur); cur = sched[cur].driver; }
  return { calcs, sched, passes: passes + 1, cycles, chain, endDay };
}

/** Independent reference solver (topological order) used by the self-test. */
export function solveTopo(m: Model, uplift: number): Record<string, Sched> {
  const calcs: Record<string, FpdCalc> = {}; m.fpds.forEach((p) => (calcs[p.id] = fpdCalc(m, p, uplift)));
  const links = m.links.filter((l) => calcs[l.parent] && calcs[l.child] && l.parent !== l.child);
  const out: Record<string, Sched> = {}; const memo = (id: string, depth = 0): Sched => {
    if (out[id]) return out[id];
    if (depth > 100) return { start: 0, end: calcs[id].duration, driver: null };
    let s = 0, d: string | null = null;
    for (const l of links.filter((x) => x.child === id)) {
      const ps = memo(l.parent, depth + 1); const v = Math.max(0, linkStart(l, calcs[l.parent], ps, calcs[id]));
      if (v > s) { s = v; d = l.parent; }
    }
    return (out[id] = { start: s, end: s + calcs[id].duration, driver: d });
  };
  Object.keys(calcs).forEach((id) => memo(id)); return out;
}

export const chainText = (chain: string[]) => chain.join(' ← ');

// ---------- WIP over time ----------
export function wipAt(r: FlowResult, t: number): { id: string; wip: number }[] {
  return Object.keys(r.calcs).map((id) => ({ id, wip: r.calcs[id].ok && t >= r.sched[id].start && t < r.sched[id].end ? r.calcs[id].wip : 0 }));
}

// ---------- Time axis ----------
export function axisUnit(endDay: number): { unit: 'days' | 'weeks' | 'months' | 'years'; size: number } {
  if (endDay <= 60) return { unit: 'days', size: 1 };
  if (endDay <= 365) return { unit: 'weeks', size: 7 };
  if (endDay <= 365 * 4) return { unit: 'months', size: 30.4 };
  return { unit: 'years', size: 365 };
}

// ---------- Sensitivity: biggest levers ----------
export function biggestLevers(m: Model, uplift: number) {
  const base = solve(m, uplift).endDay;
  return m.fpds.filter((p) => fpdCalc(m, p).ok).map((p) => {
    const r = solve(m, uplift, { [p.id]: 1.1 });
    return { id: p.id, name: p.name, deltaDays: r.endDay - base };
  }).sort((a, b) => b.deltaDays - a.deltaDays);
}

// ---------- Monte Carlo ----------
export function rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function monteCarlo(m: Model, uplift: number, runs = 600, seed = 12345) {
  const r = rng(seed), hi = Math.max(uplift, 0.1);
  const ends: number[] = [];
  for (let i = 0; i < runs; i++) {
    const mult: Record<string, number> = {};
    for (const p of m.fpds) {
      const a = 0.95, c = 1, b = 1 + hi, u = r(), f = (c - a) / (b - a);
      mult[p.id] = u < f ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
    }
    ends.push(solve(m, 0, mult).endDay);
  }
  ends.sort((x, y) => x - y);
  const q = (p: number) => ends[Math.min(ends.length - 1, Math.floor(p * ends.length))];
  return { ends, p10: q(0.1), p50: q(0.5), p90: q(0.9), min: ends[0], max: ends[ends.length - 1], runs };
}
