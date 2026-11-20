import { compareFactory, compareRows, pct, n1 } from '../engine/calc';
import type { Align } from '../engine/calc';
import { useApp } from '../store';
import { cellIsPassport, fpdHeadroomByCell } from '../engine/overview';
import { BasisPill, Card, Empty, FocusRow, Th } from './kit';
import { HBars } from './charts';

const AC: Record<Align, string> = { ALIGNED: '#1f8a4c', DRIFTING: '#c98a00', DIVERGED: '#c0392b', 'NO PAIR': '#8a97a5' };
export function WsCompare() {
  const { model, focus, filters } = useApp();
  const inScope = (f: string) => filters.factory === 'All' || f === filters.factory;
  const rows = compareRows(model).filter((r) => inScope(r.factory)), fac = compareFactory(model).filter((f) => inScope(f.factory));
  if (!rows.length) return <Empty><b>No cells to compare yet.</b><br />Model vs Passport needs cells with factory-model and Passport figures. Import your workbook, or fill the two blocks in <b>2. Data &amp; Gap Filler</b>.</Empty>;
  const fpdHeadroom = fpdHeadroomByCell(model);
  const tot = (k: Align) => rows.filter((r) => r.align === k).length;
  return <div className="grid gap-4">
    <Card title="Model vs Passport: alignment summary" source="Factory Model vs Cell Design Passport" right={<span className="text-xs">Variance = Model restated at Passport OEE − Passport headroom</span>}>
      <div className="flex gap-3 flex-wrap" data-testid="align-counts">{(['ALIGNED', 'DRIFTING', 'DIVERGED', 'NO PAIR'] as Align[]).map((k) => <div key={k} className="border rounded px-4 py-2 text-center" style={{ borderColor: AC[k] }}><div className="text-2xl font-bold" style={{ color: AC[k] }}>{tot(k)}</div><div className="text-xs font-semibold">{k}</div></div>)}</div></Card>
    <Card title="Factory roll-up: Model vs Cell Design Passports" term="Passport" source="Factory Model, Cell Design Passport &amp; Product Flow (FPD) hours">
      <div className="overflow-auto"><table className="w-full"><thead><tr><Th>Factory</Th><Th>Model (no OEE)</Th><Th>Model @ Passport OEE</Th><Th>Passport</Th><Th term="FPD">FPD hours</Th><Th>Model load hours</Th><Th>FPD ops</Th><Th term="ALIGNED">Aligned</Th><Th term="DRIFTING">Drifting</Th><Th term="DIVERGED">Diverged</Th><Th term="NO PAIR">No pair</Th></tr></thead>
        <tbody>{fac.map((f) => <tr key={f.factory}><td className="td font-semibold">{f.factory}</td><td className="td font-mono">{pct(f.noOee)}</td><td className="td font-mono">{pct(f.restated)}</td><td className="td font-mono">{pct(f.passport)}</td><td className="td font-mono">{n1(f.fpdHours, 0)}</td><td className="td font-mono">{n1(f.modelHours, 0)}</td><td className="td font-mono">{f.fpdOps}</td><td className="td">{f.aligned}</td><td className="td">{f.drifting}</td><td className="td">{f.diverged}</td><td className="td">{f.noPair}</td></tr>)}</tbody></table></div>
      <p className="text-xs text-steel-500 mt-2">FPD hours versus model load hours shows whether the flow definitions and the cell model describe the same amount of work.</p></Card>
    <Card title="Cell-by-cell variance" source="Factory Model vs Cell Design Passport">
      <div className="overflow-auto"><table className="w-full"><thead><tr><Th>Factory</Th><Th>Cell</Th><Th>Source</Th><Th>Model (no OEE)</Th><Th>Model @ Passport OEE</Th><Th>Passport</Th><Th>Variance (pts)</Th><Th>Status</Th></tr></thead>
        <tbody>{rows.map((r) => <FocusRow key={r.key} match={focus?.kind === 'cell' && focus.ref === r.key}><td className="td">{r.factory}</td><td className="td font-medium">{r.cell}</td><td className="td"><BasisPill passport={cellIsPassport(model, r.factory, r.cell)} /></td><td className="td font-mono">{pct(r.noOee)}</td><td className="td font-mono">{pct(r.restated)}</td><td className="td font-mono">{pct(r.passport)}</td><td className="td font-mono">{r.variance === null ? '–' : (r.variance * 100).toFixed(1)}</td><td className="td"><span className="chip" style={{ background: AC[r.align] }}>{r.align}</span></td></FocusRow>)}</tbody></table></div></Card>
    <Card title="Headroom by cell: three views" source="1. Factory Model · 2. Cell Design Passport · 3. Product Flow (FPD)" right={<span className="text-xs">FPD view = 1 − (FPD hours routed through the cell ÷ its effective capacity)</span>}>
      <HBars label="Factory Model, Cell Design Passport and Product Flow headroom" rows={rows.map((r) => ({ label: r.cell, sub: <BasisPill passport={cellIsPassport(model, r.factory, r.cell)} />, values: [r.model, r.passport, fpdHeadroom[r.key] ?? null] }))}
        series={[{ name: '1. Factory Model', color: '#475569' }, { name: '2. Cell Design Passport', color: '#0F766E' }, { name: '3. Product Flow (FPD)', color: '#7C3AED' }]} /></Card>
  </div>;
}
