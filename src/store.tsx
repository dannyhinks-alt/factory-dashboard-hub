import { createContext, useContext } from 'react';
import type { CheckResult } from './engine/checks';
import type { FocusTarget, Model, ScopeFilters } from './engine/types';

export interface Ctx {
  model: Model;
  edit: (fn: (d: Model) => void) => void;
  checks: CheckResult;
  filters: ScopeFilters;
  setFilters: (f: Partial<ScopeFilters>) => void;
  focus: FocusTarget | null;
  goTo: (t: FocusTarget) => void;
  help: (term: string) => string;
  asOf: string;
}
export const AppCtx = createContext<Ctx>(null as never);
export const useApp = () => useContext(AppCtx);
