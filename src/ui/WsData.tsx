import { Fragment, useEffect, useState } from 'react';
import { COMPLEXITY, PLACEHOLDERS, SHIFTS } from '../engine/constants';
import { shiftHoursFor } from '../engine/calc';
import { band, calcAsset, factoriesOf, pct } from '../engine/calc';
import type { Asset, CellLine } from '../engine/types';
import { useApp } from '../store';
import { BandChip, Card, FocusRow, Field, Info, NumInput, Seg, Sel, Th, Toggle, Label } from './kit';

function ListEditor({ name, items, onChange }: { name: string; items: string[]; onChange: (v: string[]) => void }) {
  const [t, setT] = useState('');
  const add = () => { const v = t.trim(); if (v && !items.includes(v)) { onChange([...items, v]); setT(''); } };
  return <div><div className="font-semibold text-steel-700 mb-1">{name}</div><div className="flex flex-wrap gap-1 mb-1">{items.map((i) => <span key={i} className="inline-flex items-center gap-1 bg-steel-100 border border-steel-200 rounded px-1.5 py-0.5">{i}<button aria-label={`Remove ${i} from ${name}`} className="text-bad font-bold" onClick={() => onChange(items.filter((x) => x !== i))}>×</button></span>)}</div>
    <div className="flex gap-1"><input aria-label={`Add to ${name}`} className="inp" value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder={`Add to ${name}`} /><button className="btn" onClick={add}>Add</button></div></div>;
}

function AddShift() {
  const { edit } = useApp(); const [t, setT] = useState('');
  return <span className="flex gap-1"><input aria-label="Custom shift name" className="inp w-40" placeholder="Custom shift name" value={t} onChange={(e) => setT(e.target.value)} /><button className="btn" onClick={() => { const v = t.trim(); if (v) { edit((d) => { if (d.settings.shiftHours[v] === undefined) d.settings.shiftHours[v] = null; }); setT(''); } }}>Add shift</button></span>;
}

/** Inline helper shown whenever a shift pattern has no weekly hours defined (Data Check 7). */
function DefineShift({ shift }: { shift: string }) {
  const { model, edit } = useApp();
  const [h, setH] = useState('');
  if (!shift || shiftHoursFor(model, shift) !== null) return null;
  return <div className="mt-1 flex gap-1 items-center" data-testid="define-shift">
    <input aria-label={`Hours per week for ${shift}`} type="number" min={1} max={168} className="inp inp-gap w-20" placeholder="hrs/wk" value={h} onChange={(e) => setH(e.target.value)} />
    <button className="btn !py-1 whitespace-nowrap" onClick={() => { const v = Number(h); if (v > 0) edit((d) => { d.settings.shiftHours[shift] = v; }); }}>Define Shift Hours</button></div>;
}

