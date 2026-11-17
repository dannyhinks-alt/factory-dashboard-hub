import { createContext, useContext } from 'react';
import type { CheckResult } from './engine/checks';
import type { FocusTarget, Model, ScopeFilters } from './engine/types';

export interface Ctx {
  model: Model;
  edit: (fn: (d: Model) => void, opts?: { silent?: boolean }) => void;
  checks: CheckResult;
  filters: ScopeFilters;
  setFilters: (f: Partial<ScopeFilters>) => void;
  focus: FocusTarget | null;
  goTo: (t: FocusTarget) => void;
  help: (term: string) => string;
  asOf: string;
  status: { verdict: 'GOOD' | 'WATCH' | 'BAD'; reason: string };
  ready: { pct: number; errors: number; clear: number };
  toast: (msg: string, tone?: 'good' | 'warn' | 'info') => void;
}
export const AppCtx = createContext<Ctx>(null as never);
export const useApp = () => useContext(AppCtx);
