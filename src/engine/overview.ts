import { RULES } from './checks';
import type { CheckResult } from './checks';
import { calcAsset, cellKey, cellList, cells, compareRows, costByFactory, factoriesOf, gbp, n1, pct } from './calc';
import type { AssetCalc, CellCalc } from './calc';
import { solve } from './flow';
import { allGates } from './governance';
import { UPLIFTS } from './constants';
import type { FocusTarget, Issue, Model, ScopeFilters, Severity } from './types';
import type { Verdict } from './story';

/** Factories an issue belongs to (empty = programme-wide, always shown). */
export function issueFactories(m: Model, i: Issue): string[] {
  const t = i.target; if (!t) return [];
  if (t.kind === 'asset') { const a = m.assets.find((x) => x.id === t.ref); return a?.factory ? [a.factory] : []; }
  if (t.kind === 'cellline') { const c = m.cellLines.find((x) => x.id === t.ref); return c?.factory ? [c.factory] : []; }
  if (t.kind === 'factory') return [t.ref];
  const routeF = (id: string) => { const p = m.fpds.find((x) => x.id === id); return p ? fpdFactories(m, p.route) : []; };
  if (t.kind === 'fpd') return routeF(t.ref);
  if (t.kind === 'link') { const l = m.links.find((x) => x.id === t.ref); return l ? [...new Set([...routeF(l.parent), ...routeF(l.child)])] : []; }
  return [];
}
export function fpdFactories(m: Model, route: string[]): string[] {
  return [...new Set(route.map((c) => m.assets.find((a) => a.cell === c)?.factory ?? m.cellLines.find((l) => l.cell === c)?.factory ?? '').filter(Boolean))];
}
export function scopeChecks(m: Model, r: CheckResult, factory: string): CheckResult {
  if (factory === 'All') return r;
  const issues = r.issues.filter((i) => { const f = issueFactories(m, i); return f.length === 0 || f.includes(factory); });
  const counts: Record<Severity, number> = { ERROR: 0, WARN: 0, INFO: 0 }; const perRule: Record<string, number> = {};
  RULES.forEach((x) => (perRule[x.id] = 0)); issues.forEach((i) => { counts[i.severity]++; perRule[i.rule]++; });
  return { issues, counts, perRule, empty: r.empty };
}
/** Data readiness: share of the 34 rules with no ERROR or WARN flag, plus the count of ERROR blockers. */
export function readiness(r: CheckResult) {
  const clear = RULES.filter((x) => !r.issues.some((i) => i.rule === x.id && i.severity !== 'INFO')).length;
  return { pct: r.empty ? 0 : Math.round((clear / RULES.length) * 100), errors: r.counts.ERROR, clear };
}
export function statusReason(verdict: Verdict, cs: CellCalc[], errors: number, factory: string): string {
  const where = factory === 'All' ? '' : ` in ${factory}`;
  const red = cs.filter((c) => c.band === 'RED'), amber = cs.filter((c) => c.band === 'AMBER');
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (!cs.length) return 'No cells to assess yet';
  if (verdict === 'BAD') { const f = factory === 'All' ? ` in ${[...new Set(red.map((c) => c.factory))].join(' + ')}` : where; return `${plural(red.length, 'cell')} overloaded${f}`; }
  if (verdict === 'WATCH') return amber.length ? `${plural(amber.length, 'cell')} with thin headroom${where}${errors ? `, ${plural(errors, 'data error')} open` : ''}` : `${plural(errors, 'data error')} still open${where}`;
  return `Every cell has 10% or more headroom${where}`;
}

