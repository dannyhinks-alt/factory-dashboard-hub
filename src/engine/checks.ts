import { GATES, PLACEHOLDERS } from './constants';
import { cells as cellRoll, shiftHoursFor, weeksFor } from './calc';
import { findCycles } from './flow';
import { isOverdue as _unused, todayIso } from './governance';
import type { Asset, CellLine, FocusTarget, Issue, Model, Severity } from './types';

void _unused;
/** The 34 Data Check rules, numbered exactly as on the workbook's Start sheet (DC01 = rule 1 … DC34 = rule 34). */
export interface RuleDef { id: string; severity: Severity; title: string; where: string; run: (m: Model, asOf: string) => Issue[] }

const norm = (s: string) => s.trim().toLowerCase();
const aT = (a: Asset): FocusTarget => ({ ws: 2, kind: 'asset', ref: a.id });
const cT = (c: CellLine): FocusTarget => ({ ws: 2, kind: 'cellline', ref: c.id });
const setT = (ref: string): FocusTarget => ({ ws: 2, kind: 'setting', ref });
const regT = (ref: string): FocusTarget => ({ ws: 6, kind: 'risk', ref });
const aL = (a: Asset) => `${a.factory || '?'} / ${a.cell || '?'} / ${a.asset || '?'}`;
const codes = (m: Model) => Object.keys(m.settings.plannedWeeks);
const cellOf = (m: Model, name: string) => m.cellLines.find((c) => norm(c.cell) === norm(name));
const passportCell = (m: Model, name: string) => !!cellOf(m, name)?.passport;
const hasModel = (a: Asset) => a.modelLoad !== null;
const hasPassport = (a: Asset) => a.passportLoadHrs !== null || a.passportOee !== null;
const onData = (m: Model, cell: string) => !!cell && (!!cellOf(m, cell) || m.assets.some((a) => norm(a.cell) === norm(cell)));
const isFpd = (s: string) => /^FPD-\d+$/i.test(s.trim());
const mk = (rule: string, severity: Severity, message: string, target?: FocusTarget): Issue => ({ rule, severity, message, target });
const R = (id: string, severity: Severity, title: string, where: string, run: RuleDef['run']): RuleDef => ({ id, severity, title, where, run });
const assetsWhere = (id: string, sev: Severity, f: (m: Model, a: Asset) => string | null) => (m: Model) => m.assets.flatMap((a) => { const t = f(m, a); return t ? [mk(id, sev, `${aL(a)}: ${t}`, aT(a))] : []; });
const linesWhere = (id: string, sev: Severity, f: (m: Model, c: CellLine) => string | null) => (m: Model) => m.cellLines.flatMap((c) => { const t = f(m, c); return t ? [mk(id, sev, `Cell ${c.cell || '?'}: ${t}`, cT(c))] : []; });
const maxDepth = (m: Model) => { const par = new Map<string, string[]>(); m.links.forEach((l) => par.set(l.child, [...(par.get(l.child) ?? []), l.parent])); const memo = new Map<string, number>(); const d = (id: string, seen: Set<string>): number => { if (seen.has(id)) return 0; if (memo.has(id)) return memo.get(id)!; const s2 = new Set(seen).add(id); const v = 1 + Math.max(0, ...(par.get(id) ?? []).map((p) => d(p, s2))); memo.set(id, v); return v; }; return Math.max(0, ...m.fpds.map((p) => d(p.id, new Set()))); };

