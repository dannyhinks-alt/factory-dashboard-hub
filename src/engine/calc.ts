import { DEFAULT_LIMITS, DEFAULT_SHIFT_HOURS, GREEN_MIN, SHIFTS } from './constants';
import type { Asset, Model } from './types';

export type CalcKind = 'model' | 'noOee' | 'restated' | 'passport';
export interface Lever { loadPct?: number; oeePts?: number; machinesAdd?: number; shift?: string }

export interface AssetCalc {
  asset: Asset;
  kind: CalcKind;
  weeks: number | null;
  shiftHrs: number | null;
  machines: number | null;
  limit: number | null;
  oee: number | null;
  load: number | null;
  avail: number | null; // available hours (all machines)
  effUtil: number | null;
  headroom: number | null; // fraction; null if not computable
  complete: boolean;
}

export type Band = 'GREEN' | 'AMBER' | 'RED' | 'NONE';
export const band = (h: number | null): Band => (h === null ? 'NONE' : h >= GREEN_MIN ? 'GREEN' : h >= 0 ? 'AMBER' : 'RED');

export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const pct = (v: number | null, d = 1) => (v === null ? '–' : `${(v * 100).toFixed(d)}%`);
export const gbp = (v: number | null) => (v === null ? '–' : `£${Math.round(v).toLocaleString('en-GB')}`);
export const n1 = (v: number | null, d = 1) => (v === null || !Number.isFinite(v) ? '–' : v.toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d }));

export function weeksFor(m: Model, factory: string): number | null {
  return num(m.settings.plannedWeeks[factory]);
}
export function shiftHoursFor(m: Model, shift: string): number | null {
  if (!shift) return null;
  const v = m.settings.shiftHours[shift];
  return num(v) ?? (shift in DEFAULT_SHIFT_HOURS && m.settings.shiftHours[shift] === undefined ? DEFAULT_SHIFT_HOURS[shift] : null);
}
export function limitFor(m: Model, clsIn: string): number | null {
  const cls = clsIn || m.settings.defaultComplexity;
  const v = m.settings.limits[cls];
  return num(v) ?? (v === undefined ? num(DEFAULT_LIMITS[cls]) : null);
}
export const stressMult = (m: Model) => (m.settings.stressTest ? 1 + (m.settings.stressPct || 0) : 1);

/** Core headroom maths. Headroom = 1 − effUtil / limit. */
export function headroomOf(load: number, avail: number, oee: number, limit: number): { effUtil: number; headroom: number } {
  const effUtil = load / (avail * oee);
  return { effUtil, headroom: 1 - effUtil / limit };
}

export function calcAsset(m: Model, a: Asset, kind: CalcKind, lever?: Lever): AssetCalc {
  const weeks = weeksFor(m, a.factory);
  const shift = lever?.shift ? lever.shift : a.shift;
  const shiftHrs = shiftHoursFor(m, shift);
  const baseMachines = num(a.machines);
  const machines = baseMachines === null ? null : baseMachines + (lever?.machinesAdd ?? 0);
  const limit = limitFor(m, a.complexity);
  let oee: number | null;
  let load: number | null;
  if (kind === 'noOee') { oee = 1; load = num(a.loadHrs); }
  else if (kind === 'restated') { oee = num(a.passportOee); load = num(a.loadHrs); }
  else if (kind === 'passport') { oee = num(a.passportOee); load = num(a.passportLoadHrs); }
  else {
    const mode = m.settings.oeeMode;
    oee = mode === 'None' ? 1 : mode === 'Passport' ? num(a.passportOee) : num(a.oee);
    if (oee === null && mode !== 'None') oee = 1; // gap: treated as 100% and flagged by Data Checks
    load = num(a.loadHrs);
  }
  if (kind === 'restated' && oee === null) oee = null;
  if (oee !== null && lever?.oeePts) oee = Math.min(1, Math.max(0.01, oee + lever.oeePts));
  if (load !== null) load = load * stressMult(m) * (1 + (lever?.loadPct ?? 0));
  const avail = weeks !== null && shiftHrs !== null && machines !== null ? weeks * shiftHrs * machines : null;
  const ok = avail !== null && avail > 0 && load !== null && oee !== null && oee > 0 && limit !== null && limit > 0;
  if (!ok) return { asset: a, kind, weeks, shiftHrs, machines, limit, oee, load, avail, effUtil: null, headroom: null, complete: false };
  const r = headroomOf(load!, avail!, oee!, limit!);
  return { asset: a, kind, weeks, shiftHrs, machines, limit, oee, load, avail, effUtil: r.effUtil, headroom: r.headroom, complete: true };
}

