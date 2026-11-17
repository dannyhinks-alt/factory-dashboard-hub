import { calendarHours, cells, costByFactory, gbp, n1, pct } from '../engine/calc';
import { fiveLines, verdictOf } from '../engine/story';
import { solve } from '../engine/flow';
import { UPLIFTS } from '../engine/constants';
import { allGates } from '../engine/governance';
import { useApp } from '../store';

export function PrintSummary() {
  const { model, filters, checks } = useApp();
  const cs = cells(model, 'model'); const flow = solve(model, UPLIFTS[filters.uplift] ?? 0);
  return <div className="hidden print:block p-4 text-[11px]" data-testid="print-summary">
    <h1 className="text-lg font-bold">Factory Dashboard &amp; Flow Hub: Summary</h1>
    <p>Source: {model.sourceName} · Verdict: <b>{verdictOf(cs, checks.counts.ERROR)}</b> · {checks.counts.ERROR} ERROR, {checks.counts.WARN} WARN, {checks.counts.INFO} INFO</p>
    <h2 className="font-bold mt-2">The story in five lines</h2><ol className="list-decimal ml-5">{fiveLines(model, filters, checks.counts.ERROR).map((l, i) => <li key={i}>{l}</li>)}</ol>
    <h2 className="font-bold mt-2">Cell headroom</h2><table className="w-full"><tbody>{cs.map((c) => <tr key={c.key}><td>{c.factory}</td><td>{c.cell}</td><td>{pct(c.headroom)}</td><td>{c.band}</td></tr>)}</tbody></table>
    <h2 className="font-bold mt-2">Cost and space</h2><table className="w-full"><tbody>{costByFactory(model).map((r) => <tr key={r.factory}><td>{r.factory}</td><td>{r.add} machines</td><td>{gbp(r.cost)}</td><td>worst {gbp(r.worstCost)}</td><td>likely {gbp(r.likelyLow)} to {gbp(r.likelyHigh)}</td></tr>)}</tbody></table>
    <h2 className="font-bold mt-2">Calendar hours</h2><table className="w-full"><tbody>{calendarHours(model).map((r) => <tr key={r.factory}><td>{r.factory}</td><td>free {n1(r.free, 0)} h</td><td>overload {n1(r.overload, 0)} h</td></tr>)}</tbody></table>
    <h2 className="font-bold mt-2">Flow</h2><p>{n1(flow.endDay, 0)} days · critical chain {flow.chain.join(' ← ') || 'n/a'}</p>
    <h2 className="font-bold mt-2">Gates</h2><table className="w-full"><tbody>{allGates(model).map((g) => <tr key={g.gate}><td>{g.gate}</td><td>{g.met} met</td><td>evidence {g.evidence}/6</td><td>{g.label}</td></tr>)}</tbody></table>
  </div>;
}
