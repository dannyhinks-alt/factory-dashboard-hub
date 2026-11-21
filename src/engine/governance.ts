import { GATES, GP_THEME_NUMS, HSE_THEMES, THEMES } from './constants';
import type { Model, RegItem } from './types';

/** Ratings are per cell when a cell is given; the programme-level (all cells) rating uses the bare gate|theme key. */
export const ratingKey = (g: string, t: number, cell = '') => (cell ? `${cell}::${g}|${t}` : `${g}|${t}`);
/** Gate & Passport Status rating key: always per-cell. */
export const gpRatingKey = (cell: string, gate: string, themeNo: number) => `${cell}|${gate}|${themeNo}`;
export const gpDateKey = (cell: string, gate: string) => `${cell}|${gate}`;

export interface GpGateStatus { gate: string; met: number; label: string }
export function gpGateStatus(m: Model, cell: string, gate: string): GpGateStatus {
  const met = GP_THEME_NUMS.filter((t) => m.assessor.gpRatings[gpRatingKey(cell, gate, t)] === 'Met').length;
  const rated = GP_THEME_NUMS.filter((t) => !!m.assessor.gpRatings[gpRatingKey(cell, gate, t)]).length;
  const label = rated === 0 ? 'NOT STARTED' : met === GP_THEME_NUMS.length ? `PASSED ${met}/${GP_THEME_NUMS.length}` : 'IN PROGRESS';
  return { gate, met, label };
}
export interface GateStatus { gate: string; met: number; partial: number; notMet: number; unrated: number; blocked: boolean; evidence: number; maturity: number; label: string }

export function gateStatus(m: Model, gate: string, cell = ''): GateStatus {
  let met = 0, partial = 0, notMet = 0, unrated = 0;
  THEMES.forEach((_, i) => {
    const r = m.assessor.ratings[ratingKey(gate, i + 1, cell)] ?? '';
    if (r === 'Met') met++; else if (r === 'Partial') partial++; else if (r === 'Not met') notMet++; else unrated++;
  });
  const blocked = HSE_THEMES.some((t) => m.assessor.ratings[ratingKey(gate, t, cell)] === 'Not met');
  const evidence = (m.assessor.evidence[gate] ?? []).filter(Boolean).length;
  const maturity = (met + partial * 0.5) / THEMES.length;
  const label = blocked ? 'BLOCKED (HS&E)' : unrated === THEMES.length ? 'NOT STARTED' : met === THEMES.length ? 'PASSED' : 'IN PROGRESS';
  return { gate, met, partial, notMet, unrated, blocked, evidence, maturity, label };
}
export const allGates = (m: Model, cell = '') => GATES.map((g) => gateStatus(m, g, cell));

export type Level = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNSCORED';
export const score = (r: RegItem) => (r.timeImpact && r.costImpact ? r.timeImpact * r.costImpact : null);
export const level = (s: number | null): Level => (s === null ? 'UNSCORED' : s >= 15 ? 'HIGH' : s >= 8 ? 'MEDIUM' : 'LOW');
export const isClosed = (r: RegItem) => /closed|done|complete/i.test(r.status);
export const isOverdue = (r: RegItem, asOf: string) => r.type === 'Action' && !!r.due && !isClosed(r) && r.due < asOf;
export const todayIso = () => new Date().toISOString().slice(0, 10);