export interface CellCalc {
  key: string; factory: string; cell: string;
  assets: AssetCalc[];
  headroom: number | null;
  bottleneck: AssetCalc | null;
  band: Band;
}

export const cellKey = (f: string, c: string) => `${f}|${c}`;

export function rollCell(factory: string, cell: string, calcs: AssetCalc[]): CellCalc {
  const ok = calcs.filter((c) => c.headroom !== null);
  const bn = ok.length ? ok.reduce((a, b) => (b.headroom! < a.headroom! ? b : a)) : null;
  return { key: cellKey(factory, cell), factory, cell, assets: calcs, headroom: bn ? bn.headroom : null, bottleneck: bn, band: band(bn ? bn.headroom : null) };
}

export function cellList(m: Model): { factory: string; cell: string }[] {
  const seen = new Set<string>(); const out: { factory: string; cell: string }[] = [];
  for (const a of m.assets) {
    const k = cellKey(a.factory, a.cell);
    if (!seen.has(k)) { seen.add(k); out.push({ factory: a.factory, cell: a.cell }); }
  }
  return out;
}

export function cells(m: Model, kind: CalcKind, lever?: (a: Asset) => Lever | undefined): CellCalc[] {
  return cellList(m).map(({ factory, cell }) =>
    rollCell(factory, cell, m.assets.filter((a) => a.factory === factory && a.cell === cell).map((a) => calcAsset(m, a, kind, lever?.(a)))));
}

export function factoriesOf(m: Model): string[] {
  const s = new Set<string>(Object.keys(m.settings.plannedWeeks));
  m.assets.forEach((a) => a.factory && s.add(a.factory));
  return [...s];
}

// ---------- Cost & space ----------
export interface Need { calc: AssetCalc; add: number; cost: number | null; space: number | null; unc: number }
export function machinesToAdd(c: AssetCalc): number | null {
  if (!c.complete || c.machines === null || c.weeks === null || c.shiftHrs === null) return null;
  const perMachine = c.weeks * c.shiftHrs * c.oee! * c.limit!;
  return Math.max(0, Math.ceil(c.load! / perMachine - 1e-9) - c.machines);
}
export interface CostRow { factory: string; add: number; cost: number; space: number; worstCost: number; likelyLow: number; likelyHigh: number; worstSpace: number; likelySpaceLow: number; likelySpaceHigh: number; missing: number }
export function costByFactory(m: Model): CostRow[] {
  return factoriesOf(m).map((factory) => {
    let add = 0, cost = 0, space = 0, worstCost = 0, worstSpace = 0, ssC = 0, ssS = 0, missing = 0;
    for (const a of m.assets.filter((x) => x.factory === factory)) {
      const c = calcAsset(m, a, 'model');
      const n = machinesToAdd(c);
      if (!n) continue;
      add += n;
      const u = num(a.costUncPct) ?? 0;
      if (num(a.costPerMachine) === null || num(a.spacePerMachine) === null) missing++;
      const ac = n * (num(a.costPerMachine) ?? 0), as = n * (num(a.spacePerMachine) ?? 0);
      cost += ac; space += as; worstCost += ac * (1 + u); worstSpace += as * (1 + u);
      ssC += (ac * u) ** 2; ssS += (as * u) ** 2;
    }
    const rc = Math.sqrt(ssC), rs = Math.sqrt(ssS);
    return { factory, add, cost, space, worstCost, likelyLow: cost - rc, likelyHigh: cost + rc, worstSpace, likelySpaceLow: space - rs, likelySpaceHigh: space + rs, missing };
  });
}

