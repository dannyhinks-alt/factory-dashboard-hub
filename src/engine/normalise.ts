import { DEFAULT_LIMITS, DEFAULT_SHIFT_HOURS, GATES, LEVER_PRESETS, PLACEHOLDERS } from './constants';
import { emptyModel } from './demo';
import type { Asset, CellLine, Fpd, Model } from './types';

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter(isObj) : []);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const nul = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Rebuilds any saved or imported model (an older save, a partial file, a corrupted cache) onto the current
 * shape, so a missing key such as a factory entry, route or list can never cause "cannot read properties of
 * undefined". Unknown or missing pieces fall back to neutral blanks.
 */
export function normaliseModel(raw: unknown): Model {
  const r: Raw = isObj(raw) ? raw : {}; const base = emptyModel(str(r.sourceName, 'Workbook'));
  const s: Raw = isObj(r.settings) ? r.settings : {};
  const rec = <T,>(v: unknown, d: Record<string, T>, ok: (x: unknown) => boolean = () => true): Record<string, T> => { const out: Record<string, T> = { ...d }; if (isObj(v)) for (const [k, x] of Object.entries(v)) if (ok(x)) out[k] = x as T; return out; };
  const numOrNull = (x: unknown) => x === null || nul(x) !== null;
  const m: Model = {
    ...base,
    programmeName: str(r.programmeName), contextBrief: str(r.contextBrief), factoryRoles: rec<string>(r.factoryRoles, {}, (x) => typeof x === 'string'),
    sourceName: str(r.sourceName, 'Workbook'), dictionary: rec<string>(r.dictionary, {}, (x) => typeof x === 'string'),
    settings: {
      ...base.settings,
      plannedWeeks: rec<number | null>(s.plannedWeeks, {}, numOrNull),
      oeeMode: s.oeeMode === 'Passport' || s.oeeMode === 'None' ? s.oeeMode : 'Model', stressTest: s.stressTest === true, stressPct: nul(s.stressPct) ?? 0.1,
      limits: rec<number | null>(s.limits, DEFAULT_LIMITS, numOrNull), shiftHours: rec<number | null>(s.shiftHours, DEFAULT_SHIFT_HOURS, numOrNull),
      defaultWhd: nul(s.defaultWhd), lowUtilThreshold: s.lowUtilThreshold === undefined ? 0.4 : nul(s.lowUtilThreshold), defaultComplexity: str(s.defaultComplexity, 'Standard'),
      confirmed: { ...Object.fromEntries(PLACEHOLDERS.map((p) => [p, false])), ...rec<boolean>(s.confirmed, {}, (x) => typeof x === 'boolean') },
      lists: { ...base.settings.lists, ...(isObj(s.lists) ? Object.fromEntries(Object.entries(s.lists).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).map(String)])) : {}) },
      costEntries: arr(s.costEntries).map((k, i) => ({ id: str(k.id, `K${i + 1}`), asset: str(k.asset), cost: nul(k.cost), unc: nul(k.unc), raw: str(k.raw) })),
    },
    assets: arr(r.assets).map((a, i): Asset => ({ id: str(a.id, `A${i + 1}`), factory: str(a.factory), cell: str(a.cell), asset: str(a.asset), note: str(a.note), demand: nul(a.demand), complexity: str(a.complexity), shift: str(a.shift), machines: nul(a.machines), oee: nul(a.oee), plannedLosses: nul(a.plannedLosses), loadHrs: nul(a.loadHrs),
      modelShift: str(a.modelShift, str(a.shift)), modelOee: a.modelOee === undefined ? nul(a.oee) : nul(a.modelOee), modelPlannedLosses: nul(a.modelPlannedLosses), modelLoad: a.modelLoad === undefined ? nul(a.loadHrs) : nul(a.modelLoad),
      passportShift: str(a.passportShift), passportOee: nul(a.passportOee), passportPlannedLosses: nul(a.passportPlannedLosses), passportLoadHrs: nul(a.passportLoadHrs), passportUtilisation: nul(a.passportUtilisation), operationQty: nul(a.operationQty),
      costPerMachine: nul(a.costPerMachine), spacePerMachine: nul(a.spacePerMachine), costUncPct: nul(a.costUncPct), vaPct: nul(a.vaPct), envaPct: nul(a.envaPct), inspectionHrs: nul(a.inspectionHrs) })),
    cellLines: arr(r.cellLines).map((c, i): CellLine => ({ id: str(c.id, `C${i + 1}`), factory: str(c.factory), cell: str(c.cell), note: str(c.note), vaHrs: nul(c.vaHrs), envaHrs: nul(c.envaHrs), nvaHrs: nul(c.nvaHrs), extraFootprint: nul(c.extraFootprint), passport: c.passport === true, version: str(c.version), date: str(c.date),
      demandUnits: nul(c.demandUnits), inspectionHrs: nul(c.inspectionHrs), opsHrs: nul(c.opsHrs), leanHrs: nul(c.leanHrs), footprint: nul(c.footprint), allocatedSpace: nul(c.allocatedSpace) })),
    fpds: arr(r.fpds).map((p, i): Fpd => { const route = Array.isArray(p.route) ? (p.route as unknown[]).map(String) : str(p.cell) ? [str(p.cell)] : []; return { id: str(p.id, `FPD-${String(i + 1).padStart(2, '0')}`), name: str(p.name), cell: route[0] ?? '', route, hours: nul(p.hours), volume: nul(p.volume), whd: nul(p.whd), version: str(p.version), date: str(p.date) }; }),
    links: arr(r.links).map((l, i) => ({ id: str(l.id, `L${i + 1}`), parent: str(l.parent), child: str(l.child), rule: l.rule === 'After N units' || l.rule === 'Overlap %' ? l.rule : 'Complete', param: nul(l.param), transferDays: nul(l.transferDays) ?? 0, adjustTakts: nul(l.adjustTakts) ?? 0 })),
    levers: LEVER_PRESETS.map((p, i) => { const l = arr(r.levers)[i]; return l ? { id: str(l.id, p.id), name: str(l.name, p.name), factory: str(l.factory), loadPct: nul(l.loadPct) ?? 0, oeePts: nul(l.oeePts) ?? 0, machinesAdd: nul(l.machinesAdd) ?? 0, shift: str(l.shift) } : { ...p }; }),
    scenarios: arr(r.scenarios).map((x, i) => ({ id: str(x.id, `S${i + 1}`), name: str(x.name), factory: str(x.factory), cell: str(x.cell), asset: str(x.asset), loadPct: nul(x.loadPct) ?? 0, oeePts: nul(x.oeePts) ?? 0, machinesAdd: nul(x.machinesAdd) ?? 0, shift: str(x.shift), note: str(x.note), reroute: nul(x.reroute) ?? 0 })),
    register: arr(r.register).map((x, i) => ({ id: str(x.id, `R${String(i + 1).padStart(2, '0')}`), type: x.type === 'Assumption' || x.type === 'Opportunity' || x.type === 'Action' ? x.type : 'Risk', title: str(x.title), owner: str(x.owner), timeImpact: nul(x.timeImpact), costImpact: nul(x.costImpact), due: str(x.due), status: str(x.status, 'Open'), link: str(x.link), probability: nul(x.probability) })),
    assessor: (() => { const a: Raw = isObj(r.assessor) ? r.assessor : {}; const ev = isObj(a.evidence) ? a.evidence : {};
      return { cells: Array.isArray(a.cells) ? (a.cells as unknown[]).map(String) : [], ratings: rec<'Met' | 'Partial' | 'Not met' | ''>(a.ratings, {}, (x) => x === 'Met' || x === 'Partial' || x === 'Not met' || x === ''),
        evidence: Object.fromEntries(GATES.map((g) => [g, Array.isArray(ev[g]) ? Array.from({ length: 6 }, (_, k) => (ev[g] as unknown[])[k] === true) : Array(6).fill(false)])) }; })(),
  };
  // every factory that appears on a line has a planned-weeks slot
  [...m.assets, ...m.cellLines].forEach((x) => { if (x.factory && m.settings.plannedWeeks[x.factory] === undefined) m.settings.plannedWeeks[x.factory] = null; });
  return m;
}