export function WsData() {
  const { model, edit, focus, filters } = useApp();
  const globalFac = filters.factory;
  const [facLocal, setFac] = useState('All');
  const fac = globalFac !== 'All' ? globalFac : facLocal; const [cell, setCell] = useState('All'); const [asset, setAsset] = useState('All');
  const factories = factoriesOf(model);
  const cellsOf = [...new Set(model.assets.filter((a) => fac === 'All' || a.factory === fac).map((a) => a.cell))];
  const assetsOf = model.assets.filter((a) => (fac === 'All' || a.factory === fac) && (cell === 'All' || a.cell === cell));
  useEffect(() => {
    if (!focus) return;
    if (focus.kind === 'asset') { const a = model.assets.find((x) => x.id === focus.ref); if (a) { setFac(a.factory || 'All'); setCell(a.cell || 'All'); setAsset(a.id); } }
    if (focus.kind === 'cell') { const [f, c] = focus.ref.split('|'); setFac(f); setCell(c); setAsset('All'); }
    if (focus.kind === 'list') { setFac('All'); setCell('All'); setAsset('All'); }
  }, [focus]); // eslint-disable-line
  const rows = model.assets.filter((a) => (fac === 'All' || a.factory === fac) && (cell === 'All' || a.cell === cell) && (asset === 'All' || a.id === asset));
  const shiftOptions = [...new Set<string>([...SHIFTS, ...Object.keys(model.settings.shiftHours)])];
  const groups: { key: string; cell: string; line: CellLine | null; assets: Asset[] }[] = [];
  model.cellLines.forEach((c) => { if ((fac !== 'All' && c.factory !== fac) || (cell !== 'All' && c.cell !== cell)) return; const as = rows.filter((x) => x.cell === c.cell); if (asset !== 'All' && !as.length) return; groups.push({ key: c.id, cell: c.cell, line: c, assets: as }); });
  [...new Set(rows.map((x) => x.cell))].filter((c) => !model.cellLines.some((l) => l.cell === c)).forEach((c) => groups.push({ key: `orphan:${c}`, cell: c, line: null, assets: rows.filter((x) => x.cell === c) }));
  const addCell = () => edit((d) => { d.cellLines.push({ id: `C${Date.now().toString(36)}`, factory: fac === 'All' ? '' : fac, cell: '', note: '', vaHrs: null, envaHrs: null, nvaHrs: null, extraFootprint: null, passport: false, version: '', date: '', demandUnits: null, inspectionHrs: null, opsHrs: null, leanHrs: null, footprint: null, allocatedSpace: null }); });
  const upd = (id: string, fn: (a: Asset) => void) => edit((d) => { const a = d.assets.find((x) => x.id === id); if (a) fn(a); });
  const add = () => edit((d) => { const id = `A${Date.now().toString(36)}`; d.assets.push({ id, factory: fac === 'All' ? '' : fac, cell: cell === 'All' ? '' : cell, asset: '', note: '', demand: null, complexity: '', shift: '', machines: null, oee: null, plannedLosses: null, loadHrs: null, modelShift: '', modelOee: null, modelPlannedLosses: null, modelLoad: null, passportShift: '', passportOee: null, passportPlannedLosses: null, passportLoadHrs: null, passportUtilisation: null, operationQty: null, costPerMachine: null, spacePerMachine: null, costUncPct: null, vaPct: null, envaPct: null, inspectionHrs: null }); });
  const MODEL_OF: Record<string, 'modelShift' | 'modelOee' | 'modelPlannedLosses' | 'modelLoad'> = { shift: 'modelShift', oee: 'modelOee', plannedLosses: 'modelPlannedLosses', loadHrs: 'modelLoad' };
  const flash = (k: string, kind: string) => (focus?.kind === kind && focus.ref === k ? 'focus-flash rounded' : '');
  const S = model.settings;

  return <div className="grid gap-4">
    {!model.assets.length && !model.cellLines.length && <section className="card accent-watch p-4" data-testid="data-onboarding"><b>Nothing loaded yet. Two ways to start:</b><ol className="list-decimal ml-5 mt-1 space-y-1 text-slate-700"><li><b>Import:</b> use <i>Open .xlsx</i> in the top bar for your LEAN CELL DESIGN workbook, or open a saved <i>.json</i> auto-save from the start screen. Every gap is then listed and can be fixed here.</li><li><b>Type it in:</b> add a factory in <i>Central Lists</i> below, press <i>+ Add cell line</i>, then <i>+ Add asset</i> for each machine group.</li></ol></section>}
    <Card title="Guided data & gap filler: cell summary lines with their assets beneath" source="Factory Model block + Cell Design Passport block (Data sheet)" right={<><button className="btn" onClick={addCell}>+ Add cell line</button><button className="btn-p" onClick={add}>+ Add asset</button></>}>
      <div className="flex flex-wrap gap-3 mb-3">
        {globalFac === 'All' && <Field label="Factory" term="Factory"><Sel label="Factory filter" gap={false} blank="All factories" value={fac === 'All' ? '' : fac} options={factories} onChange={(v) => { setFac(v || 'All'); setCell('All'); setAsset('All'); }} /></Field>}
        <Field label="Cell"><Sel label="Cell filter" gap={false} blank="All cells" value={cell === 'All' ? '' : cell} options={cellsOf} onChange={(v) => { setCell(v || 'All'); setAsset('All'); }} /></Field>
        <div className="flex flex-col text-[12px] text-slate-700">Asset<select aria-label="Asset filter" className="inp" value={asset} onChange={(e) => setAsset(e.target.value)}><option value="All">All assets</option>{assetsOf.map((a) => <option key={a.id} value={a.id}>{a.asset || '(unnamed)'}</option>)}</select></div>
        <span className="text-xs text-slate-500 self-end">Amber boxes are gaps. Cell lines (grey bands) hold demand and VA / ENVA / NVA / inspection; asset lines hold machines, shifts, OEE and load.</span>
      </div>
      <div className="overflow-auto max-h-[65vh]"><table className="dense w-full min-w-[2300px]"><thead>
        <tr><th className="th" colSpan={3}>CELL › ASSET</th><th className="th bg-sky-100" colSpan={6}>FACTORY MODEL</th><th className="th bg-amber-100" colSpan={6}>PASSPORT (OEE-ADJUSTED)</th><th className="th" colSpan={5}>COST &amp; SPACE</th><th className="th" colSpan={3}>CHECK</th></tr>
        <tr>
        <Th>Factory</Th><Th>Cell</Th><Th>Asset</Th><Th term="Complexity Class">Complexity</Th><Th term="Shift Pattern">Shift</Th><Th>Machines</Th><Th term="OEE">OEE %</Th><Th>Planned losses (h/yr)</Th><Th>Load (h/yr)</Th>
        <Th term="Passport">Passport shift</Th><Th>Passport OEE %</Th><Th>Passport planned losses</Th><Th>Passport load (h)</Th><Th>Operation qty</Th><Th>Passport utilisation</Th>
        <Th>Cost/machine £</Th><Th>Space/machine m²</Th><Th>Cost unc. %</Th><Th term="VA">VA %</Th><Th term="ENVA">ENVA %</Th><Th>Inspection h (cell line only)</Th><Th term="Headroom">Headroom</Th><th className="th" /></tr></thead>
        <tbody>{groups.map((g) => <Fragment key={g.key}>
          {g.line ? (() => { const c = g.line; const ci = model.cellLines.findIndex((x) => x.id === c.id); const setC = (fn: (x: CellLine) => void) => edit((d) => { fn(d.cellLines[ci]); });
            return <FocusRow match={focus?.kind === 'cellline' && focus.ref === c.id}>
              <td className="td bg-slate-200" colSpan={3}><div className="flex gap-2 items-center"><span className="chip bg-slate-600">CELL</span>
                <div className="shrink-0" style={{ minWidth: 96, width: 'auto', overflow: 'visible' }}><select aria-label={`Factory of cell line ${c.cell}`} className={`inp inp-auto ${c.factory ? '' : 'inp-gap'}`} style={{ minWidth: 96, width: 'auto', flexShrink: 0, overflow: 'visible' }} value={c.factory} onChange={(e) => setC((x) => { x.factory = e.target.value; })}><option value="">— select —</option>{factoriesOf(model).map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
                <input aria-label="Cell line name" className={`inp min-w-[160px] font-semibold ${c.cell ? '' : 'inp-gap'}`} value={c.cell} onChange={(e) => setC((x) => { x.cell = e.target.value; })} /></div></td>
              <td className="td bg-slate-200" colSpan={20}><div className="flex flex-wrap gap-x-3 gap-y-1 items-end">
                <div className="text-[11px] text-slate-600 flex flex-col"><span className="inline-flex items-center">Passport cell<Info text="YES = Cell is backed by a detailed Cell Design Passport JSON (linking validated cycle times, shift staffing, and equipment capacity). NO = High-level factory estimate only." term="Passport cell" /></span><Toggle small label={`Passport cell ${c.cell}`} on={c.passport} onText="YES" offText="NO" onChange={(v) => setC((x) => { x.passport = v; })} /></div>
                <div className="text-[11px] text-slate-600 w-20"><span className="inline-flex items-center">Version<Info text="Cell Design Passport revision linked to this cell." term="Version" /></span><input aria-label={`Passport version of ${c.cell}`} className={`inp ${!c.passport || c.version ? '' : 'inp-gap'}`} value={c.version} onChange={(e) => setC((x) => { x.version = e.target.value; })} /></div>
                <div className="text-[11px] text-slate-600 w-36"><span className="inline-flex items-center">Date<Info text="Baseline or last-verified date for the linked Cell Design Passport." term="Date" /></span><input aria-label={`Passport date of ${c.cell}`} type="date" className={`inp ${!c.passport || c.date ? '' : 'inp-gap'}`} value={c.date} onChange={(e) => setC((x) => { x.date = e.target.value; })} /></div>
                {([['demandUnits', 'Demand (units/yr)', 'Demand'], ['vaHrs', 'VA h', 'VA hours'], ['envaHrs', 'ENVA h', 'ENVA hours'], ['nvaHrs', 'NVA h', 'NVA hours'], ['inspectionHrs', 'Inspection h', 'Inspection'], ['extraFootprint', 'Extra footprint', 'Extra footprint'], ['opsHrs', 'Operations h', 'Operations hours'], ['leanHrs', 'Lean h', 'Lean hours'], ['footprint', 'Footprint m²', 'Footprint'], ['allocatedSpace', 'Allocated m²', 'Allocated space']] as const).map(([k, head, l]) =>
                  <label key={k} className="text-[11px] text-slate-600 w-24">{head}<NumInput gap={k === 'demandUnits'} label={`${l} of cell ${c.cell}`} value={c[k]} onChange={(v) => setC((x) => { x[k] = v; })} /></label>)}
                <button className="text-rose-600 ml-auto" aria-label={`Delete cell line ${c.cell}`} onClick={() => edit((d) => { d.cellLines.splice(ci, 1); })}>🗑 cell line</button></div></td></FocusRow>; })()
            : <tr><td className="td bg-amber-100" colSpan={23}><b>{g.cell}</b>: these assets have no cell summary line. <button className="btn ml-2" onClick={() => edit((d) => { const f = d.assets.find((a) => a.cell === g.cell)?.factory ?? ''; d.cellLines.push({ id: `C${Date.now().toString(36)}`, factory: f, cell: g.cell, note: '', vaHrs: null, envaHrs: null, nvaHrs: null, extraFootprint: null, passport: false, version: '', date: '', demandUnits: null, inspectionHrs: null, opsHrs: null, leanHrs: null, footprint: null, allocatedSpace: null }); })}>Create the cell line</button></td></tr>}
          {g.assets.map((a) => { const c = calcAsset(model, a, 'model'); return <FocusRow key={a.id} id={a.id} match={focus?.kind === 'asset' && focus.ref === a.id}>
          <td className="td w-20"><Sel label={`Factory of ${a.asset}`} value={a.factory} options={factoriesOf(model)} onChange={(v) => upd(a.id, (x) => { x.factory = v; })} /></td>
          <td className="td min-w-[160px]"><input aria-label={`Cell of ${a.asset}`} list="cells-dl" className={`inp ${a.cell ? '' : 'inp-gap'}`} value={a.cell} onChange={(e) => upd(a.id, (x) => { x.cell = e.target.value; })} /></td>
          <td className="td min-w-[180px]"><input aria-label="Asset name" className={`inp ${a.asset ? '' : 'inp-gap'}`} value={a.asset} onChange={(e) => upd(a.id, (x) => { x.asset = e.target.value; })} /></td>
          <td className="td min-w-[140px]"><Sel label={`Complexity of ${a.asset}`} value={a.complexity} options={COMPLEXITY} onChange={(v) => upd(a.id, (x) => { x.complexity = v; })} /></td>
          <td className="td min-w-[135px]"><Sel label={`Shift of ${a.asset}`} value={a.shift} options={shiftOptions} onChange={(v) => upd(a.id, (x) => { x.shift = v; x.modelShift = v; })} /><DefineShift shift={a.shift} /></td>
          {([['machines', 'Machines', false], ['oee', 'OEE', true], ['plannedLosses', 'Planned losses', false], ['loadHrs', 'Load', false]] as const).map(([k, l, p]) =>
            <td key={k} className="td w-20"><NumInput pct={p} label={`${l} of ${a.asset}`} value={a[k]} onChange={(v) => upd(a.id, (x) => { x[k] = v; if (k in MODEL_OF) (x as unknown as Record<string, number | null>)[MODEL_OF[k]] = v; })} /></td>)}
          <td className="td min-w-[135px] bg-slate-50"><Sel label={`Passport shift of ${a.asset}`} gap={false} value={a.passportShift} options={shiftOptions} onChange={(v) => upd(a.id, (x) => { x.passportShift = v; })} /><DefineShift shift={a.passportShift} /></td>
          {([['passportOee', 'Passport OEE', true], ['passportPlannedLosses', 'Passport planned losses', false], ['passportLoadHrs', 'Passport load', false], ['operationQty', 'Operation quantity', false]] as const).map(([k, l, p]) =>
            <td key={k} className="td w-20 bg-slate-50"><NumInput pct={p} gap={k === 'passportOee' || k === 'passportLoadHrs'} label={`${l} of ${a.asset}`} value={a[k]} onChange={(v) => upd(a.id, (x) => { x[k] = v; })} /></td>)}
          <td className="td font-mono bg-slate-50">{pct(a.passportUtilisation ?? calcAsset(model, a, 'passport').effUtil)}</td>
          {([['costPerMachine', 'Cost', false], ['spacePerMachine', 'Space', false], ['costUncPct', 'Cost uncertainty', true], ['vaPct', 'VA', true], ['envaPct', 'ENVA', true], ['inspectionHrs', 'Inspection', false]] as const).map(([k, l, p]) =>
            <td key={k} className="td w-20"><NumInput pct={p} label={`${l} of ${a.asset}`} value={a[k]} onChange={(v) => upd(a.id, (x) => { x[k] = v; })} /></td>)}
          <td className="td whitespace-nowrap font-mono">{pct(c.headroom)} <BandChip band={band(c.headroom)} /></td>
          <td className="td"><button className="text-rose-600" aria-label={`Delete ${a.asset}`} onClick={() => edit((d) => { d.assets = d.assets.filter((x) => x.id !== a.id); })}>🗑</button></td></FocusRow>; })}
        </Fragment>)}</tbody></table>
        <datalist id="cells-dl">{[...new Set(model.assets.map((a) => a.cell))].map((c) => <option key={c} value={c} />)}</datalist></div>
      {!groups.length && <p className="p-4 text-slate-500">Nothing matches. Clear the filters, or add a cell line and its assets.</p>}</Card>

    <div className="grid lg:grid-cols-2 gap-4">
      <Card title="Calculation settings" source="Settings sheet">
        <div className="grid gap-3">
          <div className="flex items-center gap-3"><Label term="OEE Mode">OEE Mode</Label><Seg label="OEE Mode" value={S.oeeMode} options={['Model', 'Passport', 'None'] as const} onChange={(v) => edit((d) => { d.settings.oeeMode = v; })} /></div>
          <div className="flex items-center gap-3"><Label term="Complexity Class">Default complexity class</Label><div className="w-40"><Sel label="Default complexity class" value={S.defaultComplexity} options={Object.keys(S.limits)} onChange={(v) => edit((d) => { d.settings.defaultComplexity = v; })} /></div></div>
          <div className={`flex items-center gap-3 ${flash('stress', 'setting')}`}><Label term="Capacity Stress Test">Apply Capacity Stress Test</Label><Toggle label="Apply Capacity Stress Test" on={S.stressTest} onChange={(v) => edit((d) => { d.settings.stressTest = v; })} onText="YES" offText="NO" />
            <span className="text-xs">Uplift</span><div className="w-20"><NumInput pct label="Stress test uplift %" value={S.stressPct} onChange={(v) => edit((d) => { d.settings.stressPct = v ?? 0; })} /></div></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Default working hours per day"><NumInput label="Default working hours per day" value={S.defaultWhd} onChange={(v) => edit((d) => { d.settings.defaultWhd = v; })} /></Field>
            <Field label="Low-utilisation threshold %" term="Low-Utilisation"><NumInput pct label="Low-utilisation threshold" value={S.lowUtilThreshold} onChange={(v) => edit((d) => { d.settings.lowUtilThreshold = v; })} /></Field></div>
          <div className={flash('limits', 'setting')}><div className="font-semibold text-steel-700 mb-1"><Label term="Complexity Class">Complexity Class limits</Label></div>
            <div className="grid grid-cols-4 gap-2">{Object.keys(S.limits).map((k) => <Field key={k} label={`${k} %`}><NumInput pct label={`Limit ${k}`} value={S.limits[k]} onChange={(v) => edit((d) => { d.settings.limits[k] = v; })} /></Field>)}</div></div>
        </div></Card>

      <Card title="Shift Calendar (hours per week)" term="Shift Pattern" source="Settings sheet" right={<AddShift />}>
        <table className="w-full"><thead><tr><Th>Shift pattern</Th><Th>Hours per week</Th><Th>Calendar share</Th></tr></thead><tbody>{Object.keys(S.shiftHours).map((k) => <tr key={k}><td className="td">{k}</td><td className="td w-32"><NumInput label={`Hours per week for ${k}`} value={S.shiftHours[k]} onChange={(v) => edit((d) => { d.settings.shiftHours[k] = v; })} /></td><td className="td font-mono">{S.shiftHours[k] ? ((S.shiftHours[k]! / 168) * 100).toFixed(0) + '%' : '–'}</td></tr>)}</tbody></table></Card>

      <Card title="Confirm Placeholders" term="Confirm Placeholders" source="Settings sheet" right={<span className="text-xs">{PLACEHOLDERS.filter((p) => S.confirmed[p]).length}/8 confirmed</span>}>
        <ul className="divide-y divide-steel-100">{PLACEHOLDERS.map((p) => <li key={p} className={`flex items-center justify-between py-1.5 ${flash(p, 'setting')}`}><span>{p}</span><Toggle label={`Confirm ${p}`} on={!!S.confirmed[p]} onText="YES" offText="NO" onChange={(v) => edit((d) => { d.settings.confirmed[p] = v; })} /></li>)}</ul></Card>

      <Card title="Cost entries (Settings)" source="Settings sheet" right={<button className="btn" onClick={() => edit((d) => d.settings.costEntries.push({ id: `K${Date.now().toString(36)}`, asset: '', cost: null, unc: null, raw: '' }))}>+ Add cost entry</button>}>
        <table className="w-full"><thead><tr><Th>Asset</Th><Th>Cost £</Th><Th>Uncertainty %</Th><th className="th" /></tr></thead><tbody>{S.costEntries.map((k, i) => <tr key={k.id} className={focus?.kind === 'setting' && focus.ref === `cost:${k.id}` ? 'focus-flash' : ''}>
          <td className="td"><Sel label="Cost entry asset" value={k.asset} options={[...new Set(model.assets.map((a) => a.asset))]} onChange={(v) => edit((d) => { d.settings.costEntries[i].asset = v; })} /></td>
          <td className="td w-32"><NumInput label="Cost entry" gap={false} value={k.cost} onChange={(v) => edit((d) => { d.settings.costEntries[i].cost = v; d.settings.costEntries[i].raw = v === null ? '' : String(v); })} /></td>
          <td className="td w-28"><NumInput pct label="Cost entry uncertainty" gap={false} value={k.unc} onChange={(v) => edit((d) => { d.settings.costEntries[i].unc = v; })} /></td>
          <td className="td"><button className="text-bad" aria-label="Delete cost entry" onClick={() => edit((d) => { d.settings.costEntries.splice(i, 1); })}>🗑</button></td></tr>)}</tbody></table>
        {!S.costEntries.length && <p className="text-steel-500">No cost entries. Per-machine costs can also be typed on the asset lines.</p>}</Card>

      <Card title="Central Lists" source="Settings sheet">
        <div className="grid gap-4">
          <ListEditor name="Factory codes (Settings)" items={factories} onChange={(v) => edit((d) => { const w: Record<string, number | null> = {}; v.forEach((f) => (w[f] = d.settings.plannedWeeks[f] ?? null)); d.settings.plannedWeeks = w; })} />
          {Object.entries({ Factories: [], Cells: [], Assets: [], ...S.lists }).map(([k, v]) => <ListEditor key={k} name={k} items={v} onChange={(nv) => edit((d) => { d.settings.lists[k] = nv; })} />)}
          <div><div className="font-semibold text-steel-700 mb-1">Cells (derived from assets)</div><div className="text-xs text-steel-500">{[...new Set(model.assets.map((a) => `${a.factory}: ${a.cell}`))].join(' · ') || 'None yet'}</div></div>
        </div></Card>
    </div>
  </div>;
}
