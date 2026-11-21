import { calendarHours, cells, costByFactory, factoriesOf, gbp, n1, pct, timeSplit } from '../engine/calc';
import { cellIsPassport, combinedOverview, executiveTakeaway, factoryOverview, nextActions } from '../engine/overview';
import { fiveLines, scopedCells } from '../engine/story';
import { useApp } from '../store';
import { factoryKey } from '../engine/assumed';
import { Assumed, Card, BandChip, BasisPill, Empty, FocusRow, NumInput, Seg, Sel, SourceBadge, Th, Label, Field } from './kit';
import { DivergingBars, HBars, Ring, StackedH, UtilBars } from './charts';

const VCOL = { GOOD: '#059669', WATCH: '#D97706', BAD: '#E11D48' } as const;
const ACC = { GREEN: 'accent-good', AMBER: 'accent-watch', RED: 'accent-bad', NONE: 'accent-none' } as const;

export function WsDashboard() {
  const { model, filters, setFilters, edit, checks, focus, status, goTo } = useApp();
  const factories = factoriesOf(model);
  const all = cells(model, filters.source === 'Passport' ? 'passport' : 'model').filter((c) => filters.factory === 'All' || c.factory === filters.factory);
  const scoped = scopedCells(model, filters);
  const cost = costByFactory(model).filter((c) => filters.factory === 'All' || c.factory === filters.factory);
  const cal = calendarHours(model).filter((c) => filters.factory === 'All' || c.factory === filters.factory);
  const ts = timeSplit(model, filters.factory);
  const mcells = cells(model, 'model'), pcells = cells(model, 'passport');
  const idx = (k: string) => mcells.findIndex((c) => c.key === k);
  const bs = filters.source;
  const series = bs === 'Both' ? [{ name: 'Model', color: '#0B5CAB' }, { name: 'Passport', color: '#C2410C' }] : bs === 'Model' ? [{ name: 'Model', color: '#0B5CAB' }] : [{ name: 'Passport', color: '#C2410C' }];
  const PASSIVE_KEYWORDS = /acclimatisation|storage|buffer/i;
  const utilRows = scoped.map((c) => c.bottleneck).filter(Boolean).map((b) => {
    const isPassive = PASSIVE_KEYWORDS.test(b!.asset.asset);
    const lowShift = b!.asset.shift && /^1\s*shift|^2\s*shift/i.test(b!.asset.shift);
    const stdComplexity = b!.asset.complexity === 'Standard';
    const passiveNote = isPassive && (lowShift || stdComplexity) ? ' · passive holding: may be over-sized at this shift/limit' : '';
    return { label: b!.asset.asset + passiveNote, sub: <><span className="truncate" title={b!.asset.cell}>{b!.asset.cell}</span><BasisPill passport={cellIsPassport(model, b!.asset.factory, b!.asset.cell)} otherLabel="Model only" /></>, values: [b!.effUtil], lim: b!.limit };
  });
  const actions = nextActions(model, checks.issues, filters);
  const take = executiveTakeaway(model, filters, checks.counts.ERROR);
  if (!model.assets.length && !model.cellLines.length) return <Empty><p className="font-semibold text-slate-700 mb-1" data-testid="empty-onboarding">This workspace is blank.</p><p>Start by opening your <b>.xlsx</b> workbook (top bar), or go to <b>2. Data &amp; Gap Filler</b> and add a cell line and its assets. Every chart and table fills in as soon as there is data.</p></Empty>;
  const accent = status.verdict === 'GOOD' ? 'accent-good' : status.verdict === 'WATCH' ? 'accent-watch' : 'accent-bad';

  return <div className="grid gap-4">
    <section className={`card ${accent}`} data-testid="context-card">
      <div className="card-h"><Label>Factory overall context</Label><SourceBadge source="Factory Model (Data sheet) + Cell Passport where linked" /><span className="ml-auto text-xs font-normal text-slate-500">Edit freely: saved with your session, the .json auto-save and the .xlsx export</span></div>
      <div className="p-3 grid gap-3">
        <Field label="Site / Programme context brief">
          <textarea aria-label="Site / Programme context brief" rows={3} className="inp" placeholder="What do the factories make? What is the planning horizon? Why are we reviewing capacity, Passport alignment and flow?" value={model.contextBrief} onChange={(e) => edit((d) => { d.contextBrief = e.target.value; }, { silent: true })} /></Field>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="factory-cards">
          {factories.length > 0 && (() => { const o = combinedOverview(model); const n = Math.max(1, o.cells.length);
            return <div data-testid="factory-card-combined" className={`card ${filters.factory === 'All' ? 'ring-2 ring-indigo-500' : ''}`} style={{ borderTop: '4px solid #4F46E5' }}>
              <div className="p-3 grid gap-2">
                <div className="flex items-center gap-2"><b className="text-[15px] tracking-wide text-indigo-700">OVERALL COMBINED</b><span className="chip bg-indigo-600">{o.factories} factor{o.factories === 1 ? 'y' : 'ies'}</span>
                  <button className="btn ml-auto" data-testid="show-all-factories" aria-pressed={filters.factory === 'All'} disabled={filters.factory === 'All'} onClick={() => setFilters({ factory: 'All' })}>Show All Factories</button></div>
                <div className="text-[12px] text-slate-500">Combined roll-up across all loaded factories</div>
                <div className="flex gap-3 items-center">
                  <Ring value={o.utilisation} label="Combined capacity utilisation" />
                  <div className="grid gap-1 text-[12px] flex-1">
                    <div className="text-slate-500">Combined capacity utilisation (weighted)</div>
                    <div className="flex h-3 rounded overflow-hidden" title={`${o.green} GREEN, ${o.amber} AMBER, ${o.red} RED cells`}><span style={{ width: `${(o.green / n) * 100}%`, background: '#059669' }} /><span style={{ width: `${(o.amber / n) * 100}%`, background: '#D97706' }} /><span style={{ width: `${(o.red / n) * 100}%`, background: '#E11D48' }} /></div>
                    <div data-testid="combined-rag">{o.green} GREEN · {o.amber} AMBER · {o.red} RED cell(s)</div>
                    <div>{o.machines} machines · {o.assets} assets</div></div></div>
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <div><div className="text-slate-500">CapEx (£) <span className="text-[10px]">likely range</span></div><b>{gbp(o.likelyLow)} – {gbp(o.likelyHigh)}</b></div>
                  <div><div className="text-slate-500">Extra footprint</div><b>{n1(o.space, 0)} m²</b></div></div>
                {o.bottleneck ? <button className="text-left rounded px-2 py-1 bg-slate-50 border border-slate-200 text-[12px] hover:bg-amber-50" onClick={() => goTo({ ws: 2, kind: 'asset', ref: o.bottleneck!.asset.id })}>
                  Bottleneck: <b>{o.bottleneck.asset.asset}</b> in {o.bottleneck.asset.cell} · headroom <b style={{ color: o.bottleneck.headroom! < 0 ? '#E11D48' : '#059669' }}>{pct(o.bottleneck.headroom)}</b></button> : <div className="text-[12px] text-slate-500">No bottleneck yet: add load, machines and shifts.</div>}
              </div></div>; })()}
          {factories.map((f) => { const o = factoryOverview(model, f); const sel = filters.factory === f; const worst = o.red ? 'RED' : o.amber ? 'AMBER' : o.cells.length ? 'GREEN' : 'NONE'; const n = Math.max(1, o.cells.length);
            return <div key={f} data-testid={`factory-card-${f}`} className={`card ${ACC[worst]} ${sel ? 'ring-2 ring-sky-500' : ''}`}>
              <div className="p-3 grid gap-2">
                <div className="flex items-center gap-2"><b className="text-[15px]">{f}</b><button className="btn ml-auto" aria-pressed={sel} onClick={() => setFilters({ factory: sel ? 'All' : f })}>{sel ? 'Showing only this factory ✕' : `Filter to ${f}`}</button></div>
                <input aria-label={`Factory role of ${f}`} className="inp" placeholder="Factory role / description" value={o.role} onChange={(e) => edit((d) => { d.factoryRoles[f] = e.target.value; }, { silent: true })} />
                <div className="flex gap-3 items-center">
                  <Ring value={o.utilisation} label={`Capacity utilisation of ${f}`} />
                  <div className="grid gap-1 text-[12px] flex-1">
                    <div className="text-slate-500">Capacity utilisation</div>
                    <div className="flex h-3 rounded overflow-hidden" title={`${o.green} GREEN, ${o.amber} AMBER, ${o.red} RED cells`}><span style={{ width: `${(o.green / n) * 100}%`, background: '#059669' }} /><span style={{ width: `${(o.amber / n) * 100}%`, background: '#D97706' }} /><span style={{ width: `${(o.red / n) * 100}%`, background: '#E11D48' }} /></div>
                    <div>{o.green} GREEN · {o.amber} AMBER · {o.red} RED cell(s)</div>
                    <div>{o.machines} machines · {o.assets} assets</div>
                  </div></div>
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <div><div className="text-slate-500">CapEx (£) <span className="text-[10px]">likely range</span></div><b>{gbp(o.capex)}</b><div className="text-slate-500">{gbp(o.likelyLow)} – {gbp(o.likelyHigh)}</div></div>
                  <div><div className="text-slate-500">Extra footprint</div><b>{n1(o.space, 0)} m²</b></div></div>
                {o.bottleneck && <button className="text-left rounded px-2 py-1 bg-slate-50 border border-slate-200 text-[12px] hover:bg-amber-50" onClick={() => goTo({ ws: 2, kind: 'asset', ref: o.bottleneck!.asset.id })}>
                  Bottleneck: <b>{o.bottleneck.asset.asset}</b> in {o.bottleneck.asset.cell} · headroom <b style={{ color: o.bottleneck.headroom! < 0 ? '#E11D48' : '#059669' }}>{pct(o.bottleneck.headroom)}</b></button>}
              </div></div>; })}
        </div>
      </div></section>

    <Card title="3-point executive takeaway" source="Factory Model, Cell Passport &amp; Product Flow (FPD)"><ol className="list-decimal ml-5 space-y-1.5" data-testid="takeaway">{take.map((l, i) => <li key={i}>{l}</li>)}</ol></Card>

    <div className="flex items-center gap-3 px-3 rounded text-white text-[13px]" style={{ background: VCOL[status.verdict], maxHeight: 44, minHeight: 36 }} role="status" data-testid="verdict" data-verdict={status.verdict}>
      <b className="text-[14px] tracking-wide">{status.verdict}</b><span className="truncate">{status.reason}</span><span className="whitespace-nowrap rounded px-2 text-[12px] bg-white/20" data-testid="verdict-basis">Basis: {status.basis}</span>
      <span className="ml-auto whitespace-nowrap">{all.filter((c) => c.band === 'GREEN').length} GREEN · {all.filter((c) => c.band === 'AMBER').length} AMBER · {all.filter((c) => c.band === 'RED').length} RED</span></div>

    <div className="grid gap-4">
      <Card title="What to do next" source="Data Checks across Factory Model, Cell Passport &amp; FPD">
        {actions.length === 0 ? <p className="text-emerald-700 font-semibold">Nothing urgent. No critical data errors or overloaded cells in this view.</p> :
          <ol className="grid gap-2" data-testid="next-actions">{actions.map((a, i) => <li key={i} className="flex items-center gap-2 border border-slate-200 rounded p-2"><span className="font-bold text-slate-400">{i + 1}</span><span className="flex-1">{a.text}</span><button className="btn-p" onClick={() => goTo(a.target)}>Go &amp; Fix</button></li>)}</ol>}</Card>
    </div>

    <Card title="Cell capacity & headroom" term="Headroom" source="Cell Passport (where linked) / Factory Model (Data sheet)" right={<span className="text-xs">Bars centred on 0%: left = overloaded, right = spare headroom</span>}>
      <DivergingBars label="Cell headroom diverging chart" rows={scoped.map((c) => ({ label: c.cell, value: c.headroom, passport: cellIsPassport(model, c.factory, c.cell), tag: c.bottleneck ? `bottleneck: ${c.bottleneck.asset.asset}` : '' }))} /></Card>

    <Card title="Scope filters" right={<span className="text-xs text-slate-500">Factory is set in the top bar</span>}>
      <div className="flex flex-wrap gap-4 items-end">
        <Field label="Top N"><Seg label="Top N" value={filters.topN} options={[5, 10] as const} onChange={(v) => setFilters({ topN: v })} /></Field>
        <Field label="Source"><Seg label="Source" value={filters.source} options={['Both', 'Passport', 'Model'] as const} onChange={(v) => setFilters({ source: v })} /></Field>
        <Field label="Board filter"><Seg label="Board filter" value={filters.board} options={['All', 'GREEN', 'AMBER', 'RED'] as const} onChange={(v) => setFilters({ board: v })} /></Field>
        <Field label="Chart Sort"><Sel label="Chart Sort" gap={false} blank="" value={filters.sort} options={['Worst first', 'Best first', 'Name']} onChange={(v) => setFilters({ sort: v as never })} /></Field>
        <Field label="Chart Show"><Seg label="Chart Show" value={filters.show} options={['Headroom', 'Utilisation'] as const} onChange={(v) => setFilters({ show: v })} /></Field>
        <div className="flex gap-3 items-end"><span className="text-xs font-semibold text-slate-700"><Label term="Planned Weeks">Planned Weeks</Label></span>
          {Object.keys(model.settings.plannedWeeks).map((f) => <label key={f} className={`flex flex-col text-xs w-24 ${focus?.kind === 'factory' && focus.ref === f ? 'focus-flash' : ''}`}>{f}<Assumed k={factoryKey(f)} label={`planned weeks of ${f}`}><NumInput label={`Planned Weeks ${f}`} value={model.settings.plannedWeeks[f]} min={1} onChange={(v) => edit((d) => { d.settings.plannedWeeks[f] = v; })} /></Assumed></label>)}</div>
      </div></Card>

    <Card title="Cell Headroom Board" term="Headroom" source="Cell Passport (where linked) / Factory Model (Data sheet)" right={<span className="text-xs">GREEN ≥ 10% · AMBER 0–10% · RED &lt; 0%</span>}>
      <div className="overflow-auto"><table className="w-full"><thead><tr><Th>Factory</Th><Th>Cell</Th><Th>Source</Th><Th term="Headroom">Headroom</Th><Th>Band</Th><Th term="Bottleneck">Bottleneck asset</Th><Th term="Effective Utilisation">Effective util.</Th><Th term="Complexity Class">Limit</Th></tr></thead>
        <tbody>{scoped.map((c) => <FocusRow key={c.key} match={focus?.kind === 'cell' && focus.ref === c.key}><td className="td">{c.factory}</td><td className="td font-medium">{c.cell}</td><td className="td"><BasisPill passport={cellIsPassport(model, c.factory, c.cell)} /></td><td className="td font-mono">{pct(c.headroom)}</td><td className="td"><BandChip band={c.band} /></td><td className="td">{c.bottleneck?.asset.asset ?? '–'}</td><td className="td font-mono">{pct(c.bottleneck?.effUtil ?? null)}</td><td className="td font-mono">{pct(c.bottleneck?.limit ?? null, 0)}</td></FocusRow>)}</tbody></table></div>
      {!scoped.length && <p className="text-slate-500 py-2">No cells match the current filters.</p>}</Card>

    <Card title="Cost & Space by Factory" source="Factory Model (Data sheet)" right={<span className="text-xs text-slate-500">Extra machines needed to reach each class limit</span>}>
      <div className="overflow-auto"><table className="w-full"><thead><tr><Th>Factory</Th><Th term="Machines to add">Machines</Th><Th>Cost</Th><Th term="Worst-Case Range">Worst-case cost</Th><Th term="Likely Range">Likely range (RSS)</Th><Th>Space</Th><Th>Worst-case space</Th></tr></thead>
        <tbody>{cost.map((r) => <tr key={r.factory}><td className="td">{r.factory}</td><td className="td font-mono">{r.add}</td><td className="td font-mono">{gbp(r.cost)}</td><td className="td font-mono">{gbp(r.worstCost)}</td><td className="td font-mono">{gbp(r.likelyLow)} – {gbp(r.likelyHigh)}</td><td className="td font-mono">{n1(r.space, 0)} m²</td><td className="td font-mono">{n1(r.worstSpace, 0)} m²{r.missing ? <span className="text-rose-600 ml-1" title="Cost or space blank for some assets">⚠ {r.missing} gap(s)</span> : null}</td></tr>)}</tbody></table></div></Card>

    <div className="grid lg:grid-cols-2 gap-4">
      <Card title={filters.show === 'Headroom' ? 'Passport vs Model at OEE: Headroom' : 'Passport vs Model: Effective Utilisation'} term="Passport" source="Factory Model vs Cell Passport (OEE-adjusted)">
        {filters.show === 'Headroom' ? <HBars label="Passport versus model headroom by cell" rows={scoped.map((c) => ({ label: c.cell, values: bs === 'Both' ? [mcells[idx(c.key)].headroom, pcells[idx(c.key)].headroom] : [c.headroom] }))} series={series} />
          : <HBars label="Passport versus model utilisation by cell" zero rows={scoped.map((c) => ({ label: c.cell, values: bs === 'Both' ? [mcells[idx(c.key)].bottleneck?.effUtil ?? null, pcells[idx(c.key)].bottleneck?.effUtil ?? null] : [c.bottleneck?.effUtil ?? null] }))} series={series} />}</Card>
      <Card title="VA / ENVA / NVA Time Split" term="VA" source="Cell Passport hours where entered (cell lines), else Factory Model %">
        <StackedH label="Time split" pctMode parts={[{ name: 'VA', color: '#059669' }, { name: 'ENVA', color: '#D97706' }, { name: 'NVA', color: '#E11D48' }]} rows={ts.tot ? [{ label: filters.factory, v: [ts.va, ts.enva, ts.nva] }] : []} unit=" h" /></Card>
      <Card title="Calendar Hours Breakdown" term="Calendar Hours" source="Factory Model (Data sheet)">
        <StackedH label="Calendar hours" unit=" h" parts={[{ name: 'Not scheduled', color: '#94A3B8' }, { name: 'OEE loss', color: '#D97706' }, { name: 'Load used', color: '#0B5CAB' }, { name: 'Free', color: '#059669' }, { name: 'Unmet load', color: '#E11D48' }]} rows={cal.map((c) => ({ label: c.factory, v: [c.notScheduled, c.oeeLoss, c.load, c.free, c.overload] }))} /></Card>
      <Card title="Effective Utilisation vs Complexity Class Limit" term="Effective Utilisation" source="Factory Model &amp; Cell Passport (OEE-adjusted)" right={<span className="text-xs text-slate-500">Red bar = over limit · hover for formula</span>}>
        <UtilBars label="Effective utilisation versus class limit" rows={utilRows.map((r) => ({ assetLabel: r.label, cellLabel: r.sub, effUtil: r.values[0] ?? null, limit: r.lim ?? null }))} /></Card>
    </div>
    <Card title="The story in five lines" source="Factory Model, Cell Passport &amp; Product Flow (FPD)"><ol className="list-decimal ml-5 space-y-1" data-testid="story">{fiveLines(model, filters, checks.counts.ERROR).map((l, i) => <li key={i}>{l}</li>)}</ol></Card>
  </div>;
}
