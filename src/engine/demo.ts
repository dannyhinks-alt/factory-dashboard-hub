import { DEFAULT_LIMITS, DEFAULT_LISTS, DEFAULT_SHIFT_HOURS, GATES, PLACEHOLDERS, THEMES } from './constants';
import type { Asset, Model, Rating } from './types';

export function emptyModel(sourceName = 'New workbook'): Model {
  return {
    assets: [], fpds: [], links: [], levers: ['Set A', 'Set B', 'Set C'].map((id) => ({ id, name: id, factory: '', loadPct: 0, oeePts: 0, machinesAdd: 0, shift: '' })), scenarios: [], register: [],
    settings: { plannedWeeks: { HT: null, DPF: null }, oeeMode: 'Model', stressTest: false, stressPct: 0.1, limits: { ...DEFAULT_LIMITS }, shiftHours: { ...DEFAULT_SHIFT_HOURS }, defaultWhd: null, lowUtilThreshold: 0.4,
      confirmed: Object.fromEntries(PLACEHOLDERS.map((p) => [p, false])), lists: structuredClone(DEFAULT_LISTS) },
    assessor: { ratings: {}, evidence: Object.fromEntries(GATES.map((g) => [g, [false, false, false, false, false, false]])) }, dictionary: {}, sourceName,
  };
}

let n = 0;
const A = (factory: string, cell: string, asset: string, complexity: string, shift: string, machines: number | null, oee: number | null, pOee: number | null, load: number | null, pLoad: number | null, cost: number | null, space: number | null, unc: number | null, va: number | null, enva: number | null): Asset =>
  ({ id: `A${++n}`, factory, cell, asset, complexity, shift, machines, oee, passportOee: pOee, loadHrs: load, passportLoadHrs: pLoad, costPerMachine: cost, spacePerMachine: space, costUncPct: unc, vaPct: va, envaPct: enva });

