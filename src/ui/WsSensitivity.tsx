import { useState } from 'react';
import { QUICK_PRESETS, SHIFTS } from '../engine/constants';
import { cells, pct } from '../engine/calc';
import type { LeverSet } from '../engine/types';
import { BandChip } from './kit';
import { band, n1 } from '../engine/calc';
import { assetScenario, factoryScenarioDelta, pressureList, releaseCandidates, scenarioResult, testSets } from '../engine/sensitivity';
import type { AssetScenarioResult, FactoryScenarioParams } from '../engine/sensitivity';
import { useApp } from '../store';
import { BasisPill, Card, Empty, Field, FocusRow, NumInput, Seg, Sel, Th } from './kit';
import { cellIsPassport } from '../engine/overview';
import { factoriesOf } from '../engine/calc';

const BLANK_FACTORY_SCEN: FactoryScenarioParams = { factory: '', loadPct: 0, oeePts: 0, machinesAdd: 0, shift: '', plannedWeeksAdd: 0 };

/** Asset-in-Cell Scenario Planner: cascading Factory → Cell → Asset selector with live Before/After and log/apply. */
function AssetPlanner() {
  const { model, edit, toast } = useApp();
  const facs = factoriesOf(model);
  const [selFac, setFac] = useState(facs[0] ?? '');
  const [selCell, setCell] = useState('');
  const [selAsset, setAsset] = useState('');
  const [lever, setLever] = useState({ loadPct: 0, oeePts: 0, machinesAdd: 0, shift: '' });
  const cells_ = [...new Set(model.assets.filter((a) => !selFac || a.factory === selFac).map((a) => a.cell))];
  const assets_ = model.assets.filter((a) => (!selFac || a.factory === selFac) && (!selCell || a.cell === selCell)).map((a) => a.asset);
  const result: AssetScenarioResult | null = selFac && selCell && selAsset ? assetScenario(model, selFac, selCell, selAsset, lever) : null;
  const delta = (a: number | null, b: number | null) => a !== null && b !== null ? (b - a) : null;
  const fmtDelta = (d: number | null) => d === null ? '–' : (d >= 0 ? '+' : '') + pct(d);
  const reset = () => setLever({ loadPct: 0, oeePts: 0, machinesAdd: 0, shift: '' });
  const log = () => {
    if (!selFac || !selCell || !selAsset) return;
    edit((d) => { d.scenarios.push({ id: `S${Date.now().toString(36)}`, name: `${selAsset} test`, factory: selFac, cell: selCell, asset: selAsset, ...lever, note: `Planner: ${new Date().toLocaleDateString('en-GB')}`, reroute: 0 }); });
    toast(`Scenario logged for ${selAsset}`, 'good');
  };
  const apply = () => {
    if (!selFac || !selCell || !selAsset) return;
    if (!window.confirm(`Apply scenario levers to master model for ${selAsset}? This permanently changes the asset's machines, OEE and shift in the workspace.`)) return;
    edit((d) => {
      const a = d.assets.find((x) => x.factory === selFac && x.cell === selCell && x.asset === selAsset);
      if (!a) return;
      if (lever.machinesAdd) { a.machines = (a.machines ?? 0) + lever.machinesAdd; }
      if (lever.oeePts) { a.oee = Math.min(1, (a.oee ?? 0) + lever.oeePts); a.modelOee = Math.min(1, (a.modelOee ?? 0) + lever.oeePts); }
      if (lever.shift) { a.shift = lever.shift; a.modelShift = lever.shift; }
    });
    toast(`Applied scenario to ${selAsset} in master model`, 'good');
    reset();
  };

  return <Card title="Asset-in-Cell Scenario Planner" source="Factory Model (live test, not saved until logged)" right={<span className="text-xs text-slate-500">Test levers on one asset · Log to scenario table · Apply to master model</span>}>
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3 items-end">
        <Field label="Factory"><Sel label="Planner factory" gap={false} blank="Select factory" value={selFac} options={facs} onChange={(v) => { setFac(v); setCell(''); setAsset(''); }} /></Field>
        <Field label="Cell"><Sel label="Planner cell" gap={false} blank="Select cell" value={selCell} options={cells_} onChange={(v) => { setCell(v); setAsset(''); }} /></Field>
        <Field label="Asset"><Sel label="Planner asset" gap={false} blank="Select asset" value={selAsset} options={[...new Set(assets_)]} onChange={(v) => setAsset(v)} /></Field>
      </div>
      <div className="flex flex-wrap gap-3 items-end">
        <Field label="Yearly Demand change %"><NumInput pct gap={false} label="Demand change" value={lever.loadPct} onChange={(v) => setLever((l) => ({ ...l, loadPct: v ?? 0 }))} /></Field>
        <Field label="OEE uplift (pts)"><NumInput pct gap={false} label="OEE uplift" value={lever.oeePts} onChange={(v) => setLever((l) => ({ ...l, oeePts: v ?? 0 }))} /></Field>
        <Field label="Machines to add"><NumInput gap={false} label="Machines to add" value={lever.machinesAdd} onChange={(v) => setLever((l) => ({ ...l, machinesAdd: v ?? 0 }))} /></Field>
        <Field label="Shift override"><Sel label="Shift override" gap={false} blank="Unchanged" value={lever.shift} options={SHIFTS} onChange={(v) => setLever((l) => ({ ...l, shift: v }))} /></Field>
      </div>
      {result && <div className="grid grid-cols-2 gap-3">
        <div className="border border-slate-200 rounded p-3 text-[13px]">
          <div className="font-semibold text-slate-600 mb-1">Asset headroom</div>
          <div className="flex gap-2 items-center">
            <span className="text-slate-500">Before:</span><b className="font-mono">{pct(result.assetBefore)}</b>
            <span className="text-slate-400">→</span>
            <span className="text-slate-500">After:</span>
            <b className="font-mono" style={{ color: (result.assetAfter ?? 0) >= (result.assetBefore ?? 0) ? '#059669' : '#E11D48' }}>{pct(result.assetAfter)}</b>
            <span className="text-xs text-slate-500">({fmtDelta(delta(result.assetBefore, result.assetAfter))})</span></div></div>
        <div className="border border-slate-200 rounded p-3 text-[13px]">
          <div className="font-semibold text-slate-600 mb-1">Cell headroom</div>
          <div className="flex gap-2 items-center">
            <span className="text-slate-500">Before:</span><b className="font-mono">{pct(result.cellBefore)}</b>
            <span className="text-slate-400">→</span>
            <span className="text-slate-500">After:</span>
            <b className="font-mono" style={{ color: (result.cellAfter ?? 0) >= (result.cellBefore ?? 0) ? '#059669' : '#E11D48' }}>{pct(result.cellAfter)}</b>
            <span className="text-xs text-slate-500">({fmtDelta(delta(result.cellBefore, result.cellAfter))})</span>
            <BandChip band={result.bandBefore} /><span className="text-slate-400">→</span><BandChip band={result.bandAfter} /></div></div>
      </div>}
      <div className="flex gap-2">
        <button className="btn" onClick={reset}>Reset Test</button>
        <button className="btn-p" disabled={!selAsset} onClick={log}>Log Scenario</button>
        <button className="btn" disabled={!result} onClick={apply} title="Apply these levers directly to the master model (irreversible without Clear/Blank)">Apply to Master Model</button>
      </div>
    </div></Card>;
}

