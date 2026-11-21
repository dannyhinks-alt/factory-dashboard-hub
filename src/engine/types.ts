export type Severity = 'ERROR' | 'WARN' | 'INFO';
export type Rating = 'Met' | 'Partial' | 'Not met' | '';
export type OeeMode = 'Model' | 'Passport' | 'None';
export type Source = 'Both' | 'Passport' | 'Model';
export type StartRule = 'Complete' | 'After N units' | 'Overlap %';
export type RegType = 'Risk' | 'Assumption' | 'Opportunity' | 'Action';

export interface Asset {
  id: string;
  factory: string;
  cell: string;
  asset: string;
  note: string;
  demand: number | null; // optional per-asset override of the cell-line demand
  complexity: string;
  /** Active values used by every calculation: Factory Model value, else the Passport value. */
  shift: string;
  machines: number | null;
  oee: number | null;
  plannedLosses: number | null; // hrs/yr
  loadHrs: number | null;
  /** Factory Model block as typed (blank = no factory-model pair). */
  modelShift: string;
  modelOee: number | null;
  modelPlannedLosses: number | null;
  modelLoad: number | null;
  /** ASSET LINE: PASSPORT (OEE-adjusted) block as typed. */
  passportShift: string;
  passportOee: number | null;
  passportPlannedLosses: number | null;
  passportLoadHrs: number | null;
  passportUtilisation: number | null;
  operationQty: number | null;
  costPerMachine: number | null;
  installCostPerMachine: number | null;
  spacePerMachine: number | null;
  costUncPct: number | null;
  costNote: string;
  vaPct: number | null;
  envaPct: number | null;
  inspectionHrs: number | null; // must sit on the cell line, flagged if typed here
}

export interface CellLine {
  id: string;
  factory: string;
  cell: string;
  note: string;
  vaHrs: number | null;
  envaHrs: number | null;
  nvaHrs: number | null;
  extraFootprint: number | null;
  passport: boolean;
  version: string;
  date: string;
  demandUnits: number | null;
  inspectionHrs: number | null;
  opsHrs: number | null;
  leanHrs: number | null;
  footprint: number | null;
  allocatedSpace: number | null;
}

export interface CostEntry { id: string; asset: string; cost: number | null; unc: number | null; raw: string }

export interface Fpd {
  id: string; // FPD-01
  name: string;
  cell: string; // first cell of the route (kept for lookups)
  route: string[]; // every cell the product family passes through, possibly across factories
  hours: number | null;
  volume: number | null;
  whd: number | null;
  version: string;
  date: string;
}

export interface Link {
  id: string;
  parent: string;
  child: string;
  rule: StartRule;
  param: number | null;
  transferDays: number;
  adjustTakts: number;
}

export interface LeverSet {
  id: string; // Set A
  name: string;
  factory: string; // '' = all
  loadPct: number;
  oeePts: number;
  machinesAdd: number;
  shift: string; // '' = unchanged
}

export interface Scenario {
  id: string;
  name: string;
  factory: string;
  cell: string;
  asset: string;
  loadPct: number;
  oeePts: number;
  machinesAdd: number;
  shift: string;
  note: string;
  reroute: number; // hours re-routed (+in / −out); each scenario must net to zero
}

export interface RegItem {
  id: string;
  type: RegType;
  title: string;
  owner: string;
  timeImpact: number | null;
  costImpact: number | null;
  due: string; // ISO yyyy-mm-dd or ''
  status: string;
  link: string;
  probability: number | null;
}

export interface Settings {
  plannedWeeks: Record<string, number | null>;
  oeeMode: OeeMode;
  stressTest: boolean;
  stressPct: number;
  limits: Record<string, number | null>;
  shiftHours: Record<string, number | null>;
  defaultWhd: number | null;
  lowUtilThreshold: number | null;
  confirmed: Record<string, boolean>;
  lists: Record<string, string[]>;
  defaultComplexity: string;
  costEntries: CostEntry[];
}

export interface Assessor {
  ratings: Record<string, Rating>; // `${gate}|${theme}`
  evidence: Record<string, boolean[]>; // gate -> 6 flags
  cells: string[]; // cells listed on the Assessor
  gpRatings: Record<string, Rating>;      // `${cell}|${gate}|${themeNo}` — Gate & Passport Status tab
  gpDateReviewed: Record<string, string>; // `${cell}|${gate}`
  gpHeadlineNote: Record<string, string>; // `${cell}|${gate}`
}

export interface Model {
  programmeName: string;
  contextBrief: string;
  factoryRoles: Record<string, string>;
  /** Provenance of wizard-filled values: key ("factory:HT:plannedWeeks", "asset:A1:shift" …) → assumption label. A key means "Assumed Default"; no key means user or workbook data. */
  assumedFields: Record<string, string>;
  assets: Asset[];
  cellLines: CellLine[];
  fpds: Fpd[];
  links: Link[];
  levers: LeverSet[];
  scenarios: Scenario[];
  register: RegItem[];
  settings: Settings;
  assessor: Assessor;
  dictionary: Record<string, string>;
  sourceName: string;
}

export interface ScopeFilters {
  factory: string; // All | HT | DPF ...
  topN: 5 | 10;
  source: Source;
  board: 'All' | 'GREEN' | 'AMBER' | 'RED';
  sort: 'Worst first' | 'Best first' | 'Name';
  show: 'Headroom' | 'Utilisation';
  uplift: string;
}

export interface FocusTarget {
  ws: number;
  kind: 'asset' | 'cellline' | 'cell' | 'fpd' | 'link' | 'risk' | 'setting' | 'assessor' | 'lever' | 'scenario' | 'factory' | 'list';
  ref: string;
}

export interface Issue {
  rule: string;
  severity: Severity;
  message: string;
  target?: FocusTarget;
}