export function demoModel(): Model {
  n = 0; const m = emptyModel('Demo workbook');
  m.settings.plannedWeeks = { HT: 46, DPF: 48 };
  m.settings.defaultWhd = 7.5; m.settings.stressPct = 0.1; m.settings.lowUtilThreshold = 0.4;
  PLACEHOLDERS.forEach((p, i) => (m.settings.confirmed[p] = i < 5));
  m.assets = [
    A('HT', '02_HTMF_UTAQW', 'Vacuum Furnace 1', 'Precision', '3 Shifts', 2, 0.78, 0.8, 2900, 2800, 650000, 18, 0.25, 0.55, 0.3),
    A('HT', '02_HTMF_UTAQW', 'Quench Tank', 'Standard', '3 Shifts', 1, 0.85, 0.85, 2400, 2330, 210000, 9, 0.15, 0.45, 0.35),
    A('HT', '02_HTMF_UTAQW', 'Temper Oven', 'Standard', '2 Shifts', 2, 0.82, null, 3500, 3400, 140000, 7, 0.2, 0.5, 0.3),
    A('DPF', '04_DPF_WELDG', 'Weld Robot 1', 'Complex', '2 Shifts + Sat', 2, 0.72, 0.75, 3400, 3300, 320000, 12, 0.2, 0.6, 0.25),
    A('DPF', '04_DPF_WELDG', 'Weld Robot 2', 'Complex', '2 Shifts', 1, 0.7, 0.7, 1100, 1070, 320000, 12, 0.2, 0.6, 0.25),
    A('DPF', '04_DPF_WELDG', 'Leak Test Rig', 'Simple', '1 Shift', 1, 0.9, 0.9, 600, 580, 85000, 4, 0.1, 0.3, 0.4),
    A('DPF', '07_DPF_MACHN', 'CNC Mill 1', 'Precision', '3 Shifts', 3, 0.68, 0.7, 3300, 3200, 480000, 14, 0.3, 0.5, 0.2),
    A('DPF', '07_DPF_MACHN', 'CNC Lathe 1', 'Standard', '2 Shifts', 2, 0.75, 0.75, 3000, 2900, 260000, 10, 0.2, 0.55, 0.25),
    A('DPF', '07_DPF_MACHN', 'CMM Inspection', 'Precision', '1 Shift', 1, null, 0.8, 500, null, null, 6, null, 0.1, 0.6),
  ];
  const fp: [string, string, string, number | null, number | null][] = [
    ['Forging blanks', '02_HTMF_UTAQW', '', 900, 300], ['Rough machining', '07_DPF_MACHN', '', 1200, 300], ['Heat treat stage 1', '02_HTMF_UTAQW', '', 750, 300],
    ['Finish machining', '07_DPF_MACHN', '', 1500, 300], ['Heat treat stage 2', '02_HTMF_UTAQW', '', 3600, 300], ['Weld sub-assembly A', '04_DPF_WELDG', '', 1000, 300],
    ['Weld sub-assembly B', '04_DPF_WELDG', '', 1200, 300], ['Final weld & test', '04_DPF_WELDG', '', 2600, 300], ['Inspection', '07_DPF_MACHN', '', 700, 300], ['Despatch pack', '04_DPF_WELDG', '', 900, 300],
  ];
  m.fpds = fp.map(([name, cell, , hours, volume], i) => ({ id: `FPD-${String(i + 1).padStart(2, '0')}`, name, cell, hours, volume, whd: i === 8 ? null : 7.5 }));
  const L = (p: number, c: number, rule: 'Complete' | 'After N units' | 'Overlap %', param: number | null, t: number, adj: number) => ({ id: `L${m.links.length + 1}`, parent: `FPD-${String(p).padStart(2, '0')}`, child: `FPD-${String(c).padStart(2, '0')}`, rule, param, transferDays: t, adjustTakts: adj });
  m.links = [L(1, 2, 'Complete', null, 1, 0), L(1, 3, 'After N units', 30, 0.5, 0), L(2, 4, 'Overlap %', 40, 0, 0), L(1, 5, 'Complete', null, 2, 0), L(3, 6, 'Complete', null, 0.5, 0),
    L(4, 7, 'Overlap %', 25, 0, 0), L(5, 8, 'Complete', null, 1, 0), L(6, 8, 'After N units', 60, 0, 0), L(7, 9, 'Complete', null, 1, 0), L(8, 10, 'Complete', null, 0.5, 0), L(9, 10, 'Complete', null, 0, 0)];
  m.levers = [
    { id: 'Set A', name: 'Add shift cover', factory: '', loadPct: 0, oeePts: 0, machinesAdd: 0, shift: '3 Shifts' },
    { id: 'Set B', name: 'OEE programme', factory: 'DPF', loadPct: 0, oeePts: 0.05, machinesAdd: 0, shift: '' },
    { id: 'Set C', name: 'Buy machines', factory: '', loadPct: 0, oeePts: 0, machinesAdd: 1, shift: '' },
  ];
  m.scenarios = [{ id: 'S1', name: 'Add third weld robot', factory: 'DPF', cell: '04_DPF_WELDG', asset: 'Weld Robot 1', loadPct: 0, oeePts: 0, machinesAdd: 1, shift: '', note: 'Capital request pending' }];
  m.register = [
    { id: 'R01', type: 'Risk', title: 'Vacuum furnace supplier delay', owner: 'Engineering Lead', timeImpact: 4, costImpact: 4, due: '', status: 'Open', link: '02_HTMF_UTAQW' },
    { id: 'R02', type: 'Risk', title: 'Operator skills gap on CNC', owner: 'Operations Manager', timeImpact: 3, costImpact: 3, due: '', status: 'Open', link: '07_DPF_MACHN' },
    { id: 'R03', type: 'Assumption', title: 'Forged blank supply holds at 300 per month', owner: '', timeImpact: 2, costImpact: 2, due: '', status: 'Open', link: 'FPD-01' },
    { id: 'R04', type: 'Opportunity', title: 'Cross-train welders to cover leak test', owner: 'Lean Lead', timeImpact: null, costImpact: null, due: '', status: 'Open', link: '04_DPF_WELDG' },
    { id: 'R05', type: 'Action', title: 'Confirm passport OEE for temper oven', owner: 'Lean Lead', timeImpact: 2, costImpact: 1, due: '2025-01-31', status: 'Open', link: '02_HTMF_UTAQW' },
    { id: 'R06', type: 'Action', title: 'Issue purchase order for weld robot', owner: 'Programme Manager', timeImpact: 3, costImpact: 4, due: '2099-12-31', status: 'In progress', link: '04_DPF_WELDG' },
  ];
  const ev: Record<string, Rating[]> = {
    Define: ['Met', 'Met', 'Met', 'Met', 'Met', 'Met', 'Met'], Concept: ['Met', 'Met', 'Met', 'Partial', 'Met', 'Partial', 'Met'],
    Design: ['Met', 'Partial', 'Met', 'Partial', 'Partial', 'Not met', 'Not met'], Prove: ['Partial', 'Not met', '', '', '', '', ''], Launch: ['', '', '', '', '', '', ''], Consolidation: ['', '', '', '', '', '', ''],
  };
  GATES.forEach((g) => THEMES.forEach((_, i) => (m.assessor.ratings[`${g}|${i + 1}`] = ev[g][i])));
  m.assessor.evidence = { Define: [true, true, true, true, true, true], Concept: [true, true, true, true, false, false], Design: [true, true, false, false, false, false], Prove: [true, false, false, false, false, false], Launch: [false, false, false, false, false, false], Consolidation: [false, false, false, false, false, false] };
  m.dictionary = {};
  return m;
}
