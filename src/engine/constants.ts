export const FACTORY_DEFAULTS = ['HT', 'DPF'];
export const COMPLEXITY = ['Simple', 'Standard', 'Complex', 'Precision'] as const;
export const DEFAULT_LIMITS: Record<string, number> = { Simple: 0.8, Standard: 0.65, Complex: 0.5, Precision: 0.35 };
export const SHIFTS = ['1 Shift', '2 Shifts', '3 Shifts', '4 Shifts', '5 Shifts', '6 Shifts', 'Continuous 24/7', '2 Shifts + Sat', '3 Shifts + Sat'] as const;
export const DEFAULT_SHIFT_HOURS: Record<string, number> = {
  '1 Shift': 40, '2 Shifts': 80, '3 Shifts': 120, '4 Shifts': 160, '5 Shifts': 200, '6 Shifts': 240, 'Continuous 24/7': 168, '2 Shifts + Sat': 90, '3 Shifts + Sat': 130,
};
export const GATES = ['Define', 'Concept', 'Design', 'Prove', 'Launch', 'Consolidation'] as const;
export const THEMES = [
  'Demand & Product Family Definition', 'Capacity & OEE Evidence', 'HS&E: Hazards & Controls', 'Layout & Space',
  'People, Skills & Shift Pattern', 'Cost & Investment Case', 'HS&E: Verification & Sign-off',
] as const;
export const HSE_THEMES = [3, 7];
export const EVIDENCE = [
  'Data source named and dated', 'Owner confirmed', 'Passport reconciled to model', 'Assumptions logged in Register',
  'Peer reviewed', 'Sign-off recorded',
] as const;
export const PLACEHOLDERS = [
  'Planned weeks per factory', 'Complexity class limits', 'Shift calendar hours per week', 'Capacity stress-test uplift',
  'Default working hours per day', 'Cost uncertainty bands', 'Low-utilisation threshold', 'Central lists (owners, statuses)',
] as const;
export const UPLIFTS: Record<string, number> = { Typical: 0, '+10%': 0.1, '+30%': 0.3, '+100%': 1, '+200%': 2 };
export const REG_TYPES = ['Risk', 'Assumption', 'Opportunity', 'Action'] as const;
export const DEFAULT_LISTS: Record<string, string[]> = {
  Owners: ['Programme Manager', 'Lean Lead', 'Operations Manager', 'Engineering Lead', 'HS&E Lead'],
  Statuses: ['Open', 'In progress', 'Closed'],
};
export const GREEN_MIN = 0.1;

export const SHEETS = ['Dashboard', 'Compare', 'Data', 'Assessor', 'FPD', 'Lead time', 'Sensitivity', 'Levers', 'Scenarios', 'Register', 'Settings', 'Dictionary'] as const;

