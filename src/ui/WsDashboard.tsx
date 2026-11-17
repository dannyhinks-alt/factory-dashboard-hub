import { calendarHours, cells, costByFactory, factoriesOf, gbp, n1, pct, timeSplit, num } from '../engine/calc';
import { fiveLines, scopedCells, verdictOf } from '../engine/story';
import { useApp } from '../store';
import { Card, BandChip, Empty, FocusRow, NumInput, Seg, Sel, Th, Label, Field } from './kit';
import { HBars, StackedH } from './charts';

const VCOL = { GOOD: '#1f8a4c', WATCH: '#c98a00', BAD: '#c0392b' } as const;

export function WsDashboard() {
  const { model, filters, setFilters, edit, checks, focus } = useApp();
  const factories = ['All', ...factoriesOf(model)];
  const all = cells(model, filters.source === 'Passport' ? 'passport' : 'model').filter((c) => filters.factory === 'All' || c.factory === filters.factory);
  const verdict = verdictOf(all, checks.counts.ERROR);
  const scoped = scopedCells(model, filters);
  const cost = costByFactory(model).filter((c) => filters.factory === 'All' || c.factory === filters.factory);
  const cal = calendarHours(model).filter((c) => filters.factory === 'All' || c.factory === filters.factory);
  const ts = timeSplit(model, filters.factory);
  const mcells = cells(model, 'model'), pcells = cells(model, 'passport');
  const idx = (k: string) => mcells.findIndex((c) => c.key === k);
  const bs = filters.source;
  const series = bs === 'Both' ? [{ name: 'Model', color: '#0b5cab' }, { name: 'Passport', color: '#c2410c' }] : bs === 'Model' ? [{ name: 'Model', color: '#0b5cab' }] : [{ name: 'Passport', color: '#c2410c' }];
  const rowsH = scoped.map((c) => ({ label: c.cell, values: bs === 'Both' ? [mcells[idx(c.key)].headroom, pcells[idx(c.key)].headroom] : [c.headroom] }));
  const utilRows = scoped.map((c) => c.bottleneck).filter(Boolean).map((b) => ({ label: b!.asset.asset, values: [b!.effUtil], lim: b!.limit }));
  if (!model.assets.length) return <Empty>No assets yet. Add assets in Workspace 2 or open a workbook.</Empty>;
  return <div className="grid gap-4">
    <Card title="Scope filters" right={<span className="text-xs text-steel-500">Applies to every panel below</span>}>
      <div className="flex flex-wrap gap-4 items-end">
        <Field label="Factory" term="Factory"><Seg label="Factory" value={filters.factory} options={factories} onChange={(v) => setFilters({ factory: v })} /></Field>
        <Field label="Top N"><Seg label="Top N" value={filters.topN} options={[5, 10] as const} onChange={(v) => setFilters({ topN: v })} /></Field>
        <Field label="Source"><Seg label="Source" value={filters.source} options={['Both', 'Passport', 'Model'] as const} onChange={(v) => setFilters({ source: v })} /></Field>
        <Field label="Board filter"><Seg label="Board filter" value={filters.board} options={['All', 'GREEN', 'AMBER', 'RED'] as const} onChange={(v) => setFilters({ board: v })} /></Field>
        <Field label="Chart Sort"><Sel label="Chart Sort" gap={false} blank="" value={filters.sort} options={['Worst first', 'Best first', 'Name']} onChange={(v) => setFilters({ sort: v as never })} /></Field>
        <Field label="Chart Show"><Seg label="Chart Show" value={filters.show} options={['Headroom', 'Utilisation'] as const} onChange={(v) => setFilters({ show: v })} /></Field>
        <div className="flex gap-3 items-end"><span className="text-xs font-semibold text-steel-700"><Label term="Planned Weeks">Planned Weeks</Label></span>
          {Object.keys(model.settings.plannedWeeks).map((f) => <label key={f} className={`flex flex-col text-xs w-20 ${focus?.kind === 'factory' && focus.ref === f ? 'focus-flash' : ''}`}>{f}<NumInput label={`Planned Weeks ${f}`} value={model.settings.plannedWeeks[f]} min={1} onChange={(v) => edit((d) => { d.settings.plannedWeeks[f] = v; })} /></label>)}</div>
      </div></Card>

    <div className="rounded p-3 text-white flex flex-wrap items-center gap-4" style={{ background: VCOL[verdict] }} role="status" data-testid="verdict" data-verdict={verdict}>
      <span className="text-2xl font-extrabold tracking-wide">{verdict}</span>
      <span className="text-sm opacity-95">{verdict === 'GOOD' ? 'Every cell has 10% or more headroom and no data errors are open.' : verdict === 'WATCH' ? 'At least one AMBER cell or an open data error needs attention.' : 'At least one cell is overloaded (RED).'}</span>
      <span className="ml-auto text-sm">{all.filter((c) => c.band === 'GREEN').length} GREEN · {all.filter((c) => c.band === 'AMBER').length} AMBER · {all.filter((c) => c.band === 'RED').length} RED</span></div>

    <Card title="THE STORY IN FIVE LINES"><ol className="list-decimal ml-5 space-y-1" data-testid="story">{fiveLines(model, filters, checks.counts.ERROR).map((l, i) => <li key={i}>{l}</li>)}</ol></Card>

    <Card title="Cell Headroom Board" term="Headroom" right={<span className="text-xs">GREEN ≥ 10% · AMBER 0–10% · RED &lt; 0%</span>}>
      <div className="overflow-auto"><table className="w-full"><thead><tr><Th>Factory</Th><Th>Cell</Th><Th term="Headroom">Headroom</Th><Th>Band</Th><Th term="Bottleneck">Bottleneck asset</Th><Th term="Effective Utilisation">Effective util.</Th><Th term="Complexity Class">Limit</Th></tr></thead>
        <tbody>{scoped.map((c) => <FocusRow key={c.key} match={focus?.kind === 'cell' && focus.ref === c.key}><td className="td">{c.factory}</td><td className="td font-medium">{c.cell}</td><td className="td font-mono">{pct(c.headroom)}</td><td className="td"><BandChip band={c.band} /></td><td className="td">{c.bottleneck?.asset.asset ?? '–'}</td><td className="td font-mono">{pct(c.bottleneck?.effUtil ?? null)}</td><td className="td font-mono">{pct(c.bottleneck?.limit ?? null, 0)}</td></FocusRow>)}</tbody></table></div>
      {!scoped.length && <p className="text-steel-500 py-2">No cells match the current filters.</p>}</Card>

    <Card title="Cost & Space by Factory" right={<span className="text-xs text-steel-500">Extra machines needed to reach each class limit</span>}>
      <div className="overflow-auto"><table className="w-full"><thead><tr><Th>Factory</Th><Th term="Machines to add">Machines</Th><Th>Cost</Th><Th term="Worst-Case Range">Worst-case cost</Th><Th term="Likely Range">Likely range (RSS)</Th><Th>Space</Th><Th>Worst-case space</Th></tr></thead>
        <tbody>{cost.map((r) => <tr key={r.factory}><td className="td">{r.factory}</td><td className="td font-mono">{r.add}</td><td className="td font-mono">{gbp(r.cost)}</td><td className="td font-mono">{gbp(r.worstCost)}</td><td className="td font-mono">{gbp(r.likelyLow)} – {gbp(r.likelyHigh)}</td><td className="td font-mono">{n1(r.space, 0)} m²</td><td className="td font-mono">{n1(r.worstSpace, 0)} m²{r.missing ? <span className="text-bad ml-1" title="Cost or space blank for some assets">⚠ {r.missing} gap(s)</span> : null}</td></tr>)}</tbody></table></div></Card>

    <div className="grid lg:grid-cols-2 gap-4">
      <Card title={filters.show === 'Headroom' ? 'Passport vs Model at OEE: Headroom' : 'Passport vs Model: Effective Utilisation'} term="Passport">
        {filters.show === 'Headroom' ? <HBars label="Passport versus model headroom by cell" rows={rowsH} series={series} />
          : <HBars label="Passport versus model utilisation by cell" zero rows={scoped.map((c) => ({ label: c.cell, values: bs === 'Both' ? [mcells[idx(c.key)].bottleneck?.effUtil ?? null, pcells[idx(c.key)].bottleneck?.effUtil ?? null] : [c.bottleneck?.effUtil ?? null] }))} series={series} />}</Card>
      <Card title="VA / ENVA / NVA Time Split" term="VA">
        <StackedH label="Time split" pctMode parts={[{ name: 'VA', color: '#1f8a4c' }, { name: 'ENVA', color: '#c98a00' }, { name: 'NVA', color: '#c0392b' }]} rows={ts.tot ? [{ label: filters.factory, v: [ts.va, ts.enva, ts.nva] }] : []} unit=" h" /></Card>
      <Card title="Calendar Hours Breakdown" term="Calendar Hours">
        <StackedH label="Calendar hours" unit=" h" parts={[{ name: 'Not scheduled', color: '#aab4bf' }, { name: 'OEE loss', color: '#c98a00' }, { name: 'Load used', color: '#0b5cab' }, { name: 'Free', color: '#1f8a4c' }, { name: 'Unmet load', color: '#c0392b' }]} rows={cal.map((c) => ({ label: c.factory, v: [c.notScheduled, c.oeeLoss, c.load, c.free, c.overload] }))} /></Card>
      <Card title="Effective Utilisation vs Complexity Class Limit" term="Effective Utilisation">
        <HBars label="Effective utilisation versus class limit" rows={utilRows.map((r) => ({ label: r.label, values: r.values }))} series={[{ name: 'Effective utilisation', color: '#0b5cab' }]} marker={(i) => utilRows[i].lim ?? null} fmt={(v) => `${(v * 100).toFixed(0)}%`} /></Card>
    </div>
    <p className="text-xs text-steel-500">Headroom = 1 − effective utilisation ÷ class limit. {num(model.settings.stressTest ? 1 : null) !== null ? `Capacity stress test is ON (+${(model.settings.stressPct * 100).toFixed(0)}% load).` : ''}</p>
  </div>;
}
