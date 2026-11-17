import { cells, pct } from './calc';
import { runChecks } from './checks';
import type { Model } from './types';

const LABEL: Record<string, string> = { shift: 'shift pattern', modelShift: 'model shift pattern', passportShift: 'Passport shift pattern', machines: 'machine count', oee: 'OEE', modelOee: 'model OEE', passportOee: 'Passport OEE', plannedLosses: 'planned losses', modelPlannedLosses: 'model planned losses', passportPlannedLosses: 'Passport planned losses',
  loadHrs: 'load', modelLoad: 'model load', passportLoadHrs: 'Passport load', complexity: 'complexity class', factory: 'factory', cell: 'cell', asset: 'asset name', hours: 'hours', volume: 'volume', whd: 'working hours per day', route: 'route', version: 'version', date: 'date' };

/** Names what changed between two models, in everyday words. */
export function describeChange(a: Model, b: Model): { label: string; cell?: string } {
  for (const k of ['assets', 'cellLines', 'fpds'] as const) {
    const A = a[k] as unknown as Record<string, unknown>[], B = b[k] as unknown as Record<string, unknown>[];
    if (A.length !== B.length) return { label: k === 'assets' ? (B.length > A.length ? 'added an asset' : 'removed an asset') : k === 'cellLines' ? 'changed the cell lines' : (B.length > A.length ? 'added a product family' : 'changed the product families') };
    for (let i = 0; i < B.length; i++) for (const key of Object.keys(B[i])) if (JSON.stringify(A[i]?.[key]) !== JSON.stringify(B[i][key])) return { label: `updated ${LABEL[key] ?? key}`, cell: k === 'assets' ? String(B[i].cell) : undefined };
  }
  if (JSON.stringify(a.settings) !== JSON.stringify(b.settings)) return { label: 'updated a setting' };
  if (JSON.stringify(a.links) !== JSON.stringify(b.links)) return { label: 'updated the flow links' };
  if (JSON.stringify(a.register) !== JSON.stringify(b.register)) return { label: 'updated the Register' };
  if (JSON.stringify(a.assessor) !== JSON.stringify(b.assessor)) return { label: 'updated the Gate Assessor' };
  if (JSON.stringify(a.scenarios) !== JSON.stringify(b.scenarios) || JSON.stringify(a.levers) !== JSON.stringify(b.levers)) return { label: 'updated scenarios and levers' };
  return { label: 'saved your change' };
}

/** Plain-English statement of the exact impact of an edit. */
export function impactMessage(before: Model, after: Model, asOf: string): { msg: string; tone: 'good' | 'warn' | 'info' } {
  const e0 = runChecks(before, asOf).counts.ERROR, e1 = runChecks(after, asOf).counts.ERROR; const d = describeChange(before, after);
  const cs = cells(after, 'model'); const hs = cs.filter((c) => c.headroom !== null);
  const cell = d.cell ? cs.find((c) => c.cell === d.cell) : undefined;
  const h = cell?.headroom ?? (hs.length ? Math.min(...hs.map((c) => c.headroom!)) : null);
  const sign = (v: number | null) => (v === null ? '–' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);
  const cap = d.label.charAt(0).toUpperCase() + d.label.slice(1);
  if (e1 < e0) return { msg: `Gap resolved — ${e1} critical error${e1 === 1 ? '' : 's'} remaining`, tone: 'good' };
  if (e1 > e0) return { msg: `${cap} — ${e1 - e0} new critical error${e1 - e0 === 1 ? '' : 's'} (${e1} in total)`, tone: 'warn' };
  const hb = (() => { const c0 = cells(before, 'model').filter((c) => c.headroom !== null); const cc = d.cell ? c0.find((c) => c.cell === d.cell) : undefined; return cc?.headroom ?? (c0.length ? Math.min(...c0.map((c) => c.headroom!)) : null); })();
  if (h !== null && (hb === null || Math.abs(h - hb) > 1e-9)) return { msg: `${cap} — ${d.cell ? 'cell' : 'worst-cell'} headroom recalculated to ${sign(h)}`, tone: h < 0 ? 'warn' : 'good' };
  return { msg: `${cap} — no change to headroom (${pct(h)})`, tone: 'info' };
}
