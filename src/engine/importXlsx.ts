/**
 * Exact-layout importer / writer for the workbook `Data` tab.
 *
 * Columns are mapped by normalised header text (newlines, extra spaces and helper notes after a comma or
 * colon are ignored) AND by the banner row directly above the headers:
 *   FACTORY > CELL > ASSET | FACTORY MODEL | ASSET LINE: PASSPORT (OEE-adjusted) ...
 * Headers that appear in both blocks (Shift pattern, OEE %, Planned losses, Load, Quantity) take their
 * meaning from the banner. Hidden or grouped columns are read like any other column.
 * A row with a blank Asset is a Cell header line; a row with an Asset is an Asset line.
 */
import { calcAsset } from './calc';
import type { Asset, CellLine, Model } from './types';

type Cell = unknown;
export type Group = 'model' | 'passport' | 'other';

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

/** Header text with newlines/extra spaces collapsed and everything after the first comma or colon dropped. */
export const headText = (h: unknown) => str(h).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').split(/[,:;]/)[0].trim();
export const headKey = (h: unknown) => headText(h).toLowerCase().replace(/\([^)]*\)?/g, '').replace(/[^a-z0-9]/g, '');

/** Maps one header to an internal field. `g` is the block (from the banner) the column sits in. */
export function classify(raw: unknown, g: Group): string | null {
  const k = headKey(raw); const pct = /%/.test(str(raw));
  const P = g === 'passport';
  if (k === 'factory' || k === 'linefactory') return 'factory';
  if (k === 'cell' || k === 'linecell') return 'cell';
  if (k.startsWith('asset') && !k.startsWith('assetline')) return 'asset';
  if (k === 'note' || k === 'notes') return 'note';
  if (k.startsWith('demand')) return 'demand';
  if (['quantity', 'machines', 'noofmachines', 'numberofmachines', 'nomachines', 'modelquantity'].includes(k)) return P ? 'qtyPassport' : 'qtyModel';
  if (k === 'complexityclass' || k === 'complexity') return 'complexity';
  if (k === 'modelshift') return 'modelShift';
  if (k === 'modeloee') return 'modelOee';
  if (k === 'modelplannedlosses' || k === 'modelplannedloss') return 'modelPlannedLosses';
  if (k === 'modelload' || k === 'modelannualload') return 'modelLoad';
  if (k === 'passportshift') return 'passportShift';
  if (k === 'passportoee') return 'passportOee';
  if (k === 'passportplannedlosses') return 'passportPlannedLosses';
  if (k === 'passportload' || k === 'passportloadhours' || k === 'passportactualload') return 'passportLoadHrs';
  if (k === 'shiftpattern' || k === 'shift') return P ? 'passportShift' : 'modelShift';
  if (k === 'oee') return P ? 'passportOee' : 'modelOee';
  if (k === 'plannedlosses' || k === 'plannedloss') return P ? 'passportPlannedLosses' : 'modelPlannedLosses';
  if (k === 'actualload' || k === 'load' || k === 'annualload' || k === 'loadhours') return P ? 'passportLoadHrs' : 'modelLoad';
  if (k === 'utilisation' || k === 'utilization') return 'passportUtilisation';
  if (k === 'operationquantity' || k === 'operationqty') return 'operationQty';
  if (k === 'va') return pct ? 'vaPct' : 'vaHrs';
  if (k === 'enva') return pct ? 'envaPct' : 'envaHrs';
  if (k === 'nva') return 'nvaHrs';
  if (k === 'inspection') return 'inspection';
  if (k === 'extrafootprint') return 'extraFootprint';
  if (k === 'footprint') return 'footprint';
  if (k === 'costpermachine' || k === 'cost') return 'cost';
  if (k === 'spacepermachine' || k === 'space') return 'space';
  if (k === 'costuncertainty' || k === 'uncertainty') return 'unc';
  if (k === 'passportcell') return 'passportCell';
  if (k === 'passportversion') return 'version';
  if (k === 'passportdate') return 'date';
  if (k === 'celloperations' || k === 'operations') return 'opsHrs';
  if (k === 'celllean' || k === 'lean') return 'leanHrs';
  if (k === 'allocatedspace') return 'allocatedSpace';
  return null;
}

/** Block of every column, from the banner row: nearest banner text at or to the left of the column. */
export function bannerGroups(banner: Cell[] | undefined, width: number): (Group | null)[] | null {
  if (!banner) return null;
  const marks: { col: number; g: Group }[] = [];
  banner.forEach((v, col) => { const t = str(v).toLowerCase(); if (!t) return; marks.push({ col, g: /passport/.test(t) ? 'passport' : /factory model|factory\s*>|cell\s*>|asset\s*>/.test(t) ? 'model' : 'other' }); });
  if (!marks.some((m) => m.g !== 'other')) return null;
  return Array.from({ length: width }, (_, c) => { let g: Group = 'model'; for (const m of marks) if (m.col <= c) g = m.g; return g; });
}