export const DICTIONARY: Record<string, string> = {
  Headroom: 'How much spare capacity an asset has before it hits its complexity-class limit. Headroom = 1 − (effective utilisation ÷ class limit). Positive is spare capacity; negative means overloaded.',
  'Effective Utilisation': 'Annual load hours ÷ (available hours × OEE). It is the share of the real, loss-adjusted capacity that the load consumes.',
  OEE: 'Overall Equipment Effectiveness: the proportion of scheduled time an asset produces good parts at full speed. Blank OEE is treated as 100% and flagged.',
  'OEE Mode': 'Which OEE the calculation uses: Model (the factory model OEE), Passport (the Cell Design Passport OEE) or None (100%).',
  'Passport': 'The Cell Design Passport: the signed-off design figures for a cell. The model is compared against it.',
  'Capacity Stress Test': 'Uplifts every load by the stress-test percentage to see which assets would fail under a demand surge.',
  'Complexity Class': 'Limits how heavily an asset should be loaded. Simple 80%, Standard 65%, Complex 50%, Precision 35% by default; more complex work needs more slack.',
  'Shift Pattern': 'The working pattern. Hours per week come from the Shift Calendar in Settings.',
  'Planned Weeks': 'Productive weeks per year for a factory, after shutdowns and holidays.',
  GREEN: 'Cell headroom of 10% or more.', AMBER: 'Cell headroom between 0% and 10%.', RED: 'Cell headroom below 0%: the cell is overloaded.',
  Bottleneck: 'The asset in a cell with the lowest headroom. It sets the cell headroom.',
  'Worst-Case Range': 'Cost or space if every uncertainty lands at its high end together (straight sum).',
  'Likely Range': 'Root-sum-of-squares of the uncertainties. Independent errors partly cancel, so it is narrower than the worst case.',
  VA: 'Value-adding time: work the customer would pay for.', ENVA: 'Essential non-value-adding time: needed but not valued (set-up, inspection).', NVA: 'Non-value-adding time: waste.',
  'Product Family': 'A group of Variants sharing a process route. Flow Product Definitions (FPD) are defined per Product Family.',
  FPD: 'Flow Product Definition: one flow of work (a Product Family or Variant route) with hours, volume and working hours per day.',
  'Process Lead Time': 'Hours ÷ volume ÷ working hours per day: days of process time per unit.',
  "Little's Law": 'Steady-state work in progress = throughput rate × lead time.',
  'Uplift Case': 'Multiplies lead times to test what happens if the process is slower than typical.',
  'Start Rule': 'How a child FPD may start: after the parent completes, after N parent units, or with a percentage overlap.',
  'Transfer Days': 'Fixed days between parent output and child start (movement, quarantine, inspection).',
  'Adjust in Takts': 'Shifts the child start earlier (negative) or later (positive) by a number of child takts.',
  'Critical Chain': 'The longest chain of dependent FPDs that sets the programme end date.',
  'Break-Even': 'The single change (load, OEE, machines or shift) that brings an asset exactly to zero headroom.',
  'Lever Set': 'A bundle of changes (load, OEE, machines, shift) tested together against the baseline.',
  Scenario: 'A logged what-if with before and after headroom.',
  'Gate Assessor': 'Six lifecycle gates are rated on seven themes: Met, Partial or Not met.',
  'BLOCKED (HS&E)': 'A gate is blocked if Theme 3 or Theme 7 (the HS&E themes) is Not met.',
  'Evidence Check': 'Six-point checklist per gate showing the evidence behind its ratings.',
  Register: 'Risks, Assumptions, Opportunities and Actions in one list, scored 5 × 5 on time and cost impact.',
  'Impact Score': 'Time impact × cost impact (1–5 each). HIGH is 15 or more, MEDIUM is 8 or more.',
  Verdict: 'GOOD: no RED or AMBER cells and no data errors. WATCH: any AMBER cell or ERROR gap. BAD: any RED cell.',
  'Confirm Placeholders': 'Settings that ship as a placeholder until an engineer confirms them as real values.',
  ALIGNED: 'Model and Passport headroom within 2 percentage points.', DRIFTING: 'Difference of 2 to 5 percentage points.',
  DIVERGED: 'Difference over 5 percentage points.', 'NO PAIR': 'No matching Passport figures to compare with.',
  'Calendar Hours': 'Hours in the planned weeks, split into not scheduled, OEE losses, load, and free.',
  'Low-Utilisation': 'Assets using less than the threshold of their effective capacity: candidates to release.',
  'Machines to add': 'Machines needed to bring an asset to its class limit.',
};

/** Practical starting points for the 3-Set Lever Tester, used whenever a set has no values yet. */
export const LEVER_PRESETS = [
  { id: 'Set A', name: 'Set A — OEE & Method Uplift', factory: '', loadPct: -0.1, oeePts: 0.05, machinesAdd: 0, shift: '' },
  { id: 'Set B', name: 'Set B — 3-Shift Expansion', factory: '', loadPct: 0, oeePts: 0, machinesAdd: 0, shift: '3 Shifts' },
  { id: 'Set C', name: 'Set C — CapEx + OEE Lift', factory: '', loadPct: 0, oeePts: 0.03, machinesAdd: 1, shift: '' },
];
/** Quick presets offered on each lever card (they change the levers only, not the name or scope). */
export const QUICK_PRESETS: Record<string, { loadPct: number; oeePts: number; machinesAdd: number; shift: string }> = {
  'Quick Win (-10% Load, +5 OEE)': { loadPct: -0.1, oeePts: 0.05, machinesAdd: 0, shift: '' },
  'Shift Expansion (3 Shifts)': { loadPct: 0, oeePts: 0, machinesAdd: 0, shift: '3 Shifts' },
  'Add +1 Machine': { loadPct: 0, oeePts: 0, machinesAdd: 1, shift: '' },
  'Stress Test (+20% Demand)': { loadPct: 0.2, oeePts: 0, machinesAdd: 0, shift: '' },
  'Reset to 0': { loadPct: 0, oeePts: 0, machinesAdd: 0, shift: '' },
};
