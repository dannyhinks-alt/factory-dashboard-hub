import { useEffect, useState } from 'react';
import { COMPLEXITY, PLACEHOLDERS, SHIFTS } from '../engine/constants';
import { band, calcAsset, factoriesOf, pct } from '../engine/calc';
import type { Asset } from '../engine/types';
import { useApp } from '../store';
import { BandChip, Card, FocusRow, Field, NumInput, Seg, Sel, Th, Toggle, Label } from './kit';

function ListEditor({ name, items, onChange }: { name: string; items: string[]; onChange: (v: string[]) => void }) {
  const [t, setT] = useState('');
  const add = () => { const v = t.trim(); if (v && !items.includes(v)) { onChange([...items, v]); setT(''); } };
  return <div><div className="font-semibold text-steel-700 mb-1">{name}</div><div className="flex flex-wrap gap-1 mb-1">{items.map((i) => <span key={i} className="inline-flex items-center gap-1 bg-steel-100 border border-steel-200 rounded px-1.5 py-0.5">{i}<button aria-label={`Remove ${i} from ${name}`} className="text-bad font-bold" onClick={() => onChange(items.filter((x) => x !== i))}>×</button></span>)}</div>
    <div className="flex gap-1"><input aria-label={`Add to ${name}`} className="inp" value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder={`Add to ${name}`} /><button className="btn" onClick={add}>Add</button></div></div>;
}