export interface DataSheetResult { assets: Asset[]; cellLines: CellLine[]; mapped: Record<string, number>; hadBanner: boolean }

export function parseDataSheet(rows: Cell[][]): DataSheetResult {
  const none: DataSheetResult = { assets: [], cellLines: [], mapped: {}, hadBanner: false };
  let hr = -1;
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const keys = (rows[r] ?? []).map(headKey);
    if (keys.includes('factory') && keys.includes('cell') && keys.some((k) => k.startsWith('asset') && !k.startsWith('assetline'))) { hr = r; break; }
  }
  if (hr < 0) return none;
  const header = rows[hr]; const width = header.length;
  let banner: Cell[] | undefined = rows[hr - 1]; if (banner && !banner.some((v) => str(v))) banner = rows[hr - 2];
  const groups = bannerGroups(banner, width);
  const cols: Record<string, number> = {}; const seen = new Set<string>();
  const amb = (k: string) => (k === 'shiftpattern' || k === 'shift' ? 'shift' : k === 'oee' ? 'oee' : k.startsWith('plannedloss') ? 'losses' : ['actualload', 'load', 'annualload'].includes(k) ? 'load' : ['quantity', 'machines'].includes(k) ? 'qty' : null);
  header.forEach((h, c) => {
    if (!str(h)) return;
    const a = amb(headKey(h)); let g: Group;
    if (groups) g = groups[c] ?? 'model';
    else { g = a && seen.has(a) ? 'passport' : 'model'; if (a) seen.add(a); } // no banner: first occurrence = Factory Model, repeat = Passport
    const f = classify(h, g); if (f && cols[f] === undefined) cols[f] = c;
  });
  const out: DataSheetResult = { assets: [], cellLines: [], mapped: cols, hadBanner: !!groups };
  const get = (row: Cell[], f: string) => (cols[f] === undefined ? undefined : row[cols[f]]);
  let blanks = 0, ai = 0, ci = 0;
  for (let r = hr + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const factory = str(get(row, 'factory')).toUpperCase(), cell = str(get(row, 'cell')), asset = str(get(row, 'asset'));
    if (!factory && !cell && !asset) { if (++blanks >= 4) break; continue; }
    blanks = 0;
    if (!asset) { // Cell header line
      if (!cell) continue;
      const fp = toNum(get(row, 'footprint')), xfp = toNum(get(row, 'extraFootprint'));
      out.cellLines.push({ id: `C${++ci}`, factory, cell, note: str(get(row, 'note')), passport: yes(get(row, 'passportCell')), version: str(get(row, 'version')), date: isoDate(get(row, 'date')), demandUnits: toNum(get(row, 'demand')),
        inspectionHrs: toNum(get(row, 'inspection')), opsHrs: toNum(get(row, 'opsHrs')), leanHrs: toNum(get(row, 'leanHrs')), vaHrs: toNum(get(row, 'vaHrs')), envaHrs: toNum(get(row, 'envaHrs')), nvaHrs: toNum(get(row, 'nvaHrs')),
        footprint: fp ?? (cols.footprint !== undefined && cols.extraFootprint === undefined ? xfp : null), extraFootprint: xfp ?? fp, allocatedSpace: toNum(get(row, 'allocatedSpace')) });
      continue;
    }
    const mShift = str(get(row, 'modelShift')), pShift = str(get(row, 'passportShift'));
    const mOee = frac(get(row, 'modelOee')), pOee = frac(get(row, 'passportOee'));
    const mPL = toNum(get(row, 'modelPlannedLosses')), pPL = toNum(get(row, 'passportPlannedLosses'));
    const mLoad = toNum(get(row, 'modelLoad')), pLoad = toNum(get(row, 'passportLoadHrs'));
    out.assets.push({ id: `A${++ai}`, factory, cell, asset, note: str(get(row, 'note')), demand: toNum(get(row, 'demand')), complexity: str(get(row, 'complexity')),
      // active values: Factory Model first, otherwise the Passport block (single-sided Passport rows calculate cleanly)
      shift: mShift || pShift, machines: toNum(get(row, 'qtyModel')) ?? toNum(get(row, 'qtyPassport')), oee: mOee ?? pOee, plannedLosses: mPL ?? pPL, loadHrs: mLoad ?? pLoad,
      modelShift: mShift, modelOee: mOee, modelPlannedLosses: mPL, modelLoad: mLoad,
      passportShift: pShift, passportOee: pOee, passportPlannedLosses: pPL, passportLoadHrs: pLoad, passportUtilisation: frac(get(row, 'passportUtilisation')), operationQty: toNum(get(row, 'operationQty')),
      costPerMachine: toNum(get(row, 'cost')), spacePerMachine: toNum(get(row, 'space')), costUncPct: frac(get(row, 'unc')), vaPct: frac(get(row, 'vaPct')), envaPct: frac(get(row, 'envaPct')), inspectionHrs: toNum(get(row, 'inspection')) });
  }
  // A cell is a Passport cell when its flag says so, else when any of its asset lines carries Passport-block figures.
  if (cols.passportCell === undefined) out.cellLines.forEach((c) => { c.passport = out.assets.some((a) => a.cell === c.cell && (a.passportOee !== null || a.passportLoadHrs !== null || a.passportShift !== '')); });
  return out;
}

