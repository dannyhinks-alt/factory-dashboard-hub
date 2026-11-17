import { calendarHours, cells, costByFactory, gbp, pct } from './calc';
import type { CellCalc } from './calc';
import { biggestLevers, solve } from './flow';
import type { Model, ScopeFilters } from './types';
import { UPLIFTS } from './constants';

export type Verdict = 'GOOD' | 'WATCH' | 'BAD';
export function verdictOf(cs: CellCalc[], errors: number): Verdict {
  if (cs.some((c) => c.band === 'RED')) return 'BAD';
  if (cs.some((c) => c.band === 'AMBER') || errors > 0) return 'WATCH';
  return 'GOOD';
}

export function scopedCells(m: Model, f: ScopeFilters): CellCalc[] {
  const kind = f.source === 'Passport' ? 'passport' : 'model';
  let cs = cells(m, kind).filter((c) => f.factory === 'All' || c.factory === f.factory);
  if (f.board !== 'All') cs = cs.filter((c) => c.band === f.board);
  const h = (c: CellCalc) => (c.headroom === null ? Infinity : c.headroom);
  if (f.sort === 'Worst first') cs = [...cs].sort((a, b) => h(a) - h(b));
  else if (f.sort === 'Best first') cs = [...cs].sort((a, b) => h(b) - h(a));
  else cs = [...cs].sort((a, b) => a.cell.localeCompare(b.cell));
  return cs.slice(0, f.topN);
}

export function fiveLines(m: Model, f: ScopeFilters, errors: number): string[] {
  const all = cells(m, f.source === 'Passport' ? 'passport' : 'model').filter((c) => f.factory === 'All' || c.factory === f.factory);
  const red = all.filter((c) => c.band === 'RED'), amber = all.filter((c) => c.band === 'AMBER'), green = all.filter((c) => c.band === 'GREEN');
  const worst = all.filter((c) => c.headroom !== null).sort((a, b) => a.headroom! - b.headroom!)[0];
  const cost = costByFactory(m).filter((c) => f.factory === 'All' || c.factory === f.factory);
  const add = cost.reduce((s, c) => s + c.add, 0), tc = cost.reduce((s, c) => s + c.cost, 0), ts = cost.reduce((s, c) => s + c.space, 0);
  const lo = cost.reduce((s, c) => s + c.likelyLow, 0), hi = cost.reduce((s, c) => s + c.likelyHigh, 0);
  const cal = calendarHours(m).filter((c) => f.factory === 'All' || c.factory === f.factory);
  const free = cal.reduce((s, c) => s + c.free, 0), over = cal.reduce((s, c) => s + c.overload, 0);
  const flow = m.fpds.length ? solve(m, UPLIFTS[f.uplift] ?? 0) : null;
  const lev = flow ? biggestLevers(m, UPLIFTS[f.uplift] ?? 0)[0] : null;
  return [
    `${all.length} cell(s) in scope: ${green.length} GREEN, ${amber.length} AMBER, ${red.length} RED.`,
    worst ? `Tightest cell is ${worst.cell} (${worst.factory}) at ${pct(worst.headroom)} headroom, set by ${worst.bottleneck!.asset.asset}.` : 'No cell has enough data to calculate headroom yet.',
    add > 0 ? `Closing every gap needs ${add} extra machine(s): about ${gbp(tc)} (likely ${gbp(lo)} to ${gbp(hi)}) and ${ts.toFixed(0)} m².` : 'No extra machines are needed to meet the Complexity Class limits.',
    `Calendar hours: ${Math.round(free).toLocaleString('en-GB')} h spare after OEE losses${over > 0 ? `, but ${Math.round(over).toLocaleString('en-GB')} h of load cannot be met` : ''}.`,
    flow && flow.chain.length ? `Programme runs ${Math.round(flow.endDay)} days (${f.uplift}); critical chain ${flow.chain.join(' ← ')}${lev ? `; biggest lever ${lev.id} (+${lev.deltaDays.toFixed(1)} d per +10%)` : ''}${errors ? `. ${errors} data error(s) still open.` : '.'}` : `No FPD flow defined yet${errors ? `; ${errors} data error(s) open.` : '.'}`,
  ];
}
