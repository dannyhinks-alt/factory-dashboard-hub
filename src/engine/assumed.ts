/**
 * Gap Auto-Fill Wizard logic and provenance.
 * A key in `model.assumedFields` marks a value the wizard filled ("Assumed Default"); a field without a key is user or workbook data.
 */
import { SHIFTS } from './constants';
import { factoriesOf, shiftHoursFor, weeksFor } from './calc';
import type { Model } from './types';

export type AssumedKind = 'plannedWeeks' | 'shift' | 'complexity' | 'oee';
export const factoryKey = (factory: string) => `factory:${factory}:plannedWeeks`;
export const assetKey = (assetId: string, kind: Exclude<AssumedKind, 'plannedWeeks'>) => `asset:${assetId}:${kind}`;

/** Current value behind a provenance key (undefined when the factory or asset no longer exists). */
export function fieldValue(m: Model, key: string): string | number | null | undefined {
  const [kind, id, field] = key.split(':');
  if (kind === 'factory') return field === 'plannedWeeks' && id in m.settings.plannedWeeks ? m.settings.plannedWeeks[id] : undefined;
  const asset = m.assets.find((a) => a.id === id); if (!asset) return undefined;
  return field === 'shift' ? asset.shift : field === 'complexity' ? asset.complexity : field === 'oee' ? asset.oee : undefined;
}

/**
 * Keeps provenance honest: any assumed field whose value was changed since `before` (a manual edit, an Excel import or a gap pack)
 * stops being assumed. New keys added by the wizard itself are untouched, and keys of deleted rows are dropped.
 */
export function pruneAssumed(before: Model, after: Model): void {
  for (const key of Object.keys(before.assumedFields ?? {})) {
    if (!(key in after.assumedFields)) continue;
    const now = fieldValue(after, key); if (now === undefined || now !== fieldValue(before, key)) delete after.assumedFields[key];
  }
}

export interface WizardScope { factory: string } // 'All' or one factory code
export interface GapScan { factories: string[]; shiftAssets: string[]; complexityAssets: string[]; oeeAssets: string[] }
const inScope = (scope: WizardScope, factory: string) => scope.factory === 'All' || factory === scope.factory;

/** Blank fields that currently block or weaken the calculations, within the scope. */
export function scanGaps(m: Model, scope: WizardScope): GapScan {
  const assets = m.assets.filter((a) => inScope(scope, a.factory));
  return {
    factories: factoriesOf(m).filter((f) => inScope(scope, f) && weeksFor(m, f) === null),
    shiftAssets: assets.filter((a) => !a.shift.trim()).map((a) => a.id),
    complexityAssets: assets.filter((a) => !a.complexity.trim()).map((a) => a.id),
    oeeAssets: assets.filter((a) => a.oee === null).map((a) => a.id),
  };
}

export interface WizardRules {
  plannedWeeks: { on: boolean; weeks: number };
  shift: { on: boolean; pattern: string };
  complexity: { on: boolean; className: string; overrideStandard?: boolean };
  oee: { on: boolean; fraction: number };
}
export const DEFAULT_RULES: WizardRules = { plannedWeeks: { on: true, weeks: 48 }, shift: { on: true, pattern: '2 Shifts' }, complexity: { on: true, className: 'Complex' }, oee: { on: true, fraction: 0.70 } };

export interface WizardReport { plannedWeeks: number; shift: number; complexity: number; oee: number; total: number }
/** Applies only the ticked rules, only to blank fields in scope, and records each one in assumedFields. Mutates `d`. */
export function applyWizard(d: Model, scope: WizardScope, rules: WizardRules): WizardReport {
  const scan = scanGaps(d, scope); const rep: WizardReport = { plannedWeeks: 0, shift: 0, complexity: 0, oee: 0, total: 0 };
  if (rules.plannedWeeks.on && rules.plannedWeeks.weeks > 0) for (const f of scan.factories) { d.settings.plannedWeeks[f] = rules.plannedWeeks.weeks; d.assumedFields[factoryKey(f)] = `Wizard default (${rules.plannedWeeks.weeks} wks)`; rep.plannedWeeks++; }
  const byId = (ids: string[]) => d.assets.filter((a) => ids.includes(a.id));
  if (rules.shift.on && rules.shift.pattern) for (const a of byId(scan.shiftAssets)) { a.shift = rules.shift.pattern; a.modelShift = rules.shift.pattern; d.assumedFields[assetKey(a.id, 'shift')] = `Wizard default (${rules.shift.pattern})`; rep.shift++; }
  if (rules.complexity.on && rules.complexity.className) {
    const lim = rules.complexity.className === 'Complex' ? ' — 50% limit' : '';
    for (const a of byId(scan.complexityAssets)) { a.complexity = rules.complexity.className; d.assumedFields[assetKey(a.id, 'complexity')] = `Wizard default (${rules.complexity.className}${lim})`; rep.complexity++; }
    if (rules.complexity.overrideStandard && rules.complexity.className === 'Complex') {
      for (const a of d.assets.filter((x) => inScope(scope, x.factory) && x.complexity === 'Standard')) { a.complexity = 'Complex'; d.assumedFields[assetKey(a.id, 'complexity')] = `Wizard default (Complex — 50% limit)`; rep.complexity++; }
    }
  }
  if (rules.oee.on && rules.oee.fraction > 0 && rules.oee.fraction <= 1.2) for (const a of byId(scan.oeeAssets)) { a.oee = rules.oee.fraction; a.modelOee = rules.oee.fraction; d.assumedFields[assetKey(a.id, 'oee')] = `Wizard default (${Math.round(rules.oee.fraction * 1000) / 10}% OEE)`; rep.oee++; }
  rep.total = rep.plannedWeeks + rep.shift + rep.complexity + rep.oee; return rep;
}

/** Puts every still-assumed value back to blank and clears its flag. Returns how many fields were reverted. */
export function revertUnverified(d: Model): number {
  let n = 0;
  for (const key of Object.keys(d.assumedFields)) {
    const [kind, id, field] = key.split(':');
    if (kind === 'factory') { if (id in d.settings.plannedWeeks) d.settings.plannedWeeks[id] = null; }
    else { const a = d.assets.find((x) => x.id === id); if (a) { if (field === 'shift') { a.shift = ''; a.modelShift = ''; } else if (field === 'complexity') a.complexity = ''; else if (field === 'oee') { a.oee = a.passportOee; a.modelOee = null; } } }
    delete d.assumedFields[key]; n++;
  }
  return n;
}

/** Shift names the wizard may offer: the standard list plus any calendar shift that resolves to hours. */
export const validShiftNames = (m: Model): string[] => [...new Set<string>([...SHIFTS, ...Object.keys(m.settings.shiftHours).filter((s) => shiftHoursFor(m, s) !== null)])];
export const assumedCount = (m: Model, scope?: WizardScope): number => Object.keys(m.assumedFields).filter((k) => {
  if (!scope || scope.factory === 'All') return true; const [kind, id] = k.split(':'); return kind === 'factory' ? id === scope.factory : m.assets.find((a) => a.id === id)?.factory === scope.factory; }).length;