export function WsData() {
  const { model, edit, focus } = useApp();
  const [fac, setFac] = useState('All'); const [cell, setCell] = useState('All'); const [asset, setAsset] = useState('All');
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
  const upd = (id: string, fn: (a: Asset) => void) => edit((d) => { const a = d.assets.find((x) => x.id === id); if (a) fn(a); });
  const add = () => edit((d) => { const id = `A${Date.now().toString(36)}`; d.assets.push({ id, factory: fac === 'All' ? '' : fac, cell: cell === 'All' ? '' : cell, asset: '', note: '', demand: null, complexity: '', shift: '', machines: null, oee: null, plannedLosses: null, loadHrs: null, modelShift: '', modelOee: null, modelPlannedLosses: null, modelLoad: null, passportShift: '', passportOee: null, passportPlannedLosses: null, passportLoadHrs: null, passportUtilisation: null, operationQty: null, costPerMachine: null, spacePerMachine: null, costUncPct: null, vaPct: null, envaPct: null, inspectionHrs: null }); });
  const MODEL_OF: Record<string, 'modelShift' | 'modelOee' | 'modelPlannedLosses' | 'modelLoad'> = { shift: 'modelShift', oee: 'modelOee', plannedLosses: 'modelPlannedLosses', loadHrs: 'modelLoad' };
  const flash = (k: string, kind: string) => (focus?.kind === kind && focus.ref === k ? 'focus-flash rounded' : '');
  const S = model.settings;

  return <div className="grid gap-4">
    <Card title="Factory › Cell › Asset editor" right={<button className="btn-p" onClick={add}>+ Add asset</button>}>
      <div className="flex flex-wrap gap-3 mb-3">
        <Field label="Factory" term="Factory"><Sel label="Factory filter" gap={false} blank="All factories" value={fac === 'All' ? '' : fac} options={factories} onChange={(v) => { setFac(v || 'All'); setCell('All'); setAsset('All'); }} /></Field>
        <Field label="Cell"><Sel label="Cell filter" gap={false} blank="All cells" value={cell === 'All' ? '' : cell} options={cellsOf} onChange={(v) => { setCell(v || 'All'); setAsset('All'); }} /></Field>
        <div className="flex flex-col text-[12px] text-steel-700">Asset<select aria-label="Asset filter" className="inp" value={asset} onChange={(e) => setAsset(e.target.value)}><option value="All">All assets</option>{assetsOf.map((a) => <option key={a.id} value={a.id}>{a.asset || '(unnamed)'}</option>)}</select></div>
        <span className="text-xs text-steel-500 self-end">Blank (amber) fields are data gaps. Fill them in; checks update instantly.</span>
      </div>
      <div className="overflow-auto max-h-[60vh]"><table className="w-full min-w-[2400px]"><thead><tr>
        <Th>Factory</Th><Th>Cell</Th><Th>Asset</Th><Th term="Complexity Class">Complexity</Th><Th term="Shift Pattern">Shift</Th><Th>Machines</Th><Th term="OEE">OEE %</Th><Th>Planned losses (h/yr)</Th><Th>Load (h/yr)</Th>
        <Th term="Passport">Passport shift</Th><Th>Passport OEE %</Th><Th>Passport planned losses</Th><Th>Passport load (h)</Th><Th>Operation qty</Th><Th>Passport utilisation</Th>
        <Th>Cost/machine £</Th><Th>Space/machine m²</Th><Th>Cost unc. %</Th><Th term="VA">VA %</Th><Th term="ENVA">ENVA %</Th><Th>Inspection h (cell line only)</Th><Th term="Headroom">Headroom</Th><th className="th" /></tr></thead>
        <tbody>{rows.map((a) => { const c = calcAsset(model, a, 'model'); return <FocusRow key={a.id} id={a.id} match={focus?.kind === 'asset' && focus.ref === a.id}>
          <td className="td w-24"><Sel label={`Factory of ${a.asset}`} value={a.factory} options={factoriesOf(model)} onChange={(v) => upd(a.id, (x) => { x.factory = v; })} /></td>
          <td className="td min-w-[160px]"><input aria-label={`Cell of ${a.asset}`} list="cells-dl" className={`inp ${a.cell ? '' : 'inp-gap'}`} value={a.cell} onChange={(e) => upd(a.id, (x) => { x.cell = e.target.value; })} /></td>
          <td className="td min-w-[180px]"><input aria-label="Asset name" className={`inp ${a.asset ? '' : 'inp-gap'}`} value={a.asset} onChange={(e) => upd(a.id, (x) => { x.asset = e.target.value; })} /></td>
          <td className="td min-w-[140px]"><Sel label={`Complexity of ${a.asset}`} value={a.complexity} options={COMPLEXITY} onChange={(v) => upd(a.id, (x) => { x.complexity = v; })} /></td>
          <td className="td min-w-[135px]"><Sel label={`Shift of ${a.asset}`} value={a.shift} options={SHIFTS} onChange={(v) => upd(a.id, (x) => { x.shift = v; x.modelShift = v; })} /></td>
          {([['machines', 'Machines', false], ['oee', 'OEE', true], ['plannedLosses', 'Planned losses', false], ['loadHrs', 'Load', false]] as const).map(([k, l, p]) =>
            <td key={k} className="td w-24"><NumInput pct={p} label={`${l} of ${a.asset}`} value={a[k]} onChange={(v) => upd(a.id, (x) => { x[k] = v; if (k in MODEL_OF) (x as unknown as Record<string, number | null>)[MODEL_OF[k]] = v; })} /></td>)}
          <td className="td min-w-[135px] bg-steel-50"><Sel label={`Passport shift of ${a.asset}`} gap={false} value={a.passportShift} options={SHIFTS} onChange={(v) => upd(a.id, (x) => { x.passportShift = v; })} /></td>
          {([['passportOee', 'Passport OEE', true], ['passportPlannedLosses', 'Passport planned losses', false], ['passportLoadHrs', 'Passport load', false], ['operationQty', 'Operation quantity', false]] as const).map(([k, l, p]) =>
            <td key={k} className="td w-24 bg-steel-50"><NumInput pct={p} gap={k === 'passportOee' || k === 'passportLoadHrs'} label={`${l} of ${a.asset}`} value={a[k]} onChange={(v) => upd(a.id, (x) => { x[k] = v; })} /></td>)}
          <td className="td font-mono bg-steel-50">{pct(a.passportUtilisation ?? calcAsset(model, a, 'passport').effUtil)}</td>
          {([['costPerMachine', 'Cost', false], ['spacePerMachine', 'Space', false], ['costUncPct', 'Cost uncertainty', true], ['vaPct', 'VA', true], ['envaPct', 'ENVA', true], ['inspectionHrs', 'Inspection', false]] as const).map(([k, l, p]) =>
            <td key={k} className="td w-24"><NumInput pct={p} label={`${l} of ${a.asset}`} value={a[k]} onChange={(v) => upd(a.id, (x) => { x[k] = v; })} /></td>)}
          <td className="td whitespace-nowrap font-mono">{pct(c.headroom)} <BandChip band={band(c.headroom)} /></td>
          <td className="td"><button className="text-bad" aria-label={`Delete ${a.asset}`} onClick={() => edit((d) => { d.assets = d.assets.filter((x) => x.id !== a.id); })}>🗑</button></td></FocusRow>; })}</tbody></table>
        <datalist id="cells-dl">{[...new Set(model.assets.map((a) => a.cell))].map((c) => <option key={c} value={c} />)}</datalist></div>
      {!rows.length && <p className="p-4 text-steel-500">No assets match. Clear the filters or add an asset.</p>}</Card>

    <Card title="Cell lines" right={<button className="btn-p" onClick={() => edit((d) => d.cellLines.push({ id: `C${Date.now().toString(36)}`, factory: fac === 'All' ? '' : fac, cell: '', note: '', vaHrs: null, envaHrs: null, nvaHrs: null, extraFootprint: null, passport: false, version: '', date: '', demandUnits: null, inspectionHrs: null, opsHrs: null, leanHrs: null, footprint: null, allocatedSpace: null }))}>+ Add cell line</button>}>
      <div className="overflow-auto max-h-[40vh]"><table className="w-full min-w-[1700px]"><thead><tr><Th>Factory</Th><Th>Cell</Th><Th term="Passport">Passport cell</Th><Th>Version</Th><Th>Date</Th><Th>Demand (units/yr)</Th><Th term="VA">VA h</Th><Th term="ENVA">ENVA h</Th><Th term="NVA">NVA h</Th><Th>Inspection h</Th><Th>Extra footprint</Th><Th>Operations h</Th><Th>Lean h</Th><Th>Footprint m²</Th><Th>Allocated space m²</Th><th className="th" /></tr></thead>
        <tbody>{model.cellLines.map((c, i) => <FocusRow key={c.id} match={focus?.kind === 'cellline' && focus.ref === c.id}>
          <td className="td w-24"><Sel label={`Factory of cell line ${c.cell}`} value={c.factory} options={factoriesOf(model)} onChange={(v) => edit((d) => { d.cellLines[i].factory = v; })} /></td>
          <td className="td min-w-[160px]"><input aria-label="Cell line name" className={`inp ${c.cell ? '' : 'inp-gap'}`} value={c.cell} onChange={(e) => edit((d) => { d.cellLines[i].cell = e.target.value; })} /></td>
          <td className="td"><Toggle label={`Passport cell ${c.cell}`} on={c.passport} onText="YES" offText="NO" onChange={(v) => edit((d) => { d.cellLines[i].passport = v; })} /></td>
          <td className="td w-20"><input aria-label={`Passport version of ${c.cell}`} className={`inp ${!c.passport || c.version ? '' : 'inp-gap'}`} value={c.version} onChange={(e) => edit((d) => { d.cellLines[i].version = e.target.value; })} /></td>
          <td className="td w-36"><input aria-label={`Passport date of ${c.cell}`} type="date" className={`inp ${!c.passport || c.date ? '' : 'inp-gap'}`} value={c.date} onChange={(e) => edit((d) => { d.cellLines[i].date = e.target.value; })} /></td>
          {([['demandUnits', 'Demand'], ['vaHrs', 'VA hours'], ['envaHrs', 'ENVA hours'], ['nvaHrs', 'NVA hours'], ['inspectionHrs', 'Inspection'], ['extraFootprint', 'Extra footprint'], ['opsHrs', 'Operations hours'], ['leanHrs', 'Lean hours'], ['footprint', 'Footprint'], ['allocatedSpace', 'Allocated space']] as const).map(([k, l]) => <td key={k} className="td w-24"><NumInput gap={k === 'demandUnits'} label={`${l} of cell ${c.cell}`} value={c[k]} onChange={(v) => edit((d) => { d.cellLines[i][k] = v; })} /></td>)}
          <td className="td"><button className="text-bad" aria-label={`Delete cell line ${c.cell}`} onClick={() => edit((d) => { d.cellLines.splice(i, 1); })}>🗑</button></td></FocusRow>)}</tbody></table></div>
      {!model.cellLines.length && <p className="text-steel-500">No cell lines. Every asset's cell needs a cell line.</p>}</Card>

    <div className="grid lg:grid-cols-2 gap-4">
      <Card title="Calculation settings">
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

      <Card title="Shift Calendar (hours per week)" term="Shift Pattern">
        <table className="w-full"><thead><tr><Th>Shift pattern</Th><Th>Hours per week</Th><Th>Calendar share</Th></tr></thead><tbody>{Object.keys(S.shiftHours).map((k) => <tr key={k}><td className="td">{k}</td><td className="td w-32"><NumInput label={`Hours per week for ${k}`} value={S.shiftHours[k]} onChange={(v) => edit((d) => { d.settings.shiftHours[k] = v; })} /></td><td className="td font-mono">{S.shiftHours[k] ? ((S.shiftHours[k]! / 168) * 100).toFixed(0) + '%' : '–'}</td></tr>)}</tbody></table></Card>

      <Card title="Confirm Placeholders" term="Confirm Placeholders" right={<span className="text-xs">{PLACEHOLDERS.filter((p) => S.confirmed[p]).length}/8 confirmed</span>}>
        <ul className="divide-y divide-steel-100">{PLACEHOLDERS.map((p) => <li key={p} className={`flex items-center justify-between py-1.5 ${flash(p, 'setting')}`}><span>{p}</span><Toggle label={`Confirm ${p}`} on={!!S.confirmed[p]} onText="YES" offText="NO" onChange={(v) => edit((d) => { d.settings.confirmed[p] = v; })} /></li>)}</ul></Card>

      <Card title="Cost entries (Settings)" right={<button className="btn" onClick={() => edit((d) => d.settings.costEntries.push({ id: `K${Date.now().toString(36)}`, asset: '', cost: null, unc: null, raw: '' }))}>+ Add cost entry</button>}>
        <table className="w-full"><thead><tr><Th>Asset</Th><Th>Cost £</Th><Th>Uncertainty %</Th><th className="th" /></tr></thead><tbody>{S.costEntries.map((k, i) => <tr key={k.id} className={focus?.kind === 'setting' && focus.ref === `cost:${k.id}` ? 'focus-flash' : ''}>
          <td className="td"><Sel label="Cost entry asset" value={k.asset} options={[...new Set(model.assets.map((a) => a.asset))]} onChange={(v) => edit((d) => { d.settings.costEntries[i].asset = v; })} /></td>
          <td className="td w-32"><NumInput label="Cost entry" gap={false} value={k.cost} onChange={(v) => edit((d) => { d.settings.costEntries[i].cost = v; d.settings.costEntries[i].raw = v === null ? '' : String(v); })} /></td>
          <td className="td w-28"><NumInput pct label="Cost entry uncertainty" gap={false} value={k.unc} onChange={(v) => edit((d) => { d.settings.costEntries[i].unc = v; })} /></td>
          <td className="td"><button className="text-bad" aria-label="Delete cost entry" onClick={() => edit((d) => { d.settings.costEntries.splice(i, 1); })}>🗑</button></td></tr>)}</tbody></table>
        {!S.costEntries.length && <p className="text-steel-500">No cost entries. Per-machine costs can also be typed on the asset lines.</p>}</Card>

      <Card title="Central Lists">
        <div className="grid gap-4">
          <ListEditor name="Factory codes (Settings)" items={factories} onChange={(v) => edit((d) => { const w: Record<string, number | null> = {}; v.forEach((f) => (w[f] = d.settings.plannedWeeks[f] ?? null)); d.settings.plannedWeeks = w; })} />
          {Object.entries({ Factories: [], Cells: [], Assets: [], ...S.lists }).map(([k, v]) => <ListEditor key={k} name={k} items={v} onChange={(nv) => edit((d) => { d.settings.lists[k] = nv; })} />)}
          <div><div className="font-semibold text-steel-700 mb-1">Cells (derived from assets)</div><div className="text-xs text-steel-500">{[...new Set(model.assets.map((a) => `${a.factory}: ${a.cell}`))].join(' · ') || 'None yet'}</div></div>
        </div></Card>
    </div>
  </div>;
}