// ------------------------------------------------------------------ writer
const o = (v: number | null | undefined) => (v === null || v === undefined ? '' : v);
export const DATA_HEADERS: [string, string[]][] = [
  ['FACTORY > CELL > ASSET', ['Factory', 'Cell', 'Asset (blank on a cell line)', 'Note', 'Demand (units / yr), optional on an asset line', 'Quantity']],
  ['FACTORY MODEL', ['Complexity class', 'Model Shift', 'Model OEE %', 'Model Planned losses (hrs/yr)', 'Model Load (hrs/yr)']],
  ['ASSET LINE: PASSPORT (OEE-adjusted)', ['Utilisation', 'OEE %', 'Shift pattern', 'Planned losses (hrs/yr)', 'Actual load (hrs/yr)', 'Operation quantity', 'VA (hrs/yr)', 'ENVA (hrs/yr)', 'NVA (hrs/yr)', 'Inspection (hrs/yr)', 'Extra footprint']],
  ['COST AND CELL CHECK FIELDS', ['Cost per Machine (£)', 'Space per Machine (m²)', 'Cost Uncertainty %', 'VA %', 'ENVA %', 'Passport cell', 'Passport version', 'Passport date', 'Cell operations (hrs/yr)', 'Cell lean (hrs/yr)', 'Footprint (m²)', 'Allocated space (m²)']],
];

/** Banner row, header row and one row per cell line / asset line, in the exact workbook layout. */
export function dataSheetAoa(m: Model): unknown[][] {
  const banner: unknown[] = []; const header: string[] = [];
  DATA_HEADERS.forEach(([b, hs]) => { banner.push(b, ...Array(hs.length - 1).fill('')); header.push(...hs); });
  const rows: unknown[][] = [];
  const assetRow = (a: Asset) => {
    const pc = calcAsset(m, a, 'passport');
    return [a.factory, a.cell, a.asset, a.note, o(a.demand), o(a.machines),
      a.complexity, a.modelShift, o(a.modelOee), o(a.modelPlannedLosses), o(a.modelLoad),
      o(a.passportUtilisation ?? pc.effUtil), o(a.passportOee), a.passportShift, o(a.passportPlannedLosses), o(a.passportLoadHrs), o(a.operationQty), '', '', '', o(a.inspectionHrs), '',
      o(a.costPerMachine), o(a.spacePerMachine), o(a.costUncPct), o(a.vaPct), o(a.envaPct), '', '', '', '', '', '', ''];
  };
  const lineRow = (c: CellLine) => [c.factory, c.cell, '', c.note, o(c.demandUnits), '', '', '', '', '', '', '', '', '', '', '', '', o(c.vaHrs), o(c.envaHrs), o(c.nvaHrs), o(c.inspectionHrs), o(c.extraFootprint),
    '', '', '', '', '', c.passport ? 'YES' : 'NO', c.version, c.date, o(c.opsHrs), o(c.leanHrs), o(c.footprint), o(c.allocatedSpace)];
  const placed = new Set<string>();
  m.cellLines.forEach((c) => { rows.push(lineRow(c)); m.assets.filter((a) => a.cell === c.cell && !placed.has(a.id)).forEach((a) => { placed.add(a.id); rows.push(assetRow(a)); }); });
  m.assets.filter((a) => !placed.has(a.id)).forEach((a) => rows.push(assetRow(a)));
  return [['DATA: FACTORY > CELL > ASSET'], ['A blank Asset makes the row a cell line. Edit here or in the app.'], banner, header, ...rows];
}
