import { SHIFTS } from '../engine/constants';
import { BandChip } from './kit';
import { band, pct, n1 } from '../engine/calc';
import { pressureList, releaseCandidates, scenarioResult, testSets } from '../engine/sensitivity';
import { useApp } from '../store';
import { Card, Empty, Field, FocusRow, NumInput, Sel, Th } from './kit';
import { factoriesOf } from '../engine/calc';

export function WsSensitivity() {
  const { model, edit, focus } = useApp();
  const pl = pressureList(model); const sets = testSets(model); const rel = releaseCandidates(model);
  const facs = factoriesOf(model);
  const assetKey = (f: string, c: string, a: string) => `${f}|${c}|${a}`;
  const assetOpts = model.assets.map((a) => assetKey(a.factory, a.cell, a.asset));
  if (!model.assets.length) return <Empty>No assets yet.</Empty>;
  return <div className="grid gap-4">
    <Card title="Pressure List" term="Break-Even" right={<span className="text-xs">Worst headroom first; each column is a single-lever break-even</span>}>
      <div className="overflow-auto max-h-[50vh]"><table className="w-full"><thead><tr><Th>#</Th><Th>Factory</Th><Th>Cell</Th><Th>Asset</Th><Th term="Headroom">Headroom</Th><Th>Band</Th><Th term="Break-Even">Load change</Th><Th>OEE needed</Th><Th term="Machines to add">Machines to add</Th><Th>Shift pattern needed</Th></tr></thead>
        <tbody>{pl.map((p, i) => <FocusRow key={p.c.asset.id} match={focus?.kind === 'asset' && focus.ref === p.c.asset.id}><td className="td">{i + 1}</td><td className="td">{p.c.asset.factory}</td><td className="td">{p.c.asset.cell}</td><td className="td font-medium">{p.c.asset.asset}</td><td className="td font-mono">{pct(p.headroom)}</td><td className="td"><BandChip band={band(p.headroom)} /></td>
          <td className="td font-mono">{p.loadChange >= 0 ? '+' : ''}{(p.loadChange * 100).toFixed(1)}%</td><td className="td font-mono">{pct(p.oeeNeeded)}{p.oeeNeeded! > 1 ? <span className="text-bad"> (&gt;100%)</span> : null}</td><td className="td font-mono">{p.machines}</td><td className="td">{p.shiftNeeded}</td></FocusRow>)}</tbody></table></div></Card>

    <Card title="3-Set Lever tester" term="Lever Set" right={<span className="text-xs">Baseline worst cell headroom: <b>{pct(sets.baseWorst)}</b></span>}>
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
          <div className="mt-1">Worst cell: <b className="font-mono">{pct(r.worst)}</b> {r.improvement !== null && <span className={r.improvement >= 0 ? 'text-good' : 'text-bad'}>({r.improvement >= 0 ? '+' : ''}{(r.improvement * 100).toFixed(1)} pts)</span>}</div></div></div>; })}</div></Card>

    <Card title="Low-Utilisation release candidates" term="Low-Utilisation" right={<span className="text-xs">Below {pct(model.settings.lowUtilThreshold, 0)} of effective capacity</span>}>
      {rel.length ? <table className="w-full"><thead><tr><Th>Factory</Th><Th>Cell</Th><Th>Asset</Th><Th>Machines</Th><Th term="Effective Utilisation">Effective util.</Th></tr></thead><tbody>{rel.map((c) => <FocusRow key={c.asset.id} match={focus?.kind === 'asset' && focus.ref === c.asset.id}><td className="td">{c.asset.factory}</td><td className="td">{c.asset.cell}</td><td className="td">{c.asset.asset}</td><td className="td">{c.machines}</td><td className="td font-mono">{pct(c.effUtil)}</td></FocusRow>)}</tbody></table>
        : <p className="text-steel-500">{model.settings.lowUtilThreshold === null ? 'Set the low-utilisation threshold in Workspace 2.' : 'No assets under the threshold.'}</p>}</Card>

    <Card title="What-If Scenario log" term="Scenario" right={<button className="btn-p" onClick={() => edit((d) => d.scenarios.push({ id: `S${Date.now().toString(36)}`, name: `Scenario ${d.scenarios.length + 1}`, factory: '', cell: '', asset: '', loadPct: 0, oeePts: 0, machinesAdd: 0, shift: '', note: '', reroute: 0 }))}>+ Log scenario</button>}>
      <div className="overflow-auto"><table className="w-full min-w-[1100px]"><thead><tr><Th>Scenario</Th><Th>Asset</Th><Th>Load %</Th><Th>OEE pts</Th><Th>+Machines</Th><Th>Shift</Th><Th>Re-route (h)</Th><Th>Before</Th><Th>After</Th><Th>Cell before → after</Th><th className="th" /></tr></thead>
        <tbody>{model.scenarios.map((s, i) => { const r = scenarioResult(model, s); return <FocusRow key={s.id} match={focus?.kind === 'scenario' && focus.ref === s.id}>
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
