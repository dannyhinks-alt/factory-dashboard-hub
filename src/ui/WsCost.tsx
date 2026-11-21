import { useState, useMemo } from 'react';
import { calcAsset, factoriesOf, machinesToAdd } from '../engine/calc';
import type { Asset } from '../engine/types';
import { useApp } from '../store';
import { Card, NumInput, Th } from './kit';

const UNC_PRESETS: Record<string, number> = { 'Low ±10%': 0.10, 'Medium ±25%': 0.25, 'High ±40%': 0.40 };
const DEFAULT_UNC = 0.25; // Medium ±25% is the default when no uncertainty is set
const fmt = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const EMPTY = '—';

const UNC_GUIDE: { label: string; desc: string }[] = [
  { label: 'Low ±10%', desc: 'Firm / Budgetary Quote: Written vendor quote, frozen spec, known civil/installation scope.' },
  { label: 'Medium ±25%', desc: 'Preliminary / Parametric Estimate: Comparable historical asset cost, outline layout, standard services.' },
  { label: 'High ±40%', desc: 'Early Concept / Order-of-Magnitude: Bespoke equipment, unverified civils/extraction, early concept stage.' },
  { label: 'Custom ±%', desc: 'Bespoke Tolerance: Manual ±% range from supplier/programme risk assessment.' },
];

