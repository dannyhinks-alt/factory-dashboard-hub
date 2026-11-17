import { GATES, HSE_THEMES, PLACEHOLDERS, THEMES } from './constants';
import { calcAsset, cells, compareRows, limitFor, num, shiftHoursFor, weeksFor } from './calc';
import { findCycles } from './flow';
import { gateStatus, isOverdue, level, ratingKey, score, todayIso } from './governance';
import { releaseCandidates } from './sensitivity';
import type { Issue, Model, Severity } from './types';

export interface RuleDef { id: string; severity: Severity; title: string; run: (m: Model, asOf: string) => Issue[] }
const key = (f: string, c: string, a: string) => `${f}|${c}|${a}`;
const aTarget = (id: string) => ({ ws: 2, kind: 'asset' as const, ref: id });
const label = (a: { factory: string; cell: string; asset: string }) => `${a.factory || '?'} / ${a.cell || '?'} / ${a.asset || '?'}`;

function perAsset(rule: string, severity: Severity, test: (m: Model, a: Model['assets'][number]) => string | null) {
  return (m: Model): Issue[] => m.assets.flatMap((a) => { const msg = test(m, a); return msg ? [{ rule, severity, message: `${label(a)}: ${msg}`, target: aTarget(a.id) }] : []; });
}
const inUse = (m: Model) => [...new Set(m.assets.map((a) => a.factory).filter(Boolean))];