export interface FactoryOverview {
  factory: string; role: string; cells: CellCalc[]; green: number; amber: number; red: number; machines: number; assets: number;
  utilisation: number | null; capex: number; likelyLow: number; likelyHigh: number; space: number; bottleneck: AssetCalc | null;
}
export function factoryOverview(m: Model, factory: string): FactoryOverview {
  const cs = cells(m, 'model').filter((c) => c.factory === factory);
  const calcs = m.assets.filter((a) => a.factory === factory).map((a) => calcAsset(m, a, 'model'));
  const ok = calcs.filter((c) => c.complete);
  const load = ok.reduce((s, c) => s + c.load!, 0), cap = ok.reduce((s, c) => s + c.avail! * c.oee!, 0);
  const cost = costByFactory(m).find((c) => c.factory === factory);
  const hs = calcs.filter((c) => c.headroom !== null);
  return { factory, role: m.factoryRoles[factory] ?? '', cells: cs, green: cs.filter((c) => c.band === 'GREEN').length, amber: cs.filter((c) => c.band === 'AMBER').length, red: cs.filter((c) => c.band === 'RED').length,
    machines: m.assets.filter((a) => a.factory === factory).reduce((s, a) => s + (a.machines ?? 0), 0), assets: calcs.length, utilisation: cap > 0 ? load / cap : null,
    capex: cost?.cost ?? 0, likelyLow: cost?.likelyLow ?? 0, likelyHigh: cost?.likelyHigh ?? 0, space: cost?.space ?? 0, bottleneck: hs.length ? hs.reduce((a, b) => (b.headroom! < a.headroom! ? b : a)) : null };
}

export function executiveTakeaway(m: Model, f: ScopeFilters, errors: number): string[] {
  const fs = factoriesOf(m).filter((x) => f.factory === 'All' || x === f.factory); const ov = fs.map((x) => factoryOverview(m, x));
  const red = ov.reduce((s, o) => s + o.red, 0), amber = ov.reduce((s, o) => s + o.amber, 0), green = ov.reduce((s, o) => s + o.green, 0);
  const worst = ov.map((o) => o.bottleneck).filter((b): b is AssetCalc => !!b).sort((a, b) => a.headroom! - b.headroom!)[0];
  const l1 = worst ? `Capacity: ${green} GREEN, ${amber} AMBER and ${red} RED cell(s). The tightest asset is ${worst.asset.asset} in ${worst.asset.cell} (${worst.asset.factory}) at ${pct(worst.headroom)} headroom.` : 'Capacity: no cell has enough data to calculate headroom yet.';
  const fp = m.fpds.filter((p) => f.factory === 'All' || fpdFactories(m, p.route).includes(f.factory));
  const cross = fp.filter((p) => fpdFactories(m, p.route).length > 1);
  const flow = fp.length ? solve(m, UPLIFTS[f.uplift] ?? 0) : null;
  const l2 = fp.length ? `Product flow: ${fp.length} product famil${fp.length === 1 ? 'y' : 'ies'} (FPD)${cross.length ? `, ${cross.length} crossing factories (${[...new Set(cross.flatMap((p) => fpdFactories(m, p.route)))].join(' + ')})` : ''}. The programme runs about ${n1(flow!.endDay, 0)} days; the longest chain is ${flow!.chain.join(' ← ') || 'not yet known'}.` : 'Product flow: no product families (FPD) defined yet.';
  const cost = costByFactory(m).filter((c) => f.factory === 'All' || c.factory === f.factory);
  const lo = cost.reduce((s, c) => s + c.likelyLow, 0), hi = cost.reduce((s, c) => s + c.likelyHigh, 0), mach = cost.reduce((s, c) => s + c.add, 0);
  const cmp = compareRows(m).filter((r) => f.factory === 'All' || r.factory === f.factory); const g = allGates(m);
  const l3 = `Investment and governance: ${mach ? `${mach} extra machine(s), likely ${gbp(lo)} to ${gbp(hi)}` : 'no extra machines needed'}; ${cmp.filter((r) => r.align === 'ALIGNED').length} of ${cmp.length} cell(s) aligned with their Passport; ${g.filter((x) => x.label === 'PASSED').length} of 6 gates passed${g.some((x) => x.blocked) ? `, ${g.filter((x) => x.blocked).length} blocked by HS&E` : ''}${errors ? `; ${errors} data error(s) still open` : ''}.`;
  return [l1, l2, l3];
}

