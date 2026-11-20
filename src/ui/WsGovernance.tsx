import { useEffect, useMemo, useState } from 'react';
import { EVIDENCE, GATES, HSE_THEMES, REG_TYPES, THEMES } from '../engine/constants';
import { allGates, isOverdue, level, ratingKey, score } from '../engine/governance';
import { runSelfTest, TOL } from '../engine/selftest';
import type { Rating, RegItem, RegType } from '../engine/types';
import { useApp } from '../store';
import { Card, FocusRow, NumInput, Sel, SourceBadge, Th, Toggle } from './kit';

const RC: Record<string, string> = { Met: '#1f8a4c', Partial: '#c98a00', 'Not met': '#c0392b', '': '#8a97a5' };
const LC: Record<string, string> = { HIGH: '#c0392b', MEDIUM: '#c98a00', LOW: '#1f8a4c', UNSCORED: '#8a97a5' };

export function WsGovernance() {
  const { model, edit, focus, asOf } = useApp();
  const [active, setActive] = useState('');
  const gates = allGates(model, active);
  const workbookCells = [...new Set(model.cellLines.map((c) => c.cell).concat(model.assets.map((a) => a.cell)))].filter(Boolean);
  useEffect(() => { if (focus?.kind === 'assessor' && model.assessor.cells.includes(focus.ref)) setActive(focus.ref); }, [focus]); // eslint-disable-line
  const markMet = (g: string) => edit((d) => { THEMES.forEach((_, ti) => { d.assessor.ratings[ratingKey(g, ti + 1, active)] = 'Met'; }); });
  const upd = (i: number, fn: (r: RegItem) => void) => edit((d) => fn(d.register[i]));
  return <div className="grid gap-4">
    <section className="card accent-watch p-3" data-testid="assessor-help"><b>What this screen does</b>
      <p className="mt-1 text-slate-700">Every cell is taken through six gates, <b>Define → Concept → Design → Prove → Launch → Consolidation</b>. At each gate you rate seven themes <i>Met</i>, <i>Partial</i> or <i>Not met</i>. Themes 3 and 7 are the health, safety and environment (HS&amp;E) sign-off: if either is <b>Not met</b>, that gate is locked as <b>BLOCKED (HS&amp;E)</b> and cannot pass. Then log risks and actions in the Register below.</p></section>

    <section className="card p-3 flex flex-wrap items-center gap-3" data-testid="active-cell-bar">
      <span className="text-xs font-semibold text-slate-600 uppercase">Active cell</span>
      <span className="px-3 py-1 rounded font-bold text-white bg-sky-700 text-[14px]" data-testid="active-cell-badge">{active || 'All cells (programme level)'}</span>
      <Sel label="Active cell" gap={false} blank="All cells (programme level)" value={active} options={model.assessor.cells} onChange={setActive} />
      <button className="btn-p" data-testid="add-all-cells" disabled={workbookCells.every((c) => model.assessor.cells.includes(c))} onClick={() => edit((d) => { workbookCells.forEach((c) => { if (!d.assessor.cells.includes(c)) d.assessor.cells.push(c); }); })}>+ Add All Workbook Cells</button>
      <span className="text-xs text-slate-500">{model.assessor.cells.length} of {workbookCells.length} workbook cells on the Assessor</span>{!workbookCells.length && <span className="text-xs text-amber-700" data-testid="gov-onboarding">No cells yet: import a workbook or add cell lines in 2. Data &amp; Gap Filler, then press + Add All Workbook Cells.</span>}</section>

    <Card title="Gate Assessor" term="Gate Assessor" source="Gate Assessor ratings (per cell)" right={<span className="text-xs">HS&amp;E themes (3 and 7) rated Not met → gate BLOCKED</span>}>
      <div className="overflow-auto"><table className="w-full min-w-[900px]"><thead><tr><Th>Theme</Th>{GATES.map((g) => <Th key={g}><div>{g}</div><button className="btn mt-1 text-[11px] !py-0.5" data-testid={`mark-met-${g}`} onClick={() => markMet(g)}>Mark Gate Met</button></Th>)}</tr></thead><tbody>
        {THEMES.map((t, ti) => <tr key={t}><td className="td font-medium whitespace-nowrap">{ti + 1}. {t}{HSE_THEMES.includes(ti + 1) && <span className="chip bg-bad ml-1">HS&amp;E</span>}</td>
          {GATES.map((g) => { const r = model.assessor.ratings[ratingKey(g, ti + 1, active)] ?? ''; return <td key={g} className={`td w-28 ${focus?.kind === 'assessor' && focus.ref === g ? 'focus-flash' : ''}`}>
            <select aria-label={`${g} theme ${ti + 1} rating`} className={`inp ${r === '' ? 'inp-gap' : ''}`} style={{ borderLeft: `4px solid ${RC[r]}` }} value={r} onChange={(e) => edit((d) => { d.assessor.ratings[ratingKey(g, ti + 1, active)] = e.target.value as Rating; })}>
              <option value="">— rate —</option><option>Met</option><option>Partial</option><option>Not met</option></select></td>; })}</tr>)}
        <tr className="bg-steel-50 font-semibold"><td className="td">Gate status</td>{gates.map((g) => <td key={g.gate} className="td" data-testid={`gate-status-${g.gate}`}><span className="chip" style={{ background: g.blocked ? '#c0392b' : g.label === 'PASSED' ? '#1f8a4c' : g.label === 'NOT STARTED' ? '#8a97a5' : '#c98a00' }}>{g.label}</span></td>)}</tr>
        <tr><td className="td font-semibold">Evidence Check (6-point)</td>{gates.map((g) => <td key={g.gate} className="td font-mono" data-testid={`evidence-${g.gate}`}>{g.evidence} / 6</td>)}</tr>
        <tr><td className="td font-semibold">Gate maturity</td>{gates.map((g) => <td key={g.gate} className="td"><div className="h-2 bg-steel-200 rounded"><div className="h-2 rounded bg-accent" style={{ width: `${g.maturity * 100}%` }} /></div><span className="text-[11px]">{(g.maturity * 100).toFixed(0)}% · {g.met}M {g.partial}P {g.notMet}N</span></td>)}</tr></tbody></table></div>
      <details className="mt-3"><summary className="cursor-pointer font-semibold">Evidence Check: tick the evidence behind each gate</summary>
        <table className="w-full mt-2"><thead><tr><Th>Evidence</Th>{GATES.map((g) => <Th key={g}>{g}</Th>)}</tr></thead><tbody>{EVIDENCE.map((e, ei) => <tr key={e}><td className="td">{ei + 1}. {e}</td>{GATES.map((g) => <td key={g} className="td"><Toggle label={`${g} evidence ${ei + 1}`} on={!!model.assessor.evidence[g]?.[ei]} onText="YES" offText="NO" onChange={(v) => edit((d) => { const a = d.assessor.evidence[g] ?? Array(6).fill(false); a[ei] = v; d.assessor.evidence[g] = a; })} /></td>)}</tr>)}</tbody></table></details></Card>

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