export function WsSensitivity() {
  const { model, edit, focus, filters, toast } = useApp();
  const [factScen, setFactScen] = useState<FactoryScenarioParams>(BLANK_FACTORY_SCEN);
  const inScope = (f: string) => filters.factory === 'All' || f === filters.factory;
  const pl = pressureList(model).filter((p) => inScope(p.c.asset.factory)); const sets = testSets(model); const rel = releaseCandidates(model).filter((c) => inScope(c.asset.factory));
  const facs = factoriesOf(model);
  /** One scenario line per bottleneck asset of every cell in the set's scope, replacing earlier lines logged from the same set. */
  const logSet = (set: LeverSet) => {
    const targets = cells(model, 'model').filter((c) => c.bottleneck && (!set.factory || c.factory === set.factory));
    if (!targets.length) { toast('Nothing to log: no cell has enough data to find a bottleneck yet', 'warn'); return; }
    const note = `Logged from ${set.id}`;
    edit((d) => {
      d.scenarios = d.scenarios.filter((x) => !(x.note === note && x.name === (set.name || set.id)));
      targets.forEach((c, k) => d.scenarios.push({ id: `S${Date.now().toString(36)}${k}`, name: set.name || set.id, factory: c.factory, cell: c.cell, asset: c.bottleneck!.asset.asset, loadPct: set.loadPct, oeePts: set.oeePts, machinesAdd: set.machinesAdd, shift: set.shift, note, reroute: 0 }));
    });
    toast(`Logged ${targets.length} scenario line${targets.length === 1 ? '' : 's'} from ${set.id} to the Scenario table`, 'good');
  };
  const assetKey = (f: string, c: string, a: string) => `${f}|${c}|${a}`;
  const assetOpts = model.assets.map((a) => assetKey(a.factory, a.cell, a.asset));
  if (!model.assets.length) return <Empty><b>No assets yet.</b><br />The pressure list, 3-set lever tester and scenario log fill in once assets with load, machines and shifts are loaded. Import a workbook or add assets in <b>2. Data &amp; Gap Filler</b>.</Empty>;
  const factDelta = factoryScenarioDelta(model, factScen);
  const setFS = <K extends keyof FactoryScenarioParams>(k: K, v: FactoryScenarioParams[K]) => setFactScen((s) => ({ ...s, [k]: v }));
  const fmtDelta = (a: number, b: number) => { const d = b - a; return <span style={{ color: d > 0 ? '#059669' : d < 0 ? '#E11D48' : '#64748B' }}>{a} → <b>{b}</b> ({d >= 0 ? '+' : ''}{d})</span>; };

  return <div className="grid gap-4">
    <Card title="Overall Factory Scenario Controls" source="Factory Model (macro levers — not saved to master data)" right={<span className="text-xs text-slate-500">Estate-wide or per-factory · live Baseline vs Scenario delta</span>}>
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-3 items-end">
          <Field label="Scope"><Seg label="Scenario scope" value={factScen.factory === '' ? 'All' : 'One factory'} options={['All', 'One factory'] as const} onChange={(v) => setFS('factory', v === 'All' ? '' : facs[0] ?? '')} /></Field>
          {factScen.factory !== '' && <Field label="Factory"><Sel label="Scenario factory" gap={false} blank="" value={factScen.factory} options={facs} onChange={(v) => setFS('factory', v)} /></Field>}
          <Field label="Yearly Demand %"><NumInput pct gap={false} label="Demand change %" value={factScen.loadPct} onChange={(v) => setFS('loadPct', v ?? 0)} /></Field>
          <Field label="OEE uplift (pts)"><NumInput pct gap={false} label="OEE uplift pts" value={factScen.oeePts} onChange={(v) => setFS('oeePts', v ?? 0)} /></Field>
          <Field label="+Planned weeks"><NumInput gap={false} label="Extra planned weeks" value={factScen.plannedWeeksAdd} onChange={(v) => setFS('plannedWeeksAdd', v ?? 0)} /></Field>
          <Field label="Site Shift Policy"><Sel label="Site shift override" gap={false} blank="Unchanged" value={factScen.shift} options={SHIFTS} onChange={(v) => setFS('shift', v)} /></Field>
          <button className="btn self-end" onClick={() => setFactScen(BLANK_FACTORY_SCEN)}>Reset</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px]">
          <div className="border border-slate-200 rounded p-2"><div className="text-slate-500 mb-1">GREEN cells</div>{fmtDelta(factDelta.baseGreen, factDelta.scenGreen)}</div>
          <div className="border border-slate-200 rounded p-2"><div className="text-slate-500 mb-1">AMBER cells</div>{fmtDelta(factDelta.baseAmber, factDelta.scenAmber)}</div>
          <div className="border border-slate-200 rounded p-2"><div className="text-slate-500 mb-1">RED cells</div>{fmtDelta(factDelta.baseRed, factDelta.scenRed)}</div>
          <div className="border border-slate-200 rounded p-2"><div className="text-slate-500 mb-1">Overloaded cells</div>{fmtDelta(factDelta.overloadedBefore, factDelta.overloadedAfter)}</div>
        </div>
        <div className="text-[12px] text-slate-500">Worst cell headroom: Baseline <b className="font-mono">{factDelta.baseWorst !== null ? pct(factDelta.baseWorst) : '–'}</b> → Scenario <b className="font-mono">{factDelta.scenWorst !== null ? pct(factDelta.scenWorst) : '–'}</b></div>
      </div></Card>

    <AssetPlanner />
    <Card title="Pressure List" term="Break-Even" source="Factory Model (Data sheet)" right={<span className="text-xs">Worst headroom first; each column is a single-lever break-even</span>}>
      <div className="overflow-auto max-h-[50vh]"><table className="w-full"><thead><tr><Th>#</Th><Th>Factory</Th><Th>Cell</Th><Th>Source</Th><Th>Asset</Th><Th term="Headroom">Headroom</Th><Th>Band</Th><Th term="Break-Even">Load change</Th><Th>OEE needed</Th><Th term="Machines to add">Machines to add</Th><Th>Shift pattern needed</Th></tr></thead>
        <tbody>{pl.map((p, i) => <FocusRow key={p.c.asset.id} match={focus?.kind === 'asset' && focus.ref === p.c.asset.id}><td className="td">{i + 1}</td><td className="td">{p.c.asset.factory}</td><td className="td">{p.c.asset.cell}</td><td className="td"><BasisPill passport={cellIsPassport(model, p.c.asset.factory, p.c.asset.cell)} /></td><td className="td font-medium">{p.c.asset.asset}</td><td className="td font-mono">{pct(p.headroom)}</td><td className="td"><BandChip band={band(p.headroom)} /></td>
          <td className="td font-mono">{p.loadChange >= 0 ? '+' : ''}{(p.loadChange * 100).toFixed(1)}%</td><td className="td font-mono">{pct(p.oeeNeeded)}{p.oeeNeeded! > 1 ? <span className="text-bad"> (&gt;100%)</span> : null}</td><td className="td font-mono">{p.machines}</td><td className="td">{p.shiftNeeded}</td></FocusRow>)}</tbody></table></div></Card>

    <Card title="3-Set Lever tester" term="Lever Set" source="Factory Model (Data sheet)" right={<span className="text-xs">Baseline worst cell headroom: <b>{pct(sets.baseWorst)}</b></span>}>
      <div className="grid md:grid-cols-3 gap-3">{model.levers.map((s, i) => { const r = sets.results[i]; return <div key={s.id} className={`border border-steel-200 rounded p-2 ${focus?.kind === 'lever' && focus.ref === s.id ? 'focus-flash' : ''}`} data-testid={`lever-${s.id}`}>
        <div className="font-bold mb-1">{s.id}</div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name"><input aria-label={`${s.id} name`} className="inp" value={s.name} onChange={(e) => edit((d) => { d.levers[i].name = e.target.value; })} /></Field>
          <Field label="Scope factory"><Sel label={`${s.id} factory`} gap={false} blank="All" value={s.factory} options={facs} onChange={(v) => edit((d) => { d.levers[i].factory = v; })} /></Field>
          <Field label="Load change %"><NumInput pct gap={false} label={`${s.id} load change`} value={s.loadPct} onChange={(v) => edit((d) => { d.levers[i].loadPct = v ?? 0; })} /></Field>
          <Field label="OEE change (pts)"><NumInput pct gap={false} label={`${s.id} OEE change`} value={s.oeePts} onChange={(v) => edit((d) => { d.levers[i].oeePts = v ?? 0; })} /></Field>
          <Field label="Machines added"><NumInput gap={false} label={`${s.id} machines added`} value={s.machinesAdd} onChange={(v) => edit((d) => { d.levers[i].machinesAdd = v ?? 0; })} /></Field>
          <Field label="Shift pattern"><Sel label={`${s.id} shift`} gap={false} blank="Unchanged" value={s.shift} options={SHIFTS} onChange={(v) => edit((d) => { d.levers[i].shift = v; })} /></Field></div>
        <div className="mt-2 text-sm border-t pt-2"><span className="chip bg-good">{r.green} GREEN</span> <span className="chip bg-watch">{r.amber} AMBER</span> <span className="chip bg-bad">{r.red} RED</span>
          <div className="mt-1">Worst cell: <b className="font-mono">{pct(r.worst)}</b> {r.improvement !== null && <span className={r.improvement >= 0 ? 'text-good' : 'text-bad'}>({r.improvement >= 0 ? '+' : ''}{(r.improvement * 100).toFixed(1)} pts)</span>}</div></div>
        <div className="mt-2 border-t pt-2 grid gap-2">
          <Sel label={`${s.id} quick preset`} gap={false} blank="Quick preset…" value="" options={Object.keys(QUICK_PRESETS)} onChange={(v) => v && edit((d) => { Object.assign(d.levers[i], QUICK_PRESETS[v]); })} />
          <button className="btn-p" data-testid={`log-${s.id}`} onClick={() => logSet(s)}>Log to Scenario Table</button></div></div>; })}</div></Card>

    <Card title="Low-Utilisation release candidates" term="Low-Utilisation" source="Factory Model (Data sheet)" right={<span className="text-xs">Below {pct(model.settings.lowUtilThreshold, 0)} of effective capacity</span>}>
      {rel.length ? <table className="w-full"><thead><tr><Th>Factory</Th><Th>Cell</Th><Th>Source</Th><Th>Asset</Th><Th>Machines</Th><Th term="Effective Utilisation">Effective util.</Th></tr></thead><tbody>{rel.map((c) => <FocusRow key={c.asset.id} match={focus?.kind === 'asset' && focus.ref === c.asset.id}><td className="td">{c.asset.factory}</td><td className="td">{c.asset.cell}</td><td className="td"><BasisPill passport={cellIsPassport(model, c.asset.factory, c.asset.cell)} /></td><td className="td">{c.asset.asset}</td><td className="td">{c.machines}</td><td className="td font-mono">{pct(c.effUtil)}</td></FocusRow>)}</tbody></table>
        : <p className="text-steel-500">{model.settings.lowUtilThreshold === null ? 'Set the low-utilisation threshold in Workspace 2.' : 'No assets under the threshold.'}</p>}</Card>

    <Card title="What-If Scenario log" term="Scenario" source="Factory Model (Data sheet)" right={<button className="btn-p" onClick={() => edit((d) => d.scenarios.push({ id: `S${Date.now().toString(36)}`, name: `Scenario ${d.scenarios.length + 1}`, factory: '', cell: '', asset: '', loadPct: 0, oeePts: 0, machinesAdd: 0, shift: '', note: '', reroute: 0 }))}>+ Log scenario</button>}>
      <div className="overflow-auto"><table className="w-full min-w-[1100px]"><thead><tr><Th>Scenario</Th><Th>Asset</Th><Th>Load %</Th><Th>OEE pts</Th><Th>+Machines</Th><Th>Shift</Th><Th>Re-route (h)</Th><Th>Before</Th><Th>After</Th><Th>Cell before → after</Th><th className="th" /></tr></thead>
        <tbody>{model.scenarios.map((s, i) => { if (!inScope(s.factory) && s.factory) return null; const r = scenarioResult(model, s); return <FocusRow key={s.id} match={focus?.kind === 'scenario' && focus.ref === s.id}>
          <td className="td w-44"><input aria-label="Scenario name" className="inp" value={s.name} onChange={(e) => edit((d) => { d.scenarios[i].name = e.target.value; })} /></td>
          <td className="td w-64"><Sel label="Scenario asset" value={s.asset ? assetKey(s.factory, s.cell, s.asset) : ''} options={assetOpts} onChange={(v) => { const [f, c, a] = v.split('|'); edit((d) => { Object.assign(d.scenarios[i], { factory: f ?? '', cell: c ?? '', asset: a ?? '' }); }); }} /></td>
          <td className="td w-20"><NumInput pct gap={false} label="Scenario load change" value={s.loadPct} onChange={(v) => edit((d) => { d.scenarios[i].loadPct = v ?? 0; })} /></td>
          <td className="td w-20"><NumInput pct gap={false} label="Scenario OEE change" value={s.oeePts} onChange={(v) => edit((d) => { d.scenarios[i].oeePts = v ?? 0; })} /></td>
          <td className="td w-20"><NumInput gap={false} label="Scenario machines" value={s.machinesAdd} onChange={(v) => edit((d) => { d.scenarios[i].machinesAdd = v ?? 0; })} /></td>
          <td className="td w-32"><Sel label="Scenario shift" gap={false} blank="Unchanged" value={s.shift} options={SHIFTS} onChange={(v) => edit((d) => { d.scenarios[i].shift = v; })} /></td>
          <td className="td w-24"><NumInput gap={false} label="Scenario re-route hours" value={s.reroute} onChange={(v) => edit((d) => { d.scenarios[i].reroute = v ?? 0; })} /></td>
          <td className="td font-mono">{r ? pct(r.before) : '–'}</td><td className="td font-mono font-bold">{r ? pct(r.after) : '–'}</td>
          <td className="td text-xs">{r ? <>{n1(r.cellBefore === null ? null : r.cellBefore * 100)}% <BandChip band={r.bandBefore} /> → {n1(r.cellAfter === null ? null : r.cellAfter * 100)}% <BandChip band={r.bandAfter} /></> : 'Pick an asset'}</td>
          <td className="td"><button className="text-bad" aria-label="Delete scenario" onClick={() => edit((d) => { d.scenarios.splice(i, 1); })}>🗑</button></td></FocusRow>; })}</tbody></table></div>
      {!model.scenarios.length && <p className="text-steel-500">No scenarios logged yet.</p>}</Card>
  </div>;
}
