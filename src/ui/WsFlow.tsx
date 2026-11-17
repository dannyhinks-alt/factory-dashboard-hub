import { useEffect, useMemo, useState } from 'react';
import { fpdFactories } from '../engine/overview';
import { UPLIFTS } from '../engine/constants';
import { n1 } from '../engine/calc';
import { axisUnit, biggestLevers, chainText, fpdCalc, monteCarlo, solve, wipAt } from '../engine/flow';
import type { Fpd, StartRule } from '../engine/types';
import { useApp } from '../store';
import { Card, Empty, FocusRow, NumInput, Seg, Sel, Th } from './kit';
import { FlowMap, GanttWip, Histogram, VBars } from './charts';

export function WsFlow() {
  const { model, edit, filters, setFilters, focus, checks } = useApp();
  const up = UPLIFTS[filters.uplift] ?? 0;
  // A product family stays visible when any factory it passes through is selected.
  const sm = useMemo(() => { const fpds = model.fpds.filter((p) => filters.factory === 'All' || fpdFactories(model, p.route).includes(filters.factory)); const ids = new Set(fpds.map((p) => p.id)); return { ...model, fpds, links: model.links.filter((l) => ids.has(l.parent) && ids.has(l.child)) }; }, [model, filters.factory]);
  const flow = useMemo(() => solve(sm, up), [sm, up]);
  const levers = useMemo(() => biggestLevers(sm, up).slice(0, 10), [sm, up]);
  const mc = useMemo(() => monteCarlo(sm, up, 400), [sm, up]);
  const [cursor, setCursor] = useState(0); const [play, setPlay] = useState(false);
  const end = Math.max(flow.endDay, 1);
  useEffect(() => { if (!play) return; const t = setInterval(() => setCursor((c) => (c + end / 120 > end ? 0 : c + end / 120)), 80); return () => clearInterval(t); }, [play, end]);
  const ids = model.fpds.map((p) => p.id); const names = Object.fromEntries(model.fpds.map((p) => [p.id, p.name]));
  const nowWip = wipAt(flow, Math.min(cursor, end)).reduce((a, b) => a + b.wip, 0);
  const addFpd = () => edit((d) => { let n = 1; while (d.fpds.some((p) => p.id === `FPD-${String(n).padStart(2, '0')}`)) n++; d.fpds.push({ id: `FPD-${String(n).padStart(2, '0')}`, name: '', cell: '', route: [], hours: null, volume: null, whd: null, version: '', date: '' }); });
  const upd = (id: string, fn: (p: Fpd) => void) => edit((d) => { const p = d.fpds.find((x) => x.id === id); if (p) fn(p); });
  const ax = axisUnit(end);
  if (!model.fpds.length) return <Empty><p>No product families (FPD) yet.</p><button className="btn-p mt-2" data-testid="add-fpd" onClick={addFpd}>+ Add Product Family (FPD)</button></Empty>;
  return <div className="grid gap-4">
    <Card title="Flow summary" right={<><span className="text-xs">Uplift case</span><Seg label="Uplift case" value={filters.uplift} options={Object.keys(UPLIFTS)} onChange={(v) => setFilters({ uplift: v })} /></>}>
      <div className="flex flex-wrap gap-6 items-baseline">
        <div><div className="text-xs text-steel-500">Programme length</div><div className="text-2xl font-bold" data-testid="end-day">{n1(flow.endDay, 0)} days</div><div className="text-xs text-steel-500">≈ {n1(flow.endDay / ax.size, 1)} {ax.unit}</div></div>
        <div><div className="text-xs text-steel-500">Critical chain (multi-pass solver, {flow.passes} passes)</div><div className="text-lg font-bold text-bad" data-testid="critical-chain">{chainText(flow.chain)}</div></div>
        {flow.cycles.length > 0 && <div role="alert" className="text-bad font-semibold" data-testid="cycle-alert">⚠ Circular loop: {flow.cycles.map((c) => [...c, c[0]].join(' → ')).join('; ')}</div>}
      </div></Card>

    <Card title="Product families (FPD)" term="FPD" right={<button className="btn-p" data-testid="add-fpd" onClick={addFpd}>+ Add Product Family (FPD)</button>}>
      {filters.factory !== 'All' && <p className="text-xs text-slate-500 mb-2">Showing every product family that passes through {filters.factory}, including those that also visit other factories.</p>}
      <div className="overflow-auto"><table className="w-full min-w-[1500px]"><thead><tr><Th>FPD ID</Th><Th>Name</Th><Th>Multi-cell &amp; factory route</Th><Th>Hours</Th><Th>Volume</Th><Th>Working h/day</Th><Th>Version</Th><Th>Date</Th><Th term="Process Lead Time">Lead time (d/unit)</Th>
        {Object.keys(UPLIFTS).map((k) => <Th key={k} term="Uplift Case">{k}</Th>)}<Th>Duration (d)</Th><Th term="Little's Law">WIP</Th><th className="th" /></tr></thead>
        <tbody>{sm.fpds.map((p) => { const c = fpdCalc(model, p, up); const s2 = flow.sched[p.id]; return <FocusRow key={p.id} match={focus?.kind === 'fpd' && focus.ref === p.id}>
          <td className="td w-28"><IdInput value={p.id} onCommit={(v) => edit((d) => { const q = d.fpds.find((x) => x.id === p.id); if (!q || !v || d.fpds.some((x) => x.id === v)) return; d.links.forEach((l) => { if (l.parent === p.id) l.parent = v; if (l.child === p.id) l.child = v; }); q.id = v; })} /></td>
          <td className="td min-w-[160px]"><input aria-label={`Name of ${p.id}`} className={`inp ${p.name ? '' : 'inp-gap'}`} value={p.name} onChange={(e) => upd(p.id, (q) => { q.name = e.target.value; })} /></td>
          <td className="td min-w-[260px]"><RouteSelect fpd={p} onChange={(route) => upd(p.id, (q) => { q.route = route; q.cell = route[0] ?? ''; })} /></td>
          <td className="td w-24"><NumInput label={`Hours of ${p.id}`} value={p.hours} onChange={(v) => upd(p.id, (q) => { q.hours = v; })} /></td>
          <td className="td w-24"><NumInput label={`Volume of ${p.id}`} value={p.volume} onChange={(v) => upd(p.id, (q) => { q.volume = v; })} /></td>
          <td className="td w-24"><NumInput label={`Working hours per day of ${p.id}`} gap={model.settings.defaultWhd === null} value={p.whd} onChange={(v) => upd(p.id, (q) => { q.whd = v; })} /></td>
          <td className="td w-20"><input aria-label={`Version of ${p.id}`} className={`inp ${p.version ? '' : 'inp-gap'}`} value={p.version} onChange={(e) => upd(p.id, (q) => { q.version = e.target.value; })} /></td>
          <td className="td w-36"><input aria-label={`Date of ${p.id}`} type="date" className={`inp ${p.date ? '' : 'inp-gap'}`} value={p.date} onChange={(e) => upd(p.id, (q) => { q.date = e.target.value; })} /></td>
          <td className="td font-mono">{c.ok ? n1(c.ltUnit, 2) : '–'}</td>
          {Object.values(UPLIFTS).map((u, k) => { const cc = fpdCalc(model, p, u); return <td key={k} className="td font-mono text-slate-700">{cc.ok ? n1(cc.ltUnit, 2) : '–'}</td>; })}
          <td className="td font-mono">{c.ok ? n1(c.duration, 0) : '–'}{s2 && c.ok ? <span className="text-slate-500 text-[11px]"> (d{n1(s2.start, 0)}–{n1(s2.end, 0)})</span> : null}</td><td className="td font-mono">{c.ok ? n1(c.wip, 2) : '–'}</td>
          <td className="td"><button className="text-rose-600" aria-label={`Delete ${p.id}`} onClick={() => edit((d) => { d.fpds = d.fpds.filter((x) => x.id !== p.id); d.links = d.links.filter((l) => l.parent !== p.id && l.child !== p.id); })}>🗑</button></td></FocusRow>; })}</tbody></table></div>
      {!sm.fpds.length && <p className="text-slate-500 py-2">No product families pass through this factory.</p>}
      <p className="text-xs text-slate-500 mt-2">Lead time = hours ÷ volume ÷ working hours per day. WIP = rate × lead time, with rate = volume ÷ (planned weeks × 5 days).</p></Card>

    <Card title="Dependency Links" right={<button className="btn" onClick={() => edit((d) => d.links.push({ id: `L${Date.now().toString(36)}`, parent: '', child: '', rule: 'Complete', param: null, transferDays: 0, adjustTakts: 0 }))}>+ Add link</button>}>
      <table className="w-full"><thead><tr><Th>Parent FPD</Th><Th>Child FPD</Th><Th term="Start Rule">Start rule</Th><Th>N units / Overlap %</Th><Th term="Transfer Days">Transfer days</Th><Th term="Adjust in Takts">Adjust in takts</Th><Th>Start driver?</Th><th className="th" /></tr></thead>
        <tbody>{model.links.map((l, i) => <FocusRow key={l.id} match={focus?.kind === 'link' && focus.ref === l.id}>
          <td className="td w-32"><Sel label="Parent FPD" value={l.parent} options={ids} onChange={(v) => edit((d) => { d.links[i].parent = v; })} /></td>
          <td className="td w-32"><Sel label="Child FPD" value={l.child} options={ids} onChange={(v) => edit((d) => { d.links[i].child = v; })} /></td>
          <td className="td w-40"><Sel label="Start rule" gap={false} blank="" value={l.rule} options={['Complete', 'After N units', 'Overlap %']} onChange={(v) => edit((d) => { d.links[i].rule = v as StartRule; })} /></td>
          <td className="td w-28">{l.rule === 'Complete' ? <span className="text-steel-500">n/a</span> : <NumInput label="N or overlap" value={l.param} onChange={(v) => edit((d) => { d.links[i].param = v; })} />}</td>
          <td className="td w-24"><NumInput gap={false} label="Transfer days" value={l.transferDays} onChange={(v) => edit((d) => { d.links[i].transferDays = v ?? 0; })} /></td>
          <td className="td w-24"><NumInput gap={false} label="Adjust in takts" value={l.adjustTakts} onChange={(v) => edit((d) => { d.links[i].adjustTakts = v ?? 0; })} /></td>
          <td className="td text-xs">{flow.sched[l.child]?.driver === l.parent ? <b className="text-bad">drives start</b> : ''}</td>
          <td className="td"><button className="text-bad" aria-label="Delete link" onClick={() => edit((d) => { d.links.splice(i, 1); })}>🗑</button></td></FocusRow>)}</tbody></table>
      {checks.perRule.DC26 > 0 && <p className="text-bad mt-2 font-semibold">Circular loop detected: the loop links are ignored by the solver until you remove one.</p>}</Card>

    <Card title="Gantt + Stacked WIP" right={<><button className="btn" onClick={() => setPlay(!play)} aria-pressed={play}>{play ? '⏸ Pause' : '▶ Play'}</button><button className="btn" onClick={() => { setCursor(0); setPlay(false); }}>Reset</button></>}>
      <GanttWip flow={flow} cursor={Math.min(cursor, end)} onCursor={setCursor} names={names} />
      <div className="flex items-center gap-3 mt-1"><label className="text-xs">Time cursor</label><input aria-label="Time cursor" type="range" min={0} max={Math.round(end)} value={Math.round(Math.min(cursor, end))} onChange={(e) => setCursor(Number(e.target.value))} className="flex-1" /><span className="text-xs font-mono" data-testid="cursor-wip">day {Math.round(cursor)} · WIP {nowWip.toFixed(2)}</span></div>
      <p className="text-xs text-steel-500">Axis auto-scales ({ax.unit}). Red bars are the critical chain. Drag on the chart or use the slider.</p></Card>

    <div className="grid lg:grid-cols-2 gap-4">
      <Card title="Flow Map"><FlowMap flow={flow} links={model.links} names={names} /></Card>
      <Card title="Biggest Levers" right={<span className="text-xs">Days added to the end date by +10% on one FPD</span>}><VBars label="Biggest levers" data={levers.map((l) => ({ label: `${l.id} ${l.name.slice(0, 12)}`, value: l.deltaDays }))} unit=" d" color="#c2410c" /></Card>
    </div>
    <Card title="Monte Carlo: end-date uncertainty" right={<span className="text-xs">{mc.runs} runs · triangular −5% / typical / +{Math.round(Math.max(up, 0.1) * 100)}% on every FPD</span>}>
      <Histogram values={mc.ends} p10={mc.p10} p50={mc.p50} p90={mc.p90} label="Monte Carlo end-date histogram" />
      <p className="text-sm" data-testid="mc-summary">80% of runs finish between day {Math.round(mc.p10)} and day {Math.round(mc.p90)} (median {Math.round(mc.p50)}).</p></Card>
  </div>;
}

function IdInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [t, setT] = useState(value); useEffect(() => setT(value), [value]);
  const commit = () => { const v = t.trim(); if (v && v !== value) onCommit(v); else setT(value); };
  return <input aria-label={`FPD ID ${value}`} className="inp font-semibold" value={t} onChange={(e) => setT(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />;
}

/** Multi-cell route picker, cells grouped by factory, with an automatic cross-factory badge. */
function RouteSelect({ fpd, onChange }: { fpd: Fpd; onChange: (route: string[]) => void }) {
  const { model } = useApp();
  const groups = new Map<string, string[]>();
  [...model.cellLines.map((c) => [c.factory, c.cell]), ...model.assets.map((a) => [a.factory, a.cell])].forEach(([f, c]) => { if (!c) return; const g = groups.get(f || '(no factory)') ?? []; if (!g.includes(c)) g.push(c); groups.set(f || '(no factory)', g); });
  fpd.route.forEach((c) => { if (![...groups.values()].some((g) => g.includes(c))) groups.set('(not on Data)', [...(groups.get('(not on Data)') ?? []), c]); });
  const facs = fpdFactories(model, fpd.route);
  const toggle = (c: string) => onChange(fpd.route.includes(c) ? fpd.route.filter((x) => x !== c) : [...fpd.route, c]);
  return <details className="relative"><summary className={`inp cursor-pointer flex items-center gap-1 flex-wrap ${fpd.route.length ? '' : 'inp-gap'}`} aria-label={`Route of ${fpd.id}`}>
    {fpd.route.length ? <><span className="truncate max-w-[180px]">{fpd.route.join(' › ')}</span>{facs.length > 1 ? <span className="chip bg-violet-600" data-testid="cross-factory-badge">Cross-Factory: {facs.join(' + ')}</span> : facs[0] ? <span className="chip bg-slate-500">{facs[0]}</span> : null}</> : <span className="text-slate-500">Choose cells…</span>}</summary>
    <div className="absolute z-30 mt-1 w-72 max-h-64 overflow-auto bg-white border border-slate-300 rounded shadow-lg p-2" role="group" aria-label={`Route cells for ${fpd.id}`}>
      {[...groups.entries()].map(([f, cs]) => <div key={f} className="mb-2"><div className="text-[11px] font-bold text-slate-500 uppercase">{f}</div>
        {cs.map((c) => <label key={c} className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={fpd.route.includes(c)} onChange={() => toggle(c)} aria-label={`${fpd.id} passes through ${c}`} />{c}</label>)}</div>)}
      {!groups.size && <p className="text-slate-500">Add cells on the Data screen first.</p>}</div></details>;
}