// ---------- Calendar hours ----------
export interface CalRow { factory: string; notScheduled: number; oeeLoss: number; load: number; free: number; overload: number }
export function calendarHours(m: Model): CalRow[] {
  return factoriesOf(m).map((factory) => {
    const r: CalRow = { factory, notScheduled: 0, oeeLoss: 0, load: 0, free: 0, overload: 0 };
    for (const a of m.assets.filter((x) => x.factory === factory)) {
      const c = calcAsset(m, a, 'model');
      if (c.weeks === null || c.shiftHrs === null || c.machines === null) continue;
      const cal = c.weeks * 168 * c.machines, sched = c.avail!;
      const eff = sched * (c.oee ?? 1), load = c.load ?? 0;
      r.notScheduled += Math.max(0, cal - sched); r.oeeLoss += sched - eff;
      r.load += Math.min(load, eff); r.free += Math.max(0, eff - load); r.overload += Math.max(0, load - eff);
    }
    return r;
  });
}

export function timeSplit(m: Model, factory: string) {
  let va = 0, enva = 0, nva = 0, tot = 0;
  for (const a of m.assets) {
    if (factory !== 'All' && a.factory !== factory) continue;
    const l = num(a.loadHrs); if (l === null || a.vaPct === null || a.envaPct === null) continue;
    va += l * a.vaPct; enva += l * a.envaPct; nva += l * Math.max(0, 1 - a.vaPct - a.envaPct); tot += l;
  }
  return { va, enva, nva, tot };
}

// ---------- Compare ----------
export type Align = 'ALIGNED' | 'DRIFTING' | 'DIVERGED' | 'NO PAIR';
export interface CompareRow { key: string; factory: string; cell: string; noOee: number | null; restated: number | null; model: number | null; passport: number | null; variance: number | null; align: Align }
export function alignOf(variance: number | null): Align {
  if (variance === null) return 'NO PAIR';
  const v = Math.abs(variance);
  return v <= 0.02 ? 'ALIGNED' : v <= 0.05 ? 'DRIFTING' : 'DIVERGED';
}
export function compareRows(m: Model): CompareRow[] {
  const model = cells(m, 'model'), noOee = cells(m, 'noOee'), rest = cells(m, 'restated'), pass = cells(m, 'passport');
  return model.map((c, i) => {
    const restated = rest[i].headroom, passport = pass[i].headroom;
    const variance = restated !== null && passport !== null ? restated - passport : null;
    return { key: c.key, factory: c.factory, cell: c.cell, noOee: noOee[i].headroom, restated, model: c.headroom, passport, variance, align: alignOf(variance) };
  });
}
export function compareFactory(m: Model) {
  return factoriesOf(m).map((f) => {
    const rows = compareRows(m).filter((r) => r.factory === f);
    const avg = (k: 'noOee' | 'restated' | 'model' | 'passport') => { const v = rows.map((r) => r[k]).filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const fp = m.fpds.filter((p) => rows.some((r) => r.cell === p.cell));
    const hours = fp.reduce((s, p) => s + (p.hours ?? 0), 0);
    const loadH = m.assets.filter((a) => a.factory === f).reduce((s, a) => s + (a.loadHrs ?? 0), 0);
    const ops = fp.length;
    return { factory: f, noOee: avg('noOee'), restated: avg('restated'), passport: avg('passport'), fpdHours: hours, modelHours: loadH, fpdOps: ops,
      aligned: rows.filter((r) => r.align === 'ALIGNED').length, drifting: rows.filter((r) => r.align === 'DRIFTING').length,
      diverged: rows.filter((r) => r.align === 'DIVERGED').length, noPair: rows.filter((r) => r.align === 'NO PAIR').length };
  });
}

export const shiftOrder = (m: Model) => [...SHIFTS].filter((s) => shiftHoursFor(m, s) !== null).sort((a, b) => shiftHoursFor(m, a)! - shiftHoursFor(m, b)!);
