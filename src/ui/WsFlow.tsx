import { useEffect, useMemo, useState } from 'react';
import { UPLIFTS } from '../engine/constants';
import { n1 } from '../engine/calc';
import { axisUnit, biggestLevers, chainText, fpdCalc, monteCarlo, solve, wipAt } from '../engine/flow';
import type { StartRule } from '../engine/types';
import { useApp } from '../store';
import { Card, Empty, FocusRow, NumInput, Seg, Sel, Th } from './kit';
import { FlowMap, GanttWip, Histogram, VBars } from './charts';

export function WsFlow() {
  const { model, edit, filters, setFilters, focus, checks } = useApp();
  const up = UPLIFTS[filters.uplift] ?? 0;
  const flow = useMemo(() => solve(model, up), [model, up]);
  const levers = useMemo(() => biggestLevers(model, up).slice(0, 10), [model, up]);
  const mc = useMemo(() => monteCarlo(model, up, 400), [model, up]);
  const [cursor, setCursor] = useState(0); const [play, setPlay] = useState(false);
  const end = Math.max(flow.endDay, 1);
  useEffect(() => { if (!play) return; const t = setInterval(() => setCursor((c) => (c + end / 120 > end ? 0 : c + end / 120)), 80); return () => clearInterval(t); }, [play, end]);
  const ids = model.fpds.map((p) => p.id); const names = Object.fromEntries(model.fpds.map((p) => [p.id, p.name]));
  const cellNames = [...new Set(model.assets.map((a) => a.cell))];
  const nowWip = wipAt(flow, Math.min(cursor, end)).reduce((a, b) => a + b.wip, 0);
  const addFpd = () => edit((d) => { let n = 1; while (d.fpds.some((p) => p.id === `FPD-${String(n).padStart(2, '0')}`)) n++; if (n <= 20) d.fpds.push({ id: `FPD-${String(n).padStart(2, '0')}`, name: '', cell: '', hours: null, volume: null, whd: null }); });
  const ax = axisUnit(end);
  if (!model.fpds.length) return <Empty><p>No FPDs yet.</p><button className="btn-p mt-2" onClick={addFpd}>+ Add FPD-01</button></Empty>;
  return <div className="grid gap-4">
    <Card title="Flow summary" right={<><span className="text-xs">Uplift case</span><Seg label="Uplift case" value={filters.uplift} options={Object.keys(UPLIFTS)} onChange={(v) => setFilters({ uplift: v })} /></>}>
      <div className="flex flex-wrap gap-6 items-baseline">
        <div><div className="text-xs text-steel-500">Programme length</div><div className="text-2xl font-bold" data-testid="end-day">{n1(flow.endDay, 0)} days</div><div className="text-xs text-steel-500">≈ {n1(flow.endDay / ax.size, 1)} {ax.unit}</div></div>
        <div><div className="text-xs text-steel-500">Critical chain (multi-pass solver, {flow.passes} passes)</div><div className="text-lg font-bold text-bad" data-testid="critical-chain">{chainText(flow.chain)}</div></div>
        {flow.cycles.length > 0 && <div role="alert" className="text-bad font-semibold" data-testid="cycle-alert">⚠ Circular loop: {flow.cycles.map((c) => [...c, c[0]].join(' → ')).join('; ')}</div>}
      </div></Card>

    <Card title="FPD table" term="FPD" right={<button className="btn" onClick={addFpd} disabled={model.fpds.length >= 20}>+ Add FPD</button>}>
      <div className="overflow-auto"><table className="w-full min-w-[1100px]"><thead><tr><Th>FPD</Th><Th>Name</Th><Th>Cell</Th><Th>Hours</Th><Th>Volume</Th><Th>Working h/day</Th><Th term="Process Lead Time">Lead time (d/unit)</Th>
        {Object.keys(UPLIFTS).map((k) => <Th key={k} term="Uplift Case">{k}</Th>)}<Th>Duration (d)</Th><Th term="Little's Law">WIP</Th><th className="th" /></tr></thead>
        <tbody>{model.fpds.map((p, i) => { const c = fpdCalc(model, p, up); const s = flow.sched[p.id]; return <FocusRow key={p.id} match={focus?.kind === 'fpd' && focus.ref === p.id}>
          <td className="td font-semibold">{p.id}</td>
          <td className="td w-40"><input aria-label={`Name of ${p.id}`} className="inp" value={p.name} onChange={(e) => edit((d) => { d.fpds[i].name = e.target.value; })} /></td>
          <td className="td w-36"><Sel label={`Cell of ${p.id}`} value={p.cell} options={cellNames} onChange={(v) => edit((d) => { d.fpds[i].cell = v; })} /></td>
          <td className="td w-24"><NumInput label={`Hours of ${p.id}`} value={p.hours} onChange={(v) => edit((d) => { d.fpds[i].hours = v; })} /></td>
          <td className="td w-24"><NumInput label={`Volume of ${p.id}`} value={p.volume} onChange={(v) => edit((d) => { d.fpds[i].volume = v; })} /></td>
          <td className="td w-24"><NumInput label={`Working hours per day of ${p.id}`} gap={model.settings.defaultWhd === null} value={p.whd} onChange={(v) => edit((d) => { d.fpds[i].whd = v; })} /></td>
          <td className="td font-mono">{c.ok ? n1(c.ltUnit, 2) : '–'}</td>
          {Object.values(UPLIFTS).map((u, k) => { const cc = fpdCalc(model, p, u); return <td key={k} className="td font-mono text-steel-700">{cc.ok ? n1(cc.ltUnit, 2) : '–'}</td>; })}
          <td className="td font-mono">{c.ok ? n1(c.duration, 0) : '–'}{s && c.ok ? <span className="text-steel-500 text-[11px]"> (d{n1(s.start, 0)}–{n1(s.end, 0)})</span> : null}</td><td className="td font-mono">{c.ok ? n1(c.wip, 2) : '–'}</td>
          <td className="td"><button className="text-bad" aria-label={`Delete ${p.id}`} onClick={() => edit((d) => { d.fpds = d.fpds.filter((x) => x.id !== p.id); d.links = d.links.filter((l) => l.parent !== p.id && l.child !== p.id); })}>🗑</button></td></FocusRow>; })}</tbody></table></div>
      <p className="text-xs text-steel-500 mt-2">Lead time = hours ÷ volume ÷ working hours per day. WIP = rate × lead time, with rate = volume ÷ (planned weeks × 5 days).</p></Card>

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
      {checks.perRule.DC09 > 0 && <p className="text-bad mt-2 font-semibold">Circular loop detected: the loop links are ignored by the solver until you remove one.</p>}</Card>

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
