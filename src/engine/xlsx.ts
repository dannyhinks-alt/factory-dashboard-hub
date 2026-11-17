import * as XLSX from 'xlsx';
import { DEFAULT_LIMITS, DEFAULT_SHIFT_HOURS, DICTIONARY, GATES, PLACEHOLDERS, SHEETS, THEMES } from './constants';
import { calendarHours, cells, compareRows, costByFactory } from './calc';
import { fpdCalc, solve } from './flow';
import { pressureList } from './sensitivity';
import { emptyModel } from './demo';
import type { Model, OeeMode, RegType, Rating, StartRule } from './types';

type Row = unknown[];
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
export function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = str(v).replace(/[£,\s]/g, '');
  if (!s) return null;
  const pc = s.endsWith('%'); const n = Number(pc ? s.slice(0, -1) : s);
  return Number.isFinite(n) ? (pc ? n / 100 : n) : null;
}
const frac = (v: unknown) => { const n = toNum(v); return n === null ? null : n > 1.5 ? n / 100 : n; };
const yes = (v: unknown) => /^(y|yes|true|1|confirmed)$/i.test(str(v));
export function isoDate(v: unknown): string {
  if (typeof v === 'number' && v > 20000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const s = str(v); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

function rowsOf(wb: XLSX.WorkBook, name: string): Row[] {
  const real = wb.SheetNames.find((n) => n.trim().toLowerCase() === name.toLowerCase());
  if (!real) return [];
  return XLSX.utils.sheet_to_json<Row>(wb.Sheets[real], { header: 1, defval: '', raw: true, blankrows: true });
}

type Spec = Record<string, string[]>; // field -> aliases (normalised)
function table(rows: Row[], spec: Spec, required: string[]): Record<string, unknown>[] {
  let hr = -1; let cols: Record<string, number> = {};
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const c: Record<string, number> = {};
    rows[r].forEach((v, i) => { const k = norm(v); for (const [f, al] of Object.entries(spec)) if (c[f] === undefined && al.includes(k)) c[f] = i; });
    if (required.every((f) => c[f] !== undefined)) { hr = r; cols = c; break; }
  }
  if (hr < 0) return [];
  const out: Record<string, unknown>[] = []; let blanks = 0;
  const keyCols = Object.values(cols);
  for (let r = hr + 1; r < rows.length; r++) {
    const rec: Record<string, unknown> = {}; let any = false;
    for (const [f, i] of Object.entries(cols)) { rec[f] = rows[r][i]; if (str(rows[r][i]) !== '') any = true; }
    void keyCols;
    if (!any) { if (++blanks >= 4) break; continue; }
    blanks = 0; out.push(rec);
  }
  return out;
}

const pickRule = (v: unknown): StartRule => { const s = str(v).toLowerCase(); return s.startsWith('after') ? 'After N units' : s.startsWith('over') ? 'Overlap %' : 'Complete'; };
const pickType = (v: unknown): RegType => { const s = str(v).toLowerCase(); return s.startsWith('r') ? 'Risk' : s.startsWith('as') ? 'Assumption' : s.startsWith('o') ? 'Opportunity' : 'Action'; };
const pickRating = (v: unknown): Rating => { const s = str(v).toLowerCase(); return s === 'met' ? 'Met' : s.startsWith('part') ? 'Partial' : s.replace(/\s/g, '') === 'notmet' ? 'Not met' : ''; };
const FPD_ID = (v: unknown) => { const s = str(v).toUpperCase(); const m = s.match(/(\d+)/); return /^FPD/.test(s) && m ? `FPD-${m[1].padStart(2, '0')}` : s; };

export interface ParseResult { model: Model; warnings: string[]; tabsFound: string[]; tabsMissing: string[] }

export function parseWorkbook(wb: XLSX.WorkBook, sourceName: string): ParseResult {
  const m = emptyModel(sourceName); const warnings: string[] = [];
  const have = SHEETS.filter((s) => wb.SheetNames.some((n) => n.trim().toLowerCase() === s.toLowerCase()));
  const missing = SHEETS.filter((s) => !have.includes(s));
  // ---- Settings
  m.settings.plannedWeeks = {}; m.settings.limits = {}; m.settings.shiftHours = {};
  const lists: Record<string, string[]> = {}; let sawLimits = false, sawShift = false;
  for (const r of rowsOf(wb, 'Settings')) {
    const label = str(r[0]); const l = label.toLowerCase(); const v = r[1];
    if (!label) continue;
    let mm: RegExpMatchArray | null;
    if ((mm = l.match(/^planned weeks\s*(?:-|:|–)?\s*(.+)$/))) m.settings.plannedWeeks[mm[1].trim().toUpperCase()] = toNum(v);
    else if (l === 'oee mode') m.settings.oeeMode = (['Model', 'Passport', 'None'].find((x) => x.toLowerCase() === str(v).toLowerCase()) as OeeMode) ?? 'Model';
    else if (l.includes('stress test') && l.includes('apply')) m.settings.stressTest = yes(v);
    else if (l.startsWith('stress test')) m.settings.stressPct = frac(v) ?? 0.1;
    else if ((mm = label.match(/^limit\s*(?:-|:|–)?\s*(.+)$/i))) { m.settings.limits[mm[1].trim()] = frac(v); sawLimits = true; }
    else if ((mm = label.match(/^shift hours\s*(?:-|:|–)?\s*(.+)$/i))) { m.settings.shiftHours[mm[1].trim()] = toNum(v); sawShift = true; }
    else if (l.startsWith('default working hours')) m.settings.defaultWhd = toNum(v);
    else if (l.startsWith('low utilisation') || l.startsWith('low-utilisation')) m.settings.lowUtilThreshold = frac(v);
    else if ((mm = label.match(/^confirm\s*(?:-|:|–)?\s*(.+)$/i))) m.settings.confirmed[mm[1].trim()] = yes(v);
    else if ((mm = label.match(/^list\s*(?:-|:|–)?\s*(.+)$/i))) lists[mm[1].trim()] = str(v).split(/[;,]/).map((x) => x.trim()).filter(Boolean);
  }
  if (!sawLimits) m.settings.limits = { ...DEFAULT_LIMITS };
  if (!sawShift) m.settings.shiftHours = { ...DEFAULT_SHIFT_HOURS };
  if (Object.keys(m.settings.plannedWeeks).length === 0) m.settings.plannedWeeks = { HT: null, DPF: null };
  PLACEHOLDERS.forEach((p) => { if (m.settings.confirmed[p] === undefined) m.settings.confirmed[p] = false; });
  if (Object.keys(lists).length) m.settings.lists = { ...m.settings.lists, ...lists };
  // ---- Data
  let id = 0;
  const data = table(rowsOf(wb, 'Data'), {
    factory: ['factory'], cell: ['cell'], asset: ['asset'], complexity: ['complexityclass', 'complexity'], shift: ['shiftpattern', 'shift'], machines: ['machines', 'numberofmachines'],
    oee: ['oee', 'modeloee'], pOee: ['passportoee'], load: ['annualload', 'loadhours', 'annualloadhours'], pLoad: ['passportload', 'passportloadhours'],
    cost: ['costpermachine', 'cost'], space: ['spacepermachine', 'space'], unc: ['costuncertainty', 'uncertainty'], va: ['va'], enva: ['enva'],
  }, ['factory', 'asset']);
  m.assets = data.map((r) => ({ id: `A${++id}`, factory: str(r.factory).toUpperCase(), cell: str(r.cell), asset: str(r.asset), complexity: str(r.complexity), shift: str(r.shift), machines: toNum(r.machines),
    oee: frac(r.oee), passportOee: frac(r.pOee), loadHrs: toNum(r.load), passportLoadHrs: toNum(r.pLoad), costPerMachine: toNum(r.cost), spacePerMachine: toNum(r.space), costUncPct: frac(r.unc), vaPct: frac(r.va), envaPct: frac(r.enva) }));
  m.assets.forEach((a) => { if (a.factory && m.settings.plannedWeeks[a.factory] === undefined) m.settings.plannedWeeks[a.factory] = null; });
  // ---- FPD
  m.fpds = table(rowsOf(wb, 'FPD'), { id: ['fpd', 'fpdid', 'fpdno'], name: ['name', 'description', 'fpdname'], cell: ['cell'], hours: ['hours', 'totalhours'], volume: ['volume', 'units'], whd: ['workinghoursperday', 'workinghday', 'whd'] }, ['id', 'hours'])
    .filter((r) => str(r.id)).map((r) => ({ id: FPD_ID(r.id), name: str(r.name), cell: str(r.cell), hours: toNum(r.hours), volume: toNum(r.volume), whd: toNum(r.whd) }));
  // ---- Links
  id = 0;
  m.links = table(rowsOf(wb, 'Lead time'), { parent: ['parentfpd', 'parent'], child: ['childfpd', 'child'], rule: ['startrule', 'rule'], param: ['n', 'value', 'param', 'noverlap', 'nunitsoverlap'], transfer: ['transferdays', 'transfer'], adjust: ['adjustintakts', 'adjust'] }, ['parent', 'child'])
    .map((r) => ({ id: `L${++id}`, parent: FPD_ID(r.parent), child: FPD_ID(r.child), rule: pickRule(r.rule), param: toNum(r.param), transferDays: toNum(r.transfer) ?? 0, adjustTakts: toNum(r.adjust) ?? 0 }));
  // ---- Levers
  const lv = table(rowsOf(wb, 'Levers'), { id: ['set'], name: ['name', 'description'], factory: ['scopefactory', 'factory'], load: ['loadchange', 'loadchangepct'], oee: ['oeechangepts', 'oeechange'], machines: ['machinesadded', 'machinesadd'], shift: ['shiftpattern', 'shift'] }, ['id', 'load']);
  if (lv.length) m.levers = lv.slice(0, 3).map((r, i) => ({ id: str(r.id) || `Set ${'ABC'[i]}`, name: str(r.name), factory: str(r.factory).replace(/^all$/i, '').toUpperCase(), loadPct: frac(r.load) ?? 0, oeePts: frac(r.oee) ?? 0, machinesAdd: toNum(r.machines) ?? 0, shift: str(r.shift) }));
  // ---- Scenarios
  id = 0;
  m.scenarios = table(rowsOf(wb, 'Scenarios'), { name: ['scenario', 'name'], factory: ['factory'], cell: ['cell'], asset: ['asset'], load: ['loadchange', 'loadchangepct'], oee: ['oeechangepts', 'oeechange'], machines: ['machinesadded', 'machinesadd'], shift: ['shiftpattern', 'shift'], note: ['note', 'notes'] }, ['name', 'asset'])
    .map((r) => ({ id: `S${++id}`, name: str(r.name), factory: str(r.factory).toUpperCase(), cell: str(r.cell), asset: str(r.asset), loadPct: frac(r.load) ?? 0, oeePts: frac(r.oee) ?? 0, machinesAdd: toNum(r.machines) ?? 0, shift: str(r.shift), note: str(r.note) }));
  // ---- Register
  m.register = table(rowsOf(wb, 'Register'), { id: ['ref', 'id'], type: ['type'], title: ['title', 'description'], owner: ['owner'], t: ['timeimpact', 'time'], c: ['costimpact', 'cost'], due: ['due', 'duedate'], status: ['status'], link: ['linked', 'linkedcellfpd', 'link'] }, ['title', 'type'])
    .map((r, i) => ({ id: str(r.id) || `R${String(i + 1).padStart(2, '0')}`, type: pickType(r.type), title: str(r.title), owner: str(r.owner), timeImpact: toNum(r.t), costImpact: toNum(r.c), due: isoDate(r.due), status: str(r.status) || 'Open', link: str(r.link) }));
  // ---- Assessor
  const arows = rowsOf(wb, 'Assessor');
  table(arows, { gate: ['gate'], theme: ['themeno', 'theme'], rating: ['rating'] }, ['gate', 'theme', 'rating']).forEach((r) => {
    const g = GATES.find((x) => x.toLowerCase() === str(r.gate).toLowerCase()); const t = Math.round(toNum(r.theme) ?? 0);
    if (g && t >= 1 && t <= THEMES.length) m.assessor.ratings[`${g}|${t}`] = pickRating(r.rating);
  });
  table(arows, { gate: ['evidencegate'], e1: ['evidence1'], e2: ['evidence2'], e3: ['evidence3'], e4: ['evidence4'], e5: ['evidence5'], e6: ['evidence6'] }, ['gate', 'e1']).forEach((r) => {
    const g = GATES.find((x) => x.toLowerCase() === str(r.gate).toLowerCase());
    if (g) m.assessor.evidence[g] = [r.e1, r.e2, r.e3, r.e4, r.e5, r.e6].map(yes);
  });
  // ---- Dictionary
  table(rowsOf(wb, 'Dictionary'), { term: ['term'], def: ['definition', 'meaning'] }, ['term', 'def']).forEach((r) => { if (str(r.term) && str(r.def)) m.dictionary[str(r.term)] = str(r.def); });
  if (!m.assets.length) warnings.push('No asset rows were found on the Data tab.');
  if (missing.length) warnings.push(`Tabs not found (treated as empty): ${missing.join(', ')}`);
  return { model: m, warnings, tabsFound: have, tabsMissing: missing };
}

export function readWorkbook(buf: ArrayBuffer | Uint8Array, name: string): ParseResult & { wb: XLSX.WorkBook } {
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  return { ...parseWorkbook(wb, name), wb };
}

// ================= WRITE =================
const sheet = (aoa: unknown[][], widths?: number[]) => { const ws = XLSX.utils.aoa_to_sheet(aoa); if (widths) ws['!cols'] = widths.map((w) => ({ wch: w })); return ws; };
const o = (v: number | null) => (v === null ? '' : v);

export function buildSheets(m: Model, uplift = 0): Record<string, XLSX.WorkSheet> {
  const S: Record<string, XLSX.WorkSheet> = {};
  const title = (t: string) => [[t], ['Edit the blue-header tables only; engine outputs are regenerated on export.'], []];
  // Settings
  const set: unknown[][] = [['SETTINGS'], ['Label', 'Value'], ...Object.entries(m.settings.plannedWeeks).map(([f, v]) => [`Planned Weeks ${f}`, o(v)]),
    ['OEE Mode', m.settings.oeeMode], ['Apply Capacity Stress Test', m.settings.stressTest ? 'YES' : 'NO'], ['Stress Test %', m.settings.stressPct],
    ...Object.entries(m.settings.limits).map(([k, v]) => [`Limit ${k}`, o(v)]), ...Object.entries(m.settings.shiftHours).map(([k, v]) => [`Shift Hours ${k}`, o(v)]),
    ['Default Working Hours per Day', o(m.settings.defaultWhd)], ['Low Utilisation Threshold', o(m.settings.lowUtilThreshold)],
    ...PLACEHOLDERS.map((p) => [`Confirm: ${p}`, m.settings.confirmed[p] ? 'YES' : 'NO']), ...Object.entries(m.settings.lists).map(([k, v]) => [`List: ${k}`, v.join(', ')])];
  S.Settings = sheet(set, [36, 40]);
  S.Data = sheet([...title('DATA: FACTORY > CELL > ASSET'), ['Factory', 'Cell', 'Asset', 'Complexity Class', 'Shift Pattern', 'Machines', 'OEE %', 'Passport OEE %', 'Annual Load (h)', 'Passport Load (h)', 'Cost per Machine (£)', 'Space per Machine (m²)', 'Cost Uncertainty %', 'VA %', 'ENVA %'],
    ...m.assets.map((a) => [a.factory, a.cell, a.asset, a.complexity, a.shift, o(a.machines), o(a.oee), o(a.passportOee), o(a.loadHrs), o(a.passportLoadHrs), o(a.costPerMachine), o(a.spacePerMachine), o(a.costUncPct), o(a.vaPct), o(a.envaPct)])], [10, 18, 22, 16, 16, 10, 9, 14, 14, 16, 18, 18, 18, 8, 8]);
  S.FPD = sheet([...title('FPD: FLOW PRODUCT DEFINITIONS'), ['FPD', 'Name', 'Cell', 'Hours', 'Volume', 'Working h/day'], ...m.fpds.map((p) => [p.id, p.name, p.cell, o(p.hours), o(p.volume), o(p.whd)])], [10, 28, 18, 10, 10, 14]);
  const flow = solve(m, uplift);
  S['Lead time'] = sheet([...title('LEAD TIME & DEPENDENCIES'), ['Parent FPD', 'Child FPD', 'Start rule', 'N / Overlap %', 'Transfer days', 'Adjust in takts', '', 'Result FPD', 'Lead time (days/unit)', 'Duration (days)', 'Start (day)', 'End (day)', "WIP (Little's Law)"],
    ...Array.from({ length: Math.max(m.links.length, m.fpds.length) }, (_, i) => { const l = m.links[i], p = m.fpds[i]; const c = p ? flow.calcs[p.id] : undefined, s = p ? flow.sched[p.id] : undefined;
      return [l?.parent ?? '', l?.child ?? '', l?.rule ?? '', l ? o(l.param) : '', l ? l.transferDays : '', l ? l.adjustTakts : '', '', p?.id ?? '', c?.ok ? c.ltUnit : '', c?.ok ? c.duration : '', s ? s.start : '', s ? s.end : '', c?.ok ? c.wip : '']; }),
    [], ['', '', '', '', '', '', '', 'Critical chain', flow.chain.join(' <- ')], ['', '', '', '', '', '', '', 'Programme end (days)', flow.endDay]], [12, 12, 16, 14, 14, 14, 3, 12, 18, 16, 12, 12, 18]);
  S.Levers = sheet([...title('LEVER SETS'), ['Set', 'Name', 'Scope Factory', 'Load Change %', 'OEE Change (pts)', 'Machines Added', 'Shift Pattern'], ...m.levers.map((s) => [s.id, s.name, s.factory || 'All', s.loadPct, s.oeePts, s.machinesAdd, s.shift])], [10, 24, 14, 14, 16, 16, 16]);
  S.Scenarios = sheet([...title('SCENARIO LOG'), ['Scenario', 'Factory', 'Cell', 'Asset', 'Load Change %', 'OEE Change (pts)', 'Machines Added', 'Shift Pattern', 'Note'], ...m.scenarios.map((s) => [s.name, s.factory, s.cell, s.asset, s.loadPct, s.oeePts, s.machinesAdd, s.shift, s.note])], [26, 10, 18, 20, 14, 16, 16, 16, 30]);
  S.Register = sheet([...title('RISKS, ASSUMPTIONS, OPPORTUNITIES & ACTIONS'), ['Ref', 'Type', 'Title', 'Owner', 'Time Impact', 'Cost Impact', 'Due Date', 'Status', 'Linked Cell/FPD'], ...m.register.map((r) => [r.id, r.type, r.title, r.owner, o(r.timeImpact), o(r.costImpact), r.due, r.status, r.link])], [8, 12, 40, 22, 12, 12, 12, 12, 18]);
  const ar: unknown[][] = []; GATES.forEach((g) => THEMES.forEach((t, i) => ar.push([g, i + 1, t, m.assessor.ratings[`${g}|${i + 1}`] ?? '', '', ...(i === 0 || true ? [] : [])])));
  const evRows = GATES.map((g) => [g, ...(m.assessor.evidence[g] ?? Array(6).fill(false)).map((b) => (b ? 'YES' : ''))]);
  const aoa: unknown[][] = [...title('GATE ASSESSOR'), ['Gate', 'Theme No', 'Theme', 'Rating', '', 'Evidence Gate', 'Evidence 1', 'Evidence 2', 'Evidence 3', 'Evidence 4', 'Evidence 5', 'Evidence 6']];
  ar.forEach((r, i) => aoa.push([r[0], r[1], r[2], r[3], '', ...(evRows[i] ?? [])]));
  S.Assessor = sheet(aoa, [14, 10, 40, 12, 3, 14, 10, 10, 10, 10, 10, 10]);
  // Dictionary
  const dict = { ...DICTIONARY, ...m.dictionary };
  S.Dictionary = sheet([...title('DICTIONARY'), ['Term', 'Definition'], ...Object.entries(dict).map(([k, v]) => [k, v])], [28, 110]);
  // Outputs
  const cs = cells(m, 'model');
  S.Dashboard = sheet([...title('DASHBOARD (engine output)'), ['Factory', 'Cell', 'Headroom', 'Band', 'Bottleneck'], ...cs.map((c) => [c.factory, c.cell, o(c.headroom), c.band, c.bottleneck?.asset.asset ?? '']),
    [], ['Factory', 'Extra machines', 'Cost (£)', 'Worst-case cost (£)', 'Likely low (£)', 'Likely high (£)', 'Space (m²)'], ...costByFactory(m).map((r) => [r.factory, r.add, r.cost, r.worstCost, r.likelyLow, r.likelyHigh, r.space]),
    [], ['Factory', 'Not scheduled (h)', 'OEE loss (h)', 'Load (h)', 'Free (h)', 'Overload (h)'], ...calendarHours(m).map((r) => [r.factory, r.notScheduled, r.oeeLoss, r.load, r.free, r.overload])], [14, 20, 12, 10, 24, 18, 18]);
  S.Compare = sheet([...title('MODEL vs PASSPORT (engine output)'), ['Factory', 'Cell', 'Model (no OEE)', 'Model @ Passport OEE', 'Passport', 'Variance', 'Status'], ...compareRows(m).map((r) => [r.factory, r.cell, o(r.noOee), o(r.restated), o(r.passport), o(r.variance), r.align])], [10, 20, 16, 20, 12, 12, 12]);
  S.Sensitivity = sheet([...title('PRESSURE LIST (engine output)'), ['Factory', 'Cell', 'Asset', 'Headroom', 'Load change to break even', 'OEE needed', 'Machines to add', 'Shift pattern needed'], ...pressureList(m).map((p) => [p.c.asset.factory, p.c.asset.cell, p.c.asset.asset, p.headroom, p.loadChange, p.oeeNeeded ?? '', p.machines ?? '', p.shiftNeeded])], [10, 18, 22, 12, 22, 12, 16, 20]);
  void fpdCalc;
  return S;
}

/** Writes engine state back into the workbook structure, preserving any tabs the engine does not own. */
export function exportWorkbook(m: Model, original?: XLSX.WorkBook | null, uplift = 0): Uint8Array {
  const wb = original ? XLSX.read(XLSX.write(original, { type: 'array', bookType: 'xlsx' }), { type: 'array' }) : XLSX.utils.book_new();
  const S = buildSheets(m, uplift);
  const order = SHEETS as readonly string[];
  for (const name of order) {
    const real = wb.SheetNames.find((n) => n.trim().toLowerCase() === name.toLowerCase());
    if (real) { wb.Sheets[real] = S[name]; } else { XLSX.utils.book_append_sheet(wb, S[name], name); }
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

export function modelToWorkbookBytes(m: Model): Uint8Array { return exportWorkbook(m, null); }