export const RULES: RuleDef[] = [
  { id: 'DC01', severity: 'ERROR', title: 'Duplicate Factory / Cell / Asset', run: (m) => {
    const seen = new Map<string, string>(); const out: Issue[] = [];
    m.assets.forEach((a) => { const k = key(a.factory, a.cell, a.asset); if (seen.has(k)) out.push({ rule: 'DC01', severity: 'ERROR', message: `Duplicate asset ${label(a)}`, target: aTarget(a.id) }); else seen.set(k, a.id); });
    return out; } },
  { id: 'DC02', severity: 'ERROR', title: 'Asset missing Factory, Cell or name', run: perAsset('DC02', 'ERROR', (_, a) => (!a.factory || !a.cell || !a.asset ? 'Factory, Cell or Asset name is blank' : null)) },
  { id: 'DC03', severity: 'ERROR', title: 'Machines missing or not positive', run: perAsset('DC03', 'ERROR', (_, a) => (num(a.machines) === null || a.machines! <= 0 ? 'Number of machines is blank or zero' : null)) },
  { id: 'DC04', severity: 'ERROR', title: 'Annual load hours missing', run: perAsset('DC04', 'ERROR', (_, a) => (num(a.loadHrs) === null ? 'Annual load hours are blank' : null)) },
  { id: 'DC05', severity: 'ERROR', title: 'Complexity Class missing or unknown', run: perAsset('DC05', 'ERROR', (m, a) => (!a.complexity ? 'Complexity Class is blank' : m.settings.limits[a.complexity] === undefined ? `Complexity Class "${a.complexity}" is not in Settings` : null)) },
  { id: 'DC06', severity: 'ERROR', title: 'Shift Pattern missing or unknown', run: perAsset('DC06', 'ERROR', (m, a) => (!a.shift ? 'Shift Pattern is blank' : shiftHoursFor(m, a.shift) === null ? `Shift Pattern "${a.shift}" has no hours in the Shift Calendar` : null)) },
  { id: 'DC07', severity: 'ERROR', title: 'Planned Weeks missing for a factory', run: (m) => inUse(m).filter((f) => weeksFor(m, f) === null).map((f) => ({ rule: 'DC07', severity: 'ERROR' as const, message: `Planned Weeks for ${f} is blank`, target: { ws: 1, kind: 'factory' as const, ref: f } })) },
  { id: 'DC08', severity: 'ERROR', title: 'Dependency refers to unknown FPD', run: (m) => m.links.flatMap((l) => [l.parent, l.child].filter((x) => x && !m.fpds.some((p) => p.id === x)).map((x) => ({ rule: 'DC08', severity: 'ERROR' as const, message: `Link ${l.parent || '?'} → ${l.child || '?'} refers to unknown ${x}`, target: { ws: 4, kind: 'link' as const, ref: l.id } }))) },
  { id: 'DC09', severity: 'ERROR', title: 'Circular dependency loop', run: (m) => findCycles(m).map((c) => ({ rule: 'DC09', severity: 'ERROR' as const, message: `Circular loop: ${[...c, c[0]].join(' → ')}`, target: { ws: 4, kind: 'link' as const, ref: m.links.find((l) => l.parent === c[0])?.id ?? '' } })) },
  { id: 'DC10', severity: 'ERROR', title: 'Dependency links an FPD to itself or has blank end', run: (m) => m.links.filter((l) => l.parent === l.child || !l.parent || !l.child).map((l) => ({ rule: 'DC10', severity: 'ERROR' as const, message: `Link ${l.parent || '?'} → ${l.child || '?'} is a self-link or has a blank end`, target: { ws: 4, kind: 'link' as const, ref: l.id } })) },
  { id: 'DC11', severity: 'ERROR', title: 'FPD volume zero or negative while hours entered', run: (m) => m.fpds.filter((p) => num(p.hours) !== null && num(p.volume) !== null && p.volume! <= 0).map((p) => ({ rule: 'DC11', severity: 'ERROR' as const, message: `${p.id}: volume must be above zero`, target: { ws: 4, kind: 'fpd' as const, ref: p.id } })) },
  { id: 'DC12', severity: 'ERROR', title: 'OEE outside 1–120%', run: perAsset('DC12', 'ERROR', (_, a) => { const bad = [a.oee, a.passportOee].some((v) => v !== null && (v <= 0.01 || v > 1.2)); return bad ? 'OEE is outside the sensible 1–120% range' : null; }) },
  { id: 'DC13', severity: 'ERROR', title: 'Register impact outside 1–5', run: (m) => m.register.filter((r) => [r.timeImpact, r.costImpact].some((v) => v !== null && (v < 1 || v > 5 || !Number.isInteger(v)))).map((r) => ({ rule: 'DC13', severity: 'ERROR' as const, message: `${r.id}: impact scores must be whole numbers 1–5`, target: { ws: 6, kind: 'risk' as const, ref: r.id } })) },
  { id: 'DC14', severity: 'ERROR', title: 'Complexity Class limit missing or invalid', run: (m) => Object.entries(m.settings.limits).filter(([, v]) => v === null || v <= 0 || v > 1).map(([k]) => ({ rule: 'DC14', severity: 'ERROR' as const, message: `Limit for ${k} is blank or outside 0–100%`, target: { ws: 2, kind: 'setting' as const, ref: 'limits' } })) },
  { id: 'DC15', severity: 'WARN', title: 'Model OEE missing (treated as 100%)', run: perAsset('DC15', 'WARN', (_, a) => (a.oee === null ? 'Model OEE is blank: treated as 100%' : null)) },
  { id: 'DC16', severity: 'WARN', title: 'Passport OEE missing', run: perAsset('DC16', 'WARN', (_, a) => (a.passportOee === null ? 'Passport OEE is blank' : null)) },
  { id: 'DC17', severity: 'WARN', title: 'Passport load missing', run: perAsset('DC17', 'WARN', (_, a) => (a.passportLoadHrs === null ? 'Passport load hours are blank' : null)) },
  { id: 'DC18', severity: 'WARN', title: 'Cell has no Passport pair', run: (m) => compareRows(m).filter((r) => r.align === 'NO PAIR').map((r) => ({ rule: 'DC18', severity: 'WARN' as const, message: `Cell ${r.cell}: no Passport pair for comparison`, target: { ws: 2, kind: 'cell' as const, ref: r.key } })) },
  { id: 'DC19', severity: 'WARN', title: 'Cost missing where machines are needed', run: (m) => m.assets.filter((a) => { const c = calcAsset(m, a, 'model'); return c.headroom !== null && c.headroom < 0 && (a.costPerMachine === null || a.costUncPct === null); }).map((a) => ({ rule: 'DC19', severity: 'WARN' as const, message: `${label(a)} is overloaded but cost or cost uncertainty is blank`, target: aTarget(a.id) })) },
  { id: 'DC20', severity: 'WARN', title: 'Space missing where machines are needed', run: (m) => m.assets.filter((a) => { const c = calcAsset(m, a, 'model'); return c.headroom !== null && c.headroom < 0 && a.spacePerMachine === null; }).map((a) => ({ rule: 'DC20', severity: 'WARN' as const, message: `${label(a)} is overloaded but space per machine is blank`, target: aTarget(a.id) })) },
  { id: 'DC21', severity: 'WARN', title: 'Settings placeholder not confirmed', run: (m) => PLACEHOLDERS.filter((p) => !m.settings.confirmed[p]).map((p) => ({ rule: 'DC21', severity: 'WARN' as const, message: `Placeholder not confirmed: ${p}`, target: { ws: 2, kind: 'setting' as const, ref: p } })) },
  { id: 'DC22', severity: 'WARN', title: 'Assessor themes unrated', run: (m) => GATES.map((g) => ({ g, s: gateStatus(m, g) })).filter(({ s }) => s.unrated > 0 && s.unrated < THEMES.length).map(({ g, s }) => ({ rule: 'DC22', severity: 'WARN' as const, message: `Gate ${g}: ${s.unrated} theme(s) unrated`, target: { ws: 6, kind: 'assessor' as const, ref: g } })) },
  { id: 'DC23', severity: 'WARN', title: 'Gate BLOCKED by HS&E theme', run: (m) => GATES.filter((g) => gateStatus(m, g).blocked).map((g) => ({ rule: 'DC23', severity: 'WARN' as const, message: `Gate ${g} is BLOCKED (HS&E): Theme ${HSE_THEMES.filter((t) => m.assessor.ratings[ratingKey(g, t)] === 'Not met').join(' & ')} Not met`, target: { ws: 6, kind: 'assessor' as const, ref: g } })) },
  { id: 'DC24', severity: 'WARN', title: 'Overdue action', run: (m, asOf) => m.register.filter((r) => isOverdue(r, asOf)).map((r) => ({ rule: 'DC24', severity: 'WARN' as const, message: `${r.id} "${r.title}" was due ${r.due}`, target: { ws: 6, kind: 'risk' as const, ref: r.id } })) },
  { id: 'DC25', severity: 'WARN', title: 'Register item without owner', run: (m) => m.register.filter((r) => !r.owner).map((r) => ({ rule: 'DC25', severity: 'WARN' as const, message: `${r.id} "${r.title}" has no owner`, target: { ws: 6, kind: 'risk' as const, ref: r.id } })) },
  { id: 'DC26', severity: 'WARN', title: 'FPD hours, volume or working hours missing', run: (m) => m.fpds.filter((p) => p.hours === null || p.volume === null || (p.whd === null && m.settings.defaultWhd === null)).map((p) => ({ rule: 'DC26', severity: 'WARN' as const, message: `${p.id}: hours, volume or working hours per day is blank`, target: { ws: 4, kind: 'fpd' as const, ref: p.id } })) },
  { id: 'DC27', severity: 'WARN', title: 'Overloaded asset (RED)', run: (m) => m.assets.filter((a) => { const h = calcAsset(m, a, 'model').headroom; return h !== null && h < 0; }).map((a) => ({ rule: 'DC27', severity: 'WARN' as const, message: `${label(a)} is overloaded (negative headroom)`, target: aTarget(a.id) })) },
  { id: 'DC28', severity: 'WARN', title: 'Model and Passport DIVERGED', run: (m) => compareRows(m).filter((r) => r.align === 'DIVERGED').map((r) => ({ rule: 'DC28', severity: 'WARN' as const, message: `Cell ${r.cell}: Model restated and Passport diverge by ${(Math.abs(r.variance!) * 100).toFixed(1)} points`, target: { ws: 3, kind: 'cell' as const, ref: r.key } })) },
  { id: 'DC29', severity: 'WARN', title: 'Dependency start rule parameter missing', run: (m) => m.links.filter((l) => l.rule !== 'Complete' && num(l.param) === null).map((l) => ({ rule: 'DC29', severity: 'WARN' as const, message: `${l.parent} → ${l.child}: "${l.rule}" needs a value`, target: { ws: 4, kind: 'link' as const, ref: l.id } })) },
  { id: 'DC30', severity: 'WARN', title: 'Scenario refers to unknown asset', run: (m) => m.scenarios.filter((s) => !m.assets.some((a) => a.factory === s.factory && a.cell === s.cell && a.asset === s.asset)).map((s) => ({ rule: 'DC30', severity: 'WARN' as const, message: `Scenario "${s.name}" points at an asset that does not exist`, target: { ws: 5, kind: 'scenario' as const, ref: s.id } })) },
  { id: 'DC31', severity: 'INFO', title: 'Low-utilisation release candidate', run: (m) => releaseCandidates(m).map((c) => ({ rule: 'DC31', severity: 'INFO' as const, message: `${label(c.asset)} uses only ${(c.effUtil! * 100).toFixed(0)}% of capacity`, target: aTarget(c.asset.id) })) },
  { id: 'DC32', severity: 'INFO', title: 'Lever Set not configured', run: (m) => m.levers.filter((s) => !s.loadPct && !s.oeePts && !s.machinesAdd && !s.shift).map((s) => ({ rule: 'DC32', severity: 'INFO' as const, message: `${s.id} has no levers set`, target: { ws: 5, kind: 'lever' as const, ref: s.id } })) },
  { id: 'DC33', severity: 'INFO', title: 'Register item scored without time or cost', run: (m) => m.register.filter((r) => r.type !== 'Action' && score(r) === null).map((r) => ({ rule: 'DC33', severity: 'INFO' as const, message: `${r.id} "${r.title}" is not scored`, target: { ws: 6, kind: 'risk' as const, ref: r.id } })) },
  { id: 'DC34', severity: 'INFO', title: 'Gate all Met but evidence incomplete', run: (m) => GATES.map((g) => gateStatus(m, g)).filter((s) => s.met === THEMES.length && s.evidence < 6).map((s) => ({ rule: 'DC34', severity: 'INFO' as const, message: `Gate ${s.gate}: all themes Met but only ${s.evidence}/6 evidence points`, target: { ws: 6, kind: 'assessor' as const, ref: s.gate } })) },
];

export interface CheckResult { issues: Issue[]; counts: Record<Severity, number>; perRule: Record<string, number>; empty: boolean }
export function runChecks(m: Model, asOf = todayIso()): CheckResult {
  const empty = m.assets.length === 0 && m.fpds.length === 0;
  const issues: Issue[] = [];
  if (empty) issues.push({ rule: 'DC04', severity: 'ERROR', message: 'No assets or FPDs found. Load a workbook or add data.', target: { ws: 2, kind: 'list', ref: 'assets' } });
  else RULES.forEach((r) => issues.push(...r.run(m, asOf)));
  const counts: Record<Severity, number> = { ERROR: 0, WARN: 0, INFO: 0 }; const perRule: Record<string, number> = {};
  RULES.forEach((r) => (perRule[r.id] = 0));
  issues.forEach((i) => { counts[i.severity]++; perRule[i.rule] = (perRule[i.rule] ?? 0) + 1; });
  return { issues, counts, perRule, empty };
}
// keep imports used
void cells; void limitFor; void level;