export interface NextAction { text: string; target: FocusTarget; kind: 'data' | 'capacity' }
/** Up to three plain-English actions: critical data blockers first, then the worst overloaded bottlenecks. */
export function nextActions(m: Model, issues: Issue[], f: ScopeFilters): NextAction[] {
  const out: NextAction[] = [];
  const errs = issues.filter((i) => i.severity === 'ERROR' && i.target);
  errs.slice(0, 2).forEach((i) => out.push({ text: `Fix data: ${i.message}`, target: i.target!, kind: 'data' }));
  const reds = cells(m, 'model').filter((c) => c.band === 'RED' && (f.factory === 'All' || c.factory === f.factory) && c.bottleneck).sort((a, b) => a.headroom! - b.headroom!);
  reds.forEach((c) => { if (out.length < 3) out.push({ text: `Relieve ${c.bottleneck!.asset.asset} in ${c.cell}: ${pct(c.headroom)} headroom`, target: { ws: 2, kind: 'asset', ref: c.bottleneck!.asset.id }, kind: 'capacity' }); });
  for (const i of issues.filter((x) => x.severity === 'WARN' && x.target)) { if (out.length >= 3) break; out.push({ text: `Tidy up: ${i.message}`, target: i.target!, kind: 'data' }); }
  return out.slice(0, 3);
}

export interface CombinedOverview extends Omit<FactoryOverview, 'factory' | 'role'> { factories: number }
/** Roll-up across every loaded factory: weighted utilisation, summed CapEx range and footprint, single worst bottleneck. */
export function combinedOverview(m: Model): CombinedOverview {
  const fs = factoriesOf(m); const ov = fs.map((f) => factoryOverview(m, f));
  const ok = m.assets.map((a) => calcAsset(m, a, 'model')).filter((c) => c.complete);
  const load = ok.reduce((s, c) => s + c.load!, 0), cap = ok.reduce((s, c) => s + c.avail! * c.oee!, 0);
  const hs = ov.map((o) => o.bottleneck).filter((b): b is AssetCalc => !!b);
  return { factories: fs.length, cells: ov.flatMap((o) => o.cells), green: sum(ov, 'green'), amber: sum(ov, 'amber'), red: sum(ov, 'red'), machines: sum(ov, 'machines'), assets: sum(ov, 'assets'),
    utilisation: cap > 0 ? load / cap : null, capex: sum(ov, 'capex'), likelyLow: sum(ov, 'likelyLow'), likelyHigh: sum(ov, 'likelyHigh'), space: sum(ov, 'space'),
    bottleneck: hs.length ? hs.reduce((a, b) => (b.headroom! < a.headroom! ? b : a)) : null };
}
const sum = (ov: FactoryOverview[], k: 'green' | 'amber' | 'red' | 'machines' | 'assets' | 'capex' | 'likelyLow' | 'likelyHigh' | 'space') => ov.reduce((s, o) => s + o[k], 0);

/** Which data a cell's numbers come from: its Cell Design Passport (when the cell is flagged as one) or the Factory Model only. */
export const cellIsPassport = (m: Model, factory: string, cell: string): boolean =>
  m.cellLines.some((c) => c.cell === cell && (!factory || !c.factory || c.factory === factory) && c.passport);

/** Basis tag for the overall status: the sources the verdict is actually built from, within the active factory filter. */
export function statusBasis(m: Model, factory: string): string {
  const inScope = (f: string) => factory === 'All' || f === factory;
  const passport = m.cellLines.some((c) => c.passport && inScope(c.factory)) || m.assets.some((a) => inScope(a.factory) && (a.passportLoadHrs !== null || a.passportOee !== null));
  return passport ? 'Cell Passport + Factory Model' : 'Factory Model';
}

/**
 * Headroom implied by the Product Flow (FPD) definitions: 1 − (FPD hours routed through the cell ÷ the cell's effective capacity).
 * Purpose: a third, independent view beside the Factory Model and the Cell Design Passport. Formula: FPD hours are shared equally
 * across the cells of each route; capacity = Σ over assets of scheduled hours × OEE × class limit. Null when no FPD uses the cell.
 */
export function fpdHeadroomByCell(m: Model): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const { factory, cell } of cellList(m)) {
    const load = m.fpds.reduce((s, p) => (p.hours !== null && p.route.includes(cell) ? s + p.hours / Math.max(1, p.route.length) : s), 0);
    const touched = m.fpds.some((p) => p.hours !== null && p.route.includes(cell));
    const capacity = m.assets.filter((a) => a.factory === factory && a.cell === cell).map((a) => calcAsset(m, a, 'model')).filter((c) => c.complete).reduce((s, c) => s + c.avail! * c.oee! * c.limit!, 0);
    out[cellKey(factory, cell)] = touched && capacity > 0 ? 1 - load / capacity : null;
  }
  return out;
}
