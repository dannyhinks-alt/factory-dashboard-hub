import { useMemo, useState } from 'react';
import { runChecks } from '../engine/checks';
import { DEFAULT_RULES, applyWizard, scanGaps, validShiftNames } from '../engine/assumed';
import type { WizardRules } from '../engine/assumed';
import { useApp } from '../store';
import { NumInput, Sel } from './kit';

/** Guided 3-step Gap Auto-Fill Wizard: scan → configure standard assumptions → apply and highlight. */
export function AutoFillWizard({ onClose }: { onClose: () => void }) {
  const { model, edit, filters, toast, asOf } = useApp();
  const scope = { factory: filters.factory };
  const [step, setStep] = useState(1);
  const [rules, setRules] = useState<WizardRules>(DEFAULT_RULES);
  const scan = useMemo(() => scanGaps(model, scope), [model, filters.factory]); // eslint-disable-line
  const rows: { label: string; n: number }[] = [
    { label: 'Factories with blank Planned Weeks', n: scan.factories.length }, { label: 'Assets with blank Shift Pattern', n: scan.shiftAssets.length },
    { label: 'Assets with blank Complexity Class', n: scan.complexityAssets.length }, { label: 'Assets with blank OEE (%)', n: scan.oeeAssets.length }];
  const total = rows.reduce((s, r) => s + r.n, 0);
  const planned = {
    weeks: rules.plannedWeeks.on ? scan.factories.length : 0, shift: rules.shift.on ? scan.shiftAssets.length : 0,
    complexity: rules.complexity.on ? scan.complexityAssets.length : 0, oee: rules.oee.on ? scan.oeeAssets.length : 0 };
  const plannedTotal = planned.weeks + planned.shift + planned.complexity + planned.oee;
  const set = <K extends keyof WizardRules>(k: K, v: Partial<WizardRules[K]>) => setRules((r) => ({ ...r, [k]: { ...r[k], ...v } }));

  const apply = () => {
    const errorsBefore = runChecks(model, asOf).counts.ERROR; const preview = structuredClone(model); applyWizard(preview, scope, rules);
    const errorsAfter = runChecks(preview, asOf).counts.ERROR;
    edit((d) => { applyWizard(d, scope, rules); }, { silent: true });
    toast(`Auto-Fill Wizard filled ${plannedTotal} field${plannedTotal === 1 ? '' : 's'} (${planned.weeks} planned weeks, ${planned.shift} shifts, ${planned.complexity} complexity classes, ${planned.oee} OEE) as Assumed Defaults · ${Math.max(0, errorsBefore - errorsAfter)} ERROR flag${errorsBefore - errorsAfter === 1 ? '' : 's'} cleared (${errorsAfter} remaining) · review the highlighted fields`, 'good');
    onClose();
  };

  return <>
    <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
    <div role="dialog" aria-label="Gap Auto-Fill Wizard" data-testid="autofill-wizard" className="fixed z-50 left-1/2 top-16 -translate-x-1/2 bg-white rounded-lg shadow-2xl border border-slate-300 w-[min(640px,calc(100%-24px))] max-h-[85vh] overflow-auto">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-slate-50 rounded-t-lg"><b className="text-[15px]">Gap Auto-Fill &amp; Review Wizard</b>
        <span className="text-xs text-slate-500">Step {step} of 3 · {filters.factory === 'All' ? 'all factories' : filters.factory}</span><button className="btn ml-auto" onClick={onClose}>Close</button></div>
      <div className="flex gap-1 px-4 pt-3">{['1. Scan Gaps', '2. Configure Standard Assumptions', '3. Apply & Highlight'].map((t, i) => <span key={t} className={`flex-1 text-center text-[11px] py-1 rounded ${step === i + 1 ? 'bg-sky-700 text-white font-semibold' : 'bg-slate-100 text-slate-500'}`}>{t}</span>)}</div>
      <div className="p-4 grid gap-3">
        {step === 1 && <>
          <p className="text-slate-700">Blank fields that currently block or weaken the calculations:</p>
          <ul className="grid gap-1" data-testid="wizard-scan">{rows.map((r) => <li key={r.label} className="flex items-center justify-between border border-slate-200 rounded px-3 py-1.5"><span>{r.label}</span><b className={r.n ? 'text-amber-700' : 'text-emerald-700'}>{r.n}</b></li>)}</ul>
          <p className="text-xs text-slate-500">{total === 0 ? 'No blank fields in scope: nothing to fill.' : `${total} blank field${total === 1 ? '' : 's'} found. The wizard only ever fills blanks and never overwrites typed values.`}</p></>}
        {step === 2 && <>
          <p className="text-slate-700">Tick the standard engineering assumptions to use. Each filled value is flagged <b>ASSUMED</b> so it can be verified or replaced.</p>
          <label className="flex items-center gap-2"><input type="checkbox" aria-label="Fill Planned Weeks" checked={rules.plannedWeeks.on} onChange={(e) => set('plannedWeeks', { on: e.target.checked })} /><span className="w-64">Planned Weeks (per blank factory)</span><div className="w-24"><NumInput gap={false} label="Default planned weeks" value={rules.plannedWeeks.weeks} onChange={(v) => set('plannedWeeks', { weeks: v ?? 0 })} /></div><span className="text-xs text-slate-500">weeks</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" aria-label="Fill Shift Pattern" checked={rules.shift.on} onChange={(e) => set('shift', { on: e.target.checked })} /><span className="w-64">Shift Pattern (per blank asset)</span><div className="w-44"><Sel label="Default shift pattern" gap={false} blank="" value={rules.shift.pattern} options={validShiftNames(model)} onChange={(v) => set('shift', { pattern: v })} /></div></label>
          <label className="flex items-center gap-2"><input type="checkbox" aria-label="Fill Complexity Class" checked={rules.complexity.on} onChange={(e) => set('complexity', { on: e.target.checked })} /><span className="w-64">Complexity Class (per blank asset)</span><div className="w-44"><Sel label="Default complexity class" gap={false} blank="" value={rules.complexity.className} options={Object.keys(model.settings.limits)} onChange={(v) => set('complexity', { className: v })} /></div></label>
          <label className="flex items-center gap-2"><input type="checkbox" aria-label="Fill Baseline OEE" checked={rules.oee.on} onChange={(e) => set('oee', { on: e.target.checked })} /><span className="w-64">Baseline OEE % (per blank asset, optional)</span><div className="w-24"><NumInput pct gap={false} label="Default baseline OEE" value={rules.oee.fraction} onChange={(v) => set('oee', { fraction: v ?? 0 })} /></div><span className="text-xs text-slate-500">%</span></label></>}
        {step === 3 && <>
          <p className="text-slate-700">Ready to apply to blank fields only:</p>
          <ul className="grid gap-1" data-testid="wizard-plan">
            <li>{planned.weeks} factory planned-weeks value{planned.weeks === 1 ? '' : 's'} → {rules.plannedWeeks.weeks} weeks</li><li>{planned.shift} shift pattern{planned.shift === 1 ? '' : 's'} → {rules.shift.pattern}</li>
            <li>{planned.complexity} complexity class{planned.complexity === 1 ? '' : 'es'} → {rules.complexity.className}</li><li>{planned.oee} OEE value{planned.oee === 1 ? '' : 's'} → {Math.round(rules.oee.fraction * 1000) / 10}%</li></ul>
          <p className="text-xs text-slate-500">Headroom and all 34 Data Checks recalculate immediately. Every filled field is highlighted as an Assumed Default until you verify or replace it.</p></>}
      </div>
      <div className="flex gap-2 px-4 py-3 border-t bg-slate-50 rounded-b-lg">
        {step > 1 && <button className="btn" onClick={() => setStep(step - 1)}>← Back</button>}
        <span className="ml-auto" />
        {step < 3 && <button className="btn-p" data-testid="wizard-next" onClick={() => setStep(step + 1)}>Next →</button>}
        {step === 3 && <button className="btn-p" data-testid="wizard-apply" disabled={plannedTotal === 0} onClick={apply}>Apply &amp; Highlight ({plannedTotal})</button>}
      </div>
    </div></>;
}
