import { useMemo } from 'react';
import { REG_TYPES } from '../engine/constants';
import { isOverdue, level, score } from '../engine/governance';
import { runSelfTest, TOL } from '../engine/selftest';
import type { RegItem, RegType } from '../engine/types';
import { useApp } from '../store';
import { Card, FocusRow, NumInput, Sel, SourceBadge, Th } from './kit';

const LC: Record<string, string> = { HIGH: '#c0392b', MEDIUM: '#c98a00', LOW: '#1f8a4c', UNSCORED: '#8a97a5' };

export function WsGovernance() {
  const { model, edit, focus, asOf } = useApp();
  const upd = (i: number, fn: (r: RegItem) => void) => edit((d) => fn(d.register[i]));
  return <div className="grid gap-4">
    <section className="card accent-watch p-3" data-testid="assessor-help"><b>What this screen does</b>
      <p className="mt-1 text-slate-700">Gate &amp; Passport Status is managed in <b>4. Gate &amp; Passport Status</b>. Use this screen to log and track risks, assumptions, opportunities and actions in the Register below.</p></section>

    <Card title="Risks, Assumptions, Opportunities & Actions" term="Register" source="Risk, Assumption, Opportunity &amp; Action Register" right={<button className="btn-p" onClick={() => edit((d) => d.register.push({ id: `R${String(d.register.length + 1).padStart(2, '0')}`, type: 'Risk', title: '', owner: '', timeImpact: null, costImpact: null, due: '', status: 'Open', link: '', probability: null }))}>+ Add item</button>}>
      <div className="overflow-auto"><table className="w-full min-w-[1150px]"><thead><tr><Th>Ref</Th><Th>Type</Th><Th>Title</Th><Th>Owner</Th><Th>Cell / FPD</Th><Th>Probability (1–5)</Th><Th>Time (1–5)</Th><Th>Cost (1–5)</Th><Th term="Impact Score">Score</Th><Th>Level</Th><Th>Due</Th><Th>Status</Th><Th>Flags</Th><th className="th" /></tr></thead>
        <tbody>{model.register.map((r, i) => { const s = score(r), lv = level(s), od = isOverdue(r, asOf); return <FocusRow key={r.id + i} match={focus?.kind === 'risk' && focus.ref === r.id}>
          <td className="td">{r.id}</td>
          <td className="td w-32"><Sel label={`Type of ${r.id}`} gap={false} blank="" value={r.type} options={REG_TYPES} onChange={(v) => upd(i, (x) => { x.type = v as RegType; })} /></td>
          <td className="td w-64"><input aria-label={`Title of ${r.id}`} className={`inp ${r.title ? '' : 'inp-gap'}`} value={r.title} onChange={(e) => upd(i, (x) => { x.title = e.target.value; })} /></td>
          <td className="td w-44"><Sel label={`Owner of ${r.id}`} value={r.owner} options={model.settings.lists.Owners ?? []} onChange={(v) => upd(i, (x) => { x.owner = v; })} /></td>
          <td className="td w-40"><input aria-label={`Cell of ${r.id}`} list="reg-cells" className={`inp ${r.link || r.type === 'Action' ? '' : 'inp-gap'}`} value={r.link} onChange={(e) => upd(i, (x) => { x.link = e.target.value; })} /></td>
          <td className="td w-20"><NumInput label={`Probability of ${r.id}`} gap={r.type !== 'Action'} min={1} step={1} value={r.probability} onChange={(v) => upd(i, (x) => { x.probability = v; })} /></td>
          <td className="td w-20"><NumInput label={`Time impact of ${r.id}`} gap={r.type !== 'Action'} min={1} step={1} value={r.timeImpact} onChange={(v) => upd(i, (x) => { x.timeImpact = v; })} /></td>
          <td className="td w-20"><NumInput label={`Cost impact of ${r.id}`} gap={r.type !== 'Action'} min={1} step={1} value={r.costImpact} onChange={(v) => upd(i, (x) => { x.costImpact = v; })} /></td>
          <td className="td font-mono">{s ?? '–'}</td><td className="td"><span className="chip" style={{ background: LC[lv] }}>{lv}</span></td>
          <td className="td w-36"><input aria-label={`Due date of ${r.id}`} type="date" className="inp" value={r.due} onChange={(e) => upd(i, (x) => { x.due = e.target.value; })} /></td>
          <td className="td w-32"><Sel label={`Status of ${r.id}`} gap={false} blank="" value={r.status} options={model.settings.lists.Statuses ?? []} onChange={(v) => upd(i, (x) => { x.status = v; })} /></td>
          <td className="td">{od && <span className="chip bg-bad" data-testid="overdue">OVERDUE</span>}</td>
          <td className="td"><button className="text-bad" aria-label={`Delete ${r.id}`} onClick={() => edit((d) => { d.register.splice(i, 1); })}>🗑</button></td></FocusRow>; })}</tbody></table></div>
      <datalist id="reg-cells">{[...new Set(model.assets.map((a) => a.cell))].map((c) => <option key={c} value={c} />)}</datalist>
      <p className="text-xs text-steel-500 mt-1">Score = time impact × cost impact. HIGH ≥ 15, MEDIUM ≥ 8. Actions are flagged OVERDUE when past due and not closed (as of {asOf}).</p></Card>

  </div>;
}

export function SelfTestDrawer() {
  const { model } = useApp();
  const tests = useMemo(() => runSelfTest(model), [model]);
  const passed = tests.filter((t) => t.pass).length;
  return (
<details className="card" data-testid="selftest-drawer"><summary className="card-h cursor-pointer">10-Point Mathematical Self-Test<SourceBadge source="Factory Model, Cell Passport &amp; Product Flow (FPD)" /><span className={`chip ml-2 ${passed === tests.length ? 'bg-emerald-600' : 'bg-rose-600'}`} data-testid="selftest-total">{passed} / {tests.length} Passed</span></summary>
      <div className="p-3"><p className="text-xs text-slate-500 mb-2">Every figure is recomputed by a separate route and compared within {(TOL * 100).toFixed(3)}% tolerance.</p>
      <table className="w-full"><thead><tr><Th>#</Th><Th>Check</Th><Th>Result</Th><Th>Detail</Th></tr></thead><tbody>{tests.map((t) => <tr key={t.id} data-testid={`selftest-${t.id}`}><td className="td">{t.id}</td><td className="td font-medium">{t.name}</td><td className="td"><span className="chip" style={{ background: t.pass ? '#059669' : '#E11D48' }}>{t.pass ? 'PASS' : 'FAIL'}</span></td><td className="td text-slate-700">{t.detail}</td></tr>)}</tbody></table></div></details>
  );
}