export const RULES: RuleDef[] = [
  R('DC01', 'ERROR', 'Lines whose factory is missing or not a factory code on Settings', 'Data', (m) => {
    const ok = new Set(codes(m).map(norm)); const bad = (f: string) => !f || !ok.has(norm(f));
    return [...m.cellLines.filter((c) => bad(c.factory)).map((c) => mk('DC01', 'ERROR', `Cell line ${c.cell || '?'}: factory "${c.factory}" is missing or not a code on Settings`, cT(c))), ...m.assets.filter((a) => bad(a.factory)).map((a) => mk('DC01', 'ERROR', `${aL(a)}: factory "${a.factory}" is missing or not a code on Settings`, aT(a)))]; }),
  R('DC02', 'ERROR', 'Duplicate cell names on the cell lines', 'Data', (m) => { const seen = new Set<string>(); return m.cellLines.filter((c) => { const k = norm(c.cell); if (!k) return false; if (seen.has(k)) return true; seen.add(k); return false; }).map((c) => mk('DC02', 'ERROR', `Duplicate cell line "${c.cell}"`, cT(c))); }),
  R('DC03', 'ERROR', 'Asset lines with no cell, or a cell that has no cell line', 'Data', (m) => m.assets.flatMap((a) => !a.cell ? [mk('DC03', 'ERROR', `${aL(a)}: no cell`, aT(a))] : !cellOf(m, a.cell) ? [mk('DC03', 'ERROR', `${aL(a)}: cell "${a.cell}" has no cell line`, aT(a))] : [])),
  R('DC04', 'ERROR', 'Asset lines whose factory differs from their cell line', 'Data', assetsWhere('DC04', 'ERROR', (m, a) => { const c = cellOf(m, a.cell); return c && a.factory && c.factory && norm(a.factory) !== norm(c.factory) ? `factory ${a.factory} differs from cell line factory ${c.factory}` : null; })),
  R('DC05', 'INFO', 'Cells with no demand typed: capacity in units a year stays blank', 'Data', linesWhere('DC05', 'INFO', (_, c) => (c.demandUnits === null ? 'no demand typed, so capacity in units a year stays blank' : null))),
  R('DC06', 'ERROR', 'Data lines whose factory, cell or asset is not on the central lists, or list entries with a problem', 'Data, Settings', (m) => {
    const L = m.settings.lists; const has = (k: string) => (L[k] ?? []).length > 0; const inL = (k: string, v: string) => (L[k] ?? []).some((x) => norm(x) === norm(v));
    const out: Issue[] = [];
    for (const k of ['Factories', 'Cells', 'Assets']) { const seen = new Set<string>(); (L[k] ?? []).forEach((v) => { if (!v.trim()) out.push(mk('DC06', 'ERROR', `Central list ${k} has a blank entry`, setT('lists'))); else if (seen.has(norm(v))) out.push(mk('DC06', 'ERROR', `Central list ${k} repeats "${v}"`, setT('lists'))); seen.add(norm(v)); }); }
    m.assets.forEach((a) => { const bad = [has('Factories') && a.factory && !inL('Factories', a.factory) ? 'factory' : '', has('Cells') && a.cell && !inL('Cells', a.cell) ? 'cell' : '', has('Assets') && a.asset && !inL('Assets', a.asset) ? 'asset' : ''].filter(Boolean); if (bad.length) out.push(mk('DC06', 'ERROR', `${aL(a)}: ${bad.join(', ')} not on the central lists`, aT(a))); });
    m.cellLines.forEach((c) => { if ((has('Cells') && c.cell && !inL('Cells', c.cell)) || (has('Factories') && c.factory && !inL('Factories', c.factory))) out.push(mk('DC06', 'ERROR', `Cell line ${c.cell}: factory or cell not on the central lists`, cT(c))); });
    return out; }),
  R('DC07', 'ERROR', 'Assets whose scheduled hours cannot be found from shift pattern or calendar', 'Data, Settings', assetsWhere('DC07', 'ERROR', (m, a) => (!a.shift ? 'no shift pattern, so scheduled hours cannot be found' : shiftHoursFor(m, a.shift) === null ? `shift pattern "${a.shift}" has no hours on the Settings calendar` : weeksFor(m, a.factory) === null ? `no planned weeks for factory ${a.factory || '?'}` : null))),
  R('DC08', 'ERROR', 'More than 30 cells or 200 assets: extra lines are ignored', 'Data', (m) => [...(m.cellLines.length > 30 ? [mk('DC08', 'ERROR', `${m.cellLines.length} cell lines: only the first 30 are used`, { ws: 2, kind: 'list' as const, ref: 'cells' })] : []), ...(m.assets.length > 200 ? [mk('DC08', 'ERROR', `${m.assets.length} asset lines: only the first 200 are used`, { ws: 2, kind: 'list' as const, ref: 'assets' })] : [])]),
  R('DC09', 'WARN', 'Passport cells missing a version or date', 'Data', linesWhere('DC09', 'WARN', (_, c) => (c.passport && (!c.version || !c.date) ? `Passport cell is missing its ${[!c.version && 'version', !c.date && 'date'].filter(Boolean).join(' and ')}` : null))),
  R('DC10', 'WARN', 'Assets in Passport cells with no Passport load hours', 'Data', assetsWhere('DC10', 'WARN', (m, a) => (passportCell(m, a.cell) && a.passportLoadHrs === null ? 'in a Passport cell but has no Passport load hours' : null))),
  R('DC11', 'WARN', 'Passport assets with no factory-model pair', 'Data', assetsWhere('DC11', 'WARN', (_, a) => (hasPassport(a) && !hasModel(a) ? 'has Passport figures but no factory-model load to pair with' : null))),
  R('DC12', 'WARN', 'Factory-model assets with no Passport pair in a Passport cell', 'Data', assetsWhere('DC12', 'WARN', (m, a) => (passportCell(m, a.cell) && hasModel(a) && !hasPassport(a) ? 'factory-model asset has no Passport pair in a Passport cell' : null))),
  R('DC13', 'INFO', 'Passport assets using global OEE while mode allows asset-specific', 'Data, Settings', assetsWhere('DC13', 'INFO', (m, a) => (passportCell(m, a.cell) && a.passportOee === null && m.settings.oeeMode !== 'None' ? `no asset-specific Passport OEE, so the global OEE is used (OEE Mode is ${m.settings.oeeMode})` : null))),
  R('DC14', 'WARN', 'Risks, assumptions or opportunities with no cell, probability or impact', 'Register', (m) => m.register.filter((r) => r.type !== 'Action').flatMap((r) => { const miss = [!r.link && 'cell', r.probability === null && 'probability', (r.timeImpact === null || r.costImpact === null) && 'impact'].filter(Boolean); return miss.length ? [mk('DC14', 'WARN', `${r.id} "${r.title}": no ${miss.join(', ')}`, regT(r.id))] : []; })),
  R('DC15', 'WARN', 'Actions with no owner or no due date', 'Register', (m) => m.register.filter((r) => r.type === 'Action' && (!r.owner || !r.due)).map((r) => mk('DC15', 'WARN', `${r.id} "${r.title}": no ${[!r.owner && 'owner', !r.due && 'due date'].filter(Boolean).join(' or ')}`, regT(r.id)))),
  R('DC16', 'WARN', 'Passport cells not yet on the Assessor', 'Assessor', (m) => m.cellLines.filter((c) => c.passport && !m.assessor.cells.some((x) => norm(x) === norm(c.cell))).map((c) => mk('DC16', 'WARN', `Passport cell ${c.cell} is not on the Assessor`, { ws: 6, kind: 'assessor', ref: c.cell }))),
  R('DC17', 'WARN', 'Assessed cells that are not GREEN and have no action logged', 'Register', (m) => { const rolled = cellRoll(m, 'model'); return m.assessor.cells.flatMap((name) => { const c = rolled.find((x) => norm(x.cell) === norm(name)); if (!c || c.band === 'GREEN') return []; return m.register.some((r) => r.type === 'Action' && norm(r.link) === norm(name)) ? [] : [mk('DC17', 'WARN', `Assessed cell ${name} is ${c.band === 'NONE' ? 'not calculable' : c.band} and has no action logged`, { ws: 6, kind: 'risk', ref: '' })]; }); }),
  R('DC18', 'WARN', 'FPDs missing version, date or volume', 'FPD', (m) => m.fpds.flatMap((p) => { const miss = [!p.version && 'version', !p.date && 'date', p.volume === null && 'volume'].filter(Boolean); return miss.length ? [mk('DC18', 'WARN', `${p.id}: missing ${miss.join(', ')}`, { ws: 4, kind: 'fpd', ref: p.id })] : []; })),
  R('DC19', 'WARN', 'Scenario lines naming an asset not on Data, or with unbalanced re-routes', 'Scenarios', (m) => {
    const out = m.scenarios.filter((s) => !m.assets.some((a) => norm(a.factory) === norm(s.factory) && norm(a.cell) === norm(s.cell) && norm(a.asset) === norm(s.asset))).map((s) => mk('DC19', 'WARN', `Scenario "${s.name}" names an asset that is not on Data`, { ws: 5, kind: 'scenario', ref: s.id }));
    const sums = new Map<string, number>(); m.scenarios.forEach((s) => sums.set(s.name, (sums.get(s.name) ?? 0) + (s.reroute || 0)));
    sums.forEach((v, k) => { if (Math.abs(v) > 1e-9) out.push(mk('DC19', 'WARN', `Scenario "${k}": re-routes are unbalanced by ${v} h`, { ws: 5, kind: 'scenario', ref: m.scenarios.find((s) => s.name === k)!.id })); });
    return out; }),
  R('DC20', 'ERROR', 'Default complexity class is not on the class table', 'Settings', (m) => (m.settings.limits[m.settings.defaultComplexity] === undefined ? [mk('DC20', 'ERROR', `Default complexity class "${m.settings.defaultComplexity}" is not on the class table`, setT('limits'))] : [])),
  R('DC21', 'WARN', 'Assets whose complexity class is not on the class table', 'Data, Settings', assetsWhere('DC21', 'WARN', (m, a) => (a.complexity && m.settings.limits[a.complexity] === undefined ? `complexity class "${a.complexity}" is not on the class table` : null))),
  R('DC22', 'INFO', 'Settings placeholders not yet confirmed', 'Settings', (m) => PLACEHOLDERS.filter((p) => !m.settings.confirmed[p]).map((p) => mk('DC22', 'INFO', `Placeholder not yet confirmed: ${p}`, setT(p)))),
  R('DC23', 'INFO', 'Capacity stress test is switched on: machine hours reduced', 'Settings', (m) => (m.settings.stressTest ? [mk('DC23', 'INFO', `Capacity stress test is on: loads uplifted ${(m.settings.stressPct * 100).toFixed(0)}%, so machine hours are effectively reduced`, setT('stress'))] : [])),
  R('DC24', 'WARN', 'Register or Assessor lines naming a cell not on Data', 'Register, Assessor', (m) => [
    ...m.register.filter((r) => r.link && !isFpd(r.link) && !onData(m, r.link)).map((r) => mk('DC24', 'WARN', `${r.id} names cell "${r.link}", which is not on Data`, regT(r.id))),
    ...m.assessor.cells.filter((c) => !onData(m, c)).map((c) => mk('DC24', 'WARN', `Assessor names cell "${c}", which is not on Data`, { ws: 6, kind: 'assessor', ref: c }))]),
  R('DC25', 'WARN', 'Duplicate asset names inside one cell', 'Data', (m) => { const seen = new Set<string>(); return m.assets.filter((a) => { if (!a.asset) return false; const k = `${norm(a.factory)}|${norm(a.cell)}|${norm(a.asset)}`; if (seen.has(k)) return true; seen.add(k); return false; }).map((a) => mk('DC25', 'WARN', `${aL(a)}: duplicate asset name inside the cell`, aT(a))); }),
  R('DC26', 'ERROR', 'Lead-time links with a problem, or a dependency chain that is too deep or loops', 'Lead time', (m) => {
    const t = (id: string): FocusTarget => ({ ws: 4, kind: 'link', ref: id }); const out: Issue[] = []; const ids = new Set(m.fpds.map((p) => p.id));
    m.links.forEach((l) => { if (!l.parent || !l.child) out.push(mk('DC26', 'ERROR', `Link ${l.parent || '?'} → ${l.child || '?'} has a blank end`, t(l.id))); else if (l.parent === l.child) out.push(mk('DC26', 'ERROR', `${l.parent} is linked to itself`, t(l.id))); else for (const x of [l.parent, l.child]) if (!ids.has(x)) out.push(mk('DC26', 'ERROR', `Link ${l.parent} → ${l.child} names unknown ${x}`, t(l.id)));
      if (l.rule !== 'Complete' && l.param === null) out.push(mk('DC26', 'ERROR', `Link ${l.parent} → ${l.child}: "${l.rule}" needs a value`, t(l.id))); });
    findCycles(m).forEach((c) => out.push(mk('DC26', 'ERROR', `Circular loop: ${[...c, c[0]].join(' → ')}`, t(m.links.find((l) => l.parent === c[0])?.id ?? ''))));
    if (maxDepth(m) > 20) out.push(mk('DC26', 'ERROR', `Dependency chain is ${maxDepth(m)} FPDs deep (limit 20)`, { ws: 4, kind: 'link', ref: '' }));
    return out; }),
  R('DC27', 'WARN', 'Asset values out of range: load, machines or OEE not positive, or OEE above 100%', 'Data', assetsWhere('DC27', 'WARN', (_, a) => { const bad = [a.loadHrs !== null && a.loadHrs <= 0 && 'load', a.passportLoadHrs !== null && a.passportLoadHrs <= 0 && 'Passport load', a.machines !== null && a.machines <= 0 && 'machines', a.oee !== null && (a.oee <= 0 || a.oee > 1) && 'OEE', a.passportOee !== null && (a.passportOee <= 0 || a.passportOee > 1) && 'Passport OEE'].filter(Boolean); return bad.length ? `${bad.join(', ')} out of range` : null; })),
  R('DC28', 'WARN', 'Inspection typed on an asset line: ignored, must be on the cell line', 'Data', assetsWhere('DC28', 'WARN', (_, a) => (a.inspectionHrs !== null ? 'inspection typed on an asset line is ignored: put it on the cell line' : null))),
  R('DC29', 'WARN', 'Cells whose inspection is larger than the operations or lean hours it sits inside, or has nothing to compare with', 'Data', linesWhere('DC29', 'WARN', (_, c) => (c.inspectionHrs === null ? null : c.opsHrs === null && c.leanHrs === null ? 'inspection has no operations or lean hours to compare with' : (c.opsHrs !== null && c.inspectionHrs > c.opsHrs) || (c.leanHrs !== null && c.inspectionHrs > c.leanHrs) ? 'inspection is larger than the operations or lean hours it sits inside' : null))),
  R('DC30', 'WARN', "Planned losses at or above 99% of an asset's scheduled hours: capped", 'Data', assetsWhere('DC30', 'WARN', (m, a) => { const w = weeksFor(m, a.factory), h = shiftHoursFor(m, a.shift); const sched = w !== null && h !== null && a.machines !== null ? w * h * a.machines : 0; return a.plannedLosses !== null && sched > 0 && a.plannedLosses / sched >= 0.99 ? `planned losses are ${((a.plannedLosses / sched) * 100).toFixed(0)}% of scheduled hours: capped at 99%` : null; })),
  R('DC31', 'WARN', 'Cost entries with a problem: not a number, negative, uncertainty without cost, or asset not on Data', 'Settings', (m) => {
    const t = (id: string): FocusTarget => ({ ws: 2, kind: 'setting', ref: `cost:${id}` }); const out: Issue[] = [];
    m.settings.costEntries.forEach((k) => { const p: string[] = []; if (k.raw !== '' && k.cost === null) p.push('cost is not a number'); if (k.cost !== null && k.cost < 0) p.push('cost is negative'); if (k.unc !== null && (k.cost === null || k.raw === '')) p.push('uncertainty without a cost'); if (k.unc !== null && k.unc < 0) p.push('uncertainty is negative'); if (!m.assets.some((a) => norm(a.asset) === norm(k.asset))) p.push('asset is not on Data'); if (p.length) out.push(mk('DC31', 'WARN', `Cost entry "${k.asset || '?'}": ${p.join('; ')}`, t(k.id))); });
    m.assets.filter((a) => (a.costPerMachine !== null && a.costPerMachine < 0) || (a.costUncPct !== null && a.costPerMachine === null)).forEach((a) => out.push(mk('DC31', 'WARN', `${aL(a)}: cost is negative or uncertainty has no cost`, aT(a))));
    return out; }),
  R('DC32', 'INFO', 'Machines with no cost typed: counted in machines, left out of cost', 'Settings', assetsWhere('DC32', 'INFO', (m, a) => (a.machines !== null && a.machines > 0 && a.costPerMachine === null && !m.settings.costEntries.some((k) => norm(k.asset) === norm(a.asset) && k.cost !== null) ? 'no cost typed: counted in machines but left out of cost' : null))),
  R('DC33', 'INFO', 'Cells with a footprint but no allocated space: cannot be checked', 'Settings', linesWhere('DC33', 'INFO', (_, c) => (c.footprint !== null && c.allocatedSpace === null ? 'has a footprint but no allocated space, so it cannot be checked' : null))),
  R('DC34', 'WARN', 'Cells whose footprint is over their allocated space', 'Settings, Data', linesWhere('DC34', 'WARN', (_, c) => (c.footprint !== null && c.allocatedSpace !== null && c.footprint > c.allocatedSpace ? `footprint ${c.footprint} m² is over the allocated ${c.allocatedSpace} m²` : null))),
];

export interface CheckResult { issues: Issue[]; counts: Record<Severity, number>; perRule: Record<string, number>; empty: boolean }
export function runChecks(m: Model, asOf = todayIso()): CheckResult {
  const empty = m.assets.length === 0 && m.fpds.length === 0 && m.cellLines.length === 0;
  const issues: Issue[] = [];
  if (empty) issues.push(mk('DC03', 'ERROR', 'No asset or cell lines found. Open a workbook or add data.', { ws: 2, kind: 'list', ref: 'assets' }));
  else RULES.forEach((r) => issues.push(...r.run(m, asOf)));
  const counts: Record<Severity, number> = { ERROR: 0, WARN: 0, INFO: 0 }; const perRule: Record<string, number> = {};
  RULES.forEach((r) => (perRule[r.id] = 0));
  issues.forEach((i) => { counts[i.severity]++; perRule[i.rule] = (perRule[i.rule] ?? 0) + 1; });
  return { issues, counts, perRule, empty };
}
void GATES;
