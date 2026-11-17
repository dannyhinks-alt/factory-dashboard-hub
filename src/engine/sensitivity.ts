import { band, calcAsset, cells, machinesToAdd, num, shiftOrder, rollCell } from './calc';
import type { AssetCalc, Lever } from './calc';
import type { LeverSet, Model, Scenario } from './types';

export interface Pressure {
  c: AssetCalc; headroom: number;
  loadChange: number; oeeNeeded: number | null; machines: number | null; shiftNeeded: string;
}

export function pressureList(m: Model): Pressure[] {
  const out: Pressure[] = [];
  for (const a of m.assets) {
    const c = calcAsset(m, a, 'model');
    if (c.headroom === null) continue;
    const loadChange = c.limit! / c.effUtil! - 1;
    const oeeNeeded = c.load! / (c.avail! * c.limit!);
    let shiftNeeded = c.headroom >= 0 ? 'Already within limit' : 'None sufficient';
    if (c.headroom < 0) for (const s of shiftOrder(m)) { const t = calcAsset(m, a, 'model', { shift: s }); if (t.headroom !== null && t.headroom >= 0) { shiftNeeded = s; break; } }
    out.push({ c, headroom: c.headroom, loadChange, oeeNeeded, machines: machinesToAdd(c), shiftNeeded });
  }
  return out.sort((a, b) => a.headroom - b.headroom);
}

export function leverFn(set: { factory: string; loadPct: number; oeePts: number; machinesAdd: number; shift: string }) {
  return (a: { factory: string }): Lever | undefined =>
    set.factory && a.factory !== set.factory ? undefined : { loadPct: set.loadPct, oeePts: set.oeePts, machinesAdd: set.machinesAdd, shift: set.shift };
}

export interface SetResult { set: LeverSet; green: number; amber: number; red: number; worst: number | null; improvement: number | null }
export function testSets(m: Model): { base: SetResult['green'][]; results: SetResult[]; baseWorst: number | null } {
  const base = cells(m, 'model');
  const baseWorst = base.length && base.some((c) => c.headroom !== null) ? Math.min(...base.filter((c) => c.headroom !== null).map((c) => c.headroom!)) : null;
  const results = m.levers.map((set) => {
    const cs = cells(m, 'model', leverFn(set) as never);
    const hs = cs.filter((c) => c.headroom !== null).map((c) => c.headroom!);
    const worst = hs.length ? Math.min(...hs) : null;
    return { set, green: cs.filter((c) => c.band === 'GREEN').length, amber: cs.filter((c) => c.band === 'AMBER').length, red: cs.filter((c) => c.band === 'RED').length, worst, improvement: worst !== null && baseWorst !== null ? worst - baseWorst : null };
  });
  return { base: [], results, baseWorst };
}

export function releaseCandidates(m: Model) {
  const thr = num(m.settings.lowUtilThreshold);
  if (thr === null) return [];
  return m.assets.map((a) => calcAsset(m, a, 'model')).filter((c) => c.effUtil !== null && c.effUtil < thr).sort((a, b) => a.effUtil! - b.effUtil!);
}

export function scenarioResult(m: Model, s: Scenario) {
  const a = m.assets.find((x) => x.factory === s.factory && x.cell === s.cell && x.asset === s.asset);
  if (!a) return null;
  const lever: Lever = { loadPct: s.loadPct, oeePts: s.oeePts, machinesAdd: s.machinesAdd, shift: s.shift };
  const before = calcAsset(m, a, 'model'), after = calcAsset(m, a, 'model', lever);
  const cellAssets = m.assets.filter((x) => x.factory === s.factory && x.cell === s.cell);
  const cb = rollCell(s.factory, s.cell, cellAssets.map((x) => calcAsset(m, x, 'model')));
  const ca = rollCell(s.factory, s.cell, cellAssets.map((x) => calcAsset(m, x, 'model', x === a ? lever : undefined)));
  return { before: before.headroom, after: after.headroom, cellBefore: cb.headroom, cellAfter: ca.headroom, bandBefore: band(cb.headroom), bandAfter: band(ca.headroom) };
}