export function WsCost() {
  const { model, edit, filters } = useApp();
  const globalFac = filters.factory;
  const [uncInfoOpen, setUncInfoOpen] = useState(false);

  const upd = (id: string, fn: (a: Asset) => void) => edit((d) => { const a = d.assets.find((x) => x.id === id); if (a) fn(a); });

  const costCalc = (a: Asset) => {
    const machines = a.machines ?? 0;
    const unit = a.costPerMachine ?? 0;
    const install = a.installCostPerMachine ?? 0;
    const unc = a.costUncPct ?? DEFAULT_UNC;
    const totalPerMachine = unit + install;
    const baseTotal = machines * totalPerMachine;
    const addQty = machinesToAdd(calcAsset(model, a, 'model')) ?? 0;
    const expansionCapEx = addQty * totalPerMachine;
    const low = baseTotal * (1 - unc);
    const high = baseTotal * (1 + unc);
    const hasData = a.costPerMachine !== null || a.installCostPerMachine !== null;
    return { baseTotal, expansionCapEx, low, high, addQty, hasData };
  };

  const relevantAssets = model.assets.filter((a) => globalFac === 'All' || a.factory === globalFac);
  const estateTotals = useMemo(() => relevantAssets.reduce((acc, a) => {
    const c = costCalc(a); if (!c.hasData) return acc;
    return { base: acc.base + c.baseTotal, low: acc.low + c.low, high: acc.high + c.high, expansion: acc.expansion + c.expansionCapEx };
  }, { base: 0, low: 0, high: 0, expansion: 0 }), [relevantAssets, model]); // eslint-disable-line

  const factories = factoriesOf(model).filter((f) => globalFac === 'All' || f === globalFac);

  if (!model.assets.length) {
    return <section className="card accent-watch p-4" data-testid="cost-onboarding"><b>No assets yet.</b><p className="mt-1 text-slate-700">Import a workbook or add assets in <b>2. Data &amp; Gap Filler</b>, then return here to enter cost and uncertainty data.</p></section>;
  }

  return (
    <div className="grid gap-4">
      <div className="card p-3 flex flex-wrap gap-6 items-center">
        <span className="text-[13px] font-semibold text-slate-700">Estate Summary</span>
        <div className="text-[13px]"><span className="text-slate-500 mr-1">Base CapEx</span><b className="font-mono">{fmt(estateTotals.base)}</b></div>
        <div className="text-[13px]"><span className="text-slate-500 mr-1">Range (Low – High)</span><b className="font-mono">{fmt(estateTotals.low)} – {fmt(estateTotals.high)}</b></div>
        <div className="text-[13px]"><span className="text-slate-500 mr-1">Risk Contingency (High − Base)</span><b className="font-mono">{fmt(estateTotals.high - estateTotals.base)}</b></div>
        <div className="text-[13px]"><span className="text-slate-500 mr-1">Expansion CapEx</span><b className="font-mono">{fmt(estateTotals.expansion)}</b></div>
      </div>

      {/* Uncertainty guide popover */}
      {uncInfoOpen && (
        <div className="card p-4 border border-blue-200 bg-blue-50 relative">
          <button className="absolute top-2 right-2 text-slate-500 hover:text-slate-800" aria-label="Close uncertainty guide" onClick={() => setUncInfoOpen(false)}>✕</button>
          <b className="text-[13px]">Uncertainty Band Guide</b>
          <ul className="mt-2 grid gap-2">
            {UNC_GUIDE.map(({ label, desc }) => (
              <li key={label} className="text-[13px]"><span className="font-semibold text-slate-700">{label}</span> — {desc}</li>
            ))}
          </ul>
        </div>
      )}

      {factories.map((factory) => {
        const facAssets = model.assets.filter((a) => a.factory === factory);
        const cells = [...new Set(facAssets.map((a) => a.cell))].sort();
        const facTotals = facAssets.reduce((acc, a) => { const c = costCalc(a); if (!c.hasData) return acc; return { base: acc.base + c.baseTotal, low: acc.low + c.low, high: acc.high + c.high }; }, { base: 0, low: 0, high: 0 });

        return (
          <Card key={factory} title={`Factory: ${factory}`} source={`Base ${fmt(facTotals.base)} · Range ${fmt(facTotals.low)} – ${fmt(facTotals.high)}`}>
            <div className="overflow-auto">
              <table className="dense w-full min-w-[1800px]">
                <thead>
                  <tr>
                    <Th>Cell</Th><Th>Asset</Th><Th>Source</Th>
                    <Th>Current Qty</Th><Th>Add'l Qty Needed</Th>
                    <Th>Unit Asset Cost (£)</Th><Th>Install / Civils / Tooling (£)</Th>
                    <Th>Base Total (£)</Th><Th>Expansion CapEx (£)</Th>
                    <Th><span className="flex items-center gap-1">Uncertainty<button aria-label="Uncertainty band guide" className="rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold w-4 h-4 flex items-center justify-center hover:bg-blue-200" onClick={() => setUncInfoOpen((v) => !v)}>?</button></span></Th>
                    <Th>Low Estimate (£)</Th><Th>Most Likely / Base (£)</Th><Th>High / Worst-Case (£)</Th>
                    <Th>Cost Basis / Assumption Note</Th>
                  </tr>
                </thead>
                <tbody>
                  {cells.flatMap((cell) => {
                    const cellAssets = facAssets.filter((a) => a.cell === cell);
                    const cellTotals = cellAssets.reduce((acc, a) => { const c = costCalc(a); if (!c.hasData) return acc; return { base: acc.base + c.baseTotal, low: acc.low + c.low, high: acc.high + c.high }; }, { base: 0, low: 0, high: 0 });
                    const hasAnyCost = cellAssets.some((a) => costCalc(a).hasData);

                    const rows: JSX.Element[] = [];
                    cellAssets.forEach((a) => {
                      const c = costCalc(a);
                      const eff = a.costUncPct ?? DEFAULT_UNC;
                      const uncLabel = Object.entries(UNC_PRESETS).find(([, v]) => Math.abs(v - eff) < 0.001)?.[0] ?? 'Custom';
                      rows.push(
                        <tr key={a.id}>
                          <td className="td text-xs whitespace-nowrap">{a.cell}</td>
                          <td className="td font-medium">{a.asset || '(unnamed)'}</td>
                          <td className="td text-xs">{a.passportShift ? 'Passport' : 'Model'}</td>
                          <td className="td font-mono text-center">{a.machines ?? EMPTY}</td>
                          <td className="td font-mono text-center">{c.addQty > 0 ? c.addQty : EMPTY}</td>
                          <td className="td w-28">
                            {!c.hasData && a.costPerMachine === null && <span className="chip text-[10px]" style={{ background: '#8a97a5' }}>Unpriced</span>}
                            <NumInput label={`Unit cost of ${a.asset}`} value={a.costPerMachine} placeholder="Enter £" onChange={(v) => upd(a.id, (x) => { x.costPerMachine = v; })} />
                          </td>
                          <td className="td w-28"><NumInput label={`Install cost of ${a.asset}`} value={a.installCostPerMachine} placeholder="Enter £" onChange={(v) => upd(a.id, (x) => { x.installCostPerMachine = v; })} /></td>
                          <td className="td font-mono whitespace-nowrap">{c.hasData ? fmt(c.baseTotal) : EMPTY}</td>
                          <td className="td font-mono whitespace-nowrap">{c.addQty > 0 && c.hasData ? fmt(c.expansionCapEx) : EMPTY}</td>
                          <td className="td w-36">
                            <select aria-label={`Uncertainty level of ${a.asset}`} className="inp" value={uncLabel} onChange={(e) => { const v = UNC_PRESETS[e.target.value]; upd(a.id, (x) => { x.costUncPct = v !== undefined ? v : (a.costUncPct ?? null); }); if (e.target.value === 'Custom' && a.costUncPct === null) upd(a.id, (x) => { x.costUncPct = DEFAULT_UNC; }); }}>
                              {Object.keys(UNC_PRESETS).map((k) => <option key={k}>{k}</option>)}
                              <option>Custom</option>
                            </select>
                            {uncLabel === 'Custom' && <NumInput pct label={`Custom uncertainty of ${a.asset}`} value={a.costUncPct} onChange={(v) => upd(a.id, (x) => { x.costUncPct = v; })} />}
                          </td>
                          <td className="td font-mono whitespace-nowrap">{c.hasData ? fmt(c.low) : EMPTY}</td>
                          <td className="td font-mono whitespace-nowrap">{c.hasData ? fmt(c.baseTotal) : EMPTY}</td>
                          <td className="td font-mono whitespace-nowrap">{c.hasData ? fmt(c.high) : EMPTY}</td>
                          <td className="td min-w-[200px]"><input aria-label={`Cost note of ${a.asset}`} className="inp" value={a.costNote} onChange={(e) => upd(a.id, (x) => { x.costNote = e.target.value; })} placeholder="Cost basis / assumption note…" /></td>
                        </tr>
                      );
                    });
                    if (hasAnyCost) rows.push(
                      <tr key={`${cell}:sub`} className="bg-slate-100 font-semibold text-[12px]">
                        <td className="td" colSpan={7}><span className="chip" style={{ background: '#2563eb' }}>CELL TOTAL</span> {cell}</td>
                        <td className="td font-mono whitespace-nowrap">{fmt(cellTotals.base)}</td>
                        <td className="td" />
                        <td className="td" />
                        <td className="td font-mono whitespace-nowrap">{fmt(cellTotals.low)}</td>
                        <td className="td font-mono whitespace-nowrap">{fmt(cellTotals.base)}</td>
                        <td className="td font-mono whitespace-nowrap">{fmt(cellTotals.high)}</td>
                        <td className="td" />
                      </tr>
                    );
                    return rows;
                  })}
                  <tr className="bg-slate-200 font-bold text-[12px]">
                    <td className="td" colSpan={7}><span className="chip" style={{ background: '#1e293b' }}>FACTORY TOTAL</span> {factory}</td>
                    <td className="td font-mono whitespace-nowrap">{fmt(facTotals.base)}</td>
                    <td className="td" />
                    <td className="td" />
                    <td className="td font-mono whitespace-nowrap">{fmt(facTotals.low)}</td>
                    <td className="td font-mono whitespace-nowrap">{fmt(facTotals.base)}</td>
                    <td className="td font-mono whitespace-nowrap">{fmt(facTotals.high)}</td>
                    <td className="td" />
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
