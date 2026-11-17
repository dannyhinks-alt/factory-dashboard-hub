import { LEVER_PRESETS, DEFAULT_LIMITS, DEFAULT_LISTS, DEFAULT_SHIFT_HOURS, GATES, PLACEHOLDERS } from './constants';
import type { Model } from './types';

export function emptyModel(sourceName = 'New workbook'): Model {
  return {
    programmeName: '', contextBrief: '', factoryRoles: {},
    assets: [], cellLines: [], fpds: [], links: [], levers: LEVER_PRESETS.map((p) => ({ ...p })), scenarios: [], register: [],
    settings: { plannedWeeks: {}, oeeMode: 'Model', stressTest: false, stressPct: 0.1, limits: { ...DEFAULT_LIMITS }, shiftHours: { ...DEFAULT_SHIFT_HOURS }, defaultWhd: null, lowUtilThreshold: 0.4,
      confirmed: Object.fromEntries(PLACEHOLDERS.map((p) => [p, false])), lists: structuredClone(DEFAULT_LISTS), defaultComplexity: 'Standard', costEntries: [] },
    assessor: { cells: [], ratings: {}, evidence: Object.fromEntries(GATES.map((g) => [g, [false, false, false, false, false, false]])) }, dictionary: {}, sourceName,
  };
}
