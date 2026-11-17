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
  complexity: string;
  shift: string;
  machines: number | null;
  oee: number | null;
  passportOee: number | null;
  loadHrs: number | null;
  passportLoadHrs: number | null;
  costPerMachine: number | null;
  spacePerMachine: number | null;
  costUncPct: number | null;
  vaPct: number | null;
  envaPct: number | null;
}

export interface Fpd {
  id: string; // FPD-01
  name: string;
  cell: string;
  hours: number | null;
  volume: number | null;
  whd: number | null;
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
}

export interface Assessor {
  ratings: Record<string, Rating>; // `${gate}|${theme}`
  evidence: Record<string, boolean[]>; // gate -> 6 flags
}

export interface Model {
  assets: Asset[];
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
  kind: 'asset' | 'cell' | 'fpd' | 'link' | 'risk' | 'setting' | 'assessor' | 'lever' | 'scenario' | 'factory' | 'list';
  ref: string;
}

export interface Issue {
  rule: string;
  severity: Severity;
  message: string;
  target?: FocusTarget;
}
