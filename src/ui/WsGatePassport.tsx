import { GP_GATES, GP_THEME_NUMS, GP_THEMES } from '../engine/constants';
import { gpDateKey, gpGateStatus, gpRatingKey } from '../engine/governance';
import type { Rating } from '../engine/types';
import { useApp } from '../store';
import { Card, Th } from './kit';

const RC: Record<string, string> = { Met: '#1f8a4c', Partial: '#c98a00', 'Not met': '#c0392b', '': '#8a97a5' };
const SC: Record<string, string> = { 'PASSED 5/5': '#1f8a4c', 'IN PROGRESS': '#c98a00', 'NOT STARTED': '#8a97a5' };

export function WsGatePassport() {
  const { model, edit } = useApp();
  const workbookCells = [...new Set([...model.cellLines.map((c) => c.cell), ...model.assets.map((a) => a.cell)].filter(Boolean))].sort();

  const gpEdit = (cell: string, gate: string, themeNo: number, v: Rating) =>
    edit((d) => { d.assessor.gpRatings[gpRatingKey(cell, gate, themeNo)] = v; });
  const dateEdit = (cell: string, gate: string, v: string) =>
    edit((d) => { d.assessor.gpDateReviewed[gpDateKey(cell, gate)] = v; }, { silent: true });
  const noteEdit = (cell: string, gate: string, v: string) =>
    edit((d) => { d.assessor.gpHeadlineNote[gpDateKey(cell, gate)] = v; }, { silent: true });

  if (!workbookCells.length) {
    return <section className="card accent-watch p-4" data-testid="gp-onboarding"><b>No cells yet.</b><p className="mt-1 text-slate-700">Import a workbook or add cell lines in <b>2. Data &amp; Gap Filler</b>, then return here to track gate and passport status.</p></section>;
  }

  return (
    <div className="grid gap-4">
      <section className="card accent-watch p-3" data-testid="gp-help">
        <b>Gate &amp; Passport Status</b>
        <p className="mt-1 text-slate-700">Rate each cell through <b>Define → Concept → Design → Prove</b> on five themes. <b>PASSED 5/5</b> means all five themes are <i>Met</i>. Date Reviewed and Headline Note are synced with the Export Gaps workbook.</p>
      </section>

      <Card title="Gate & Passport Status" source="Gate Assessor ratings (Gate & Passport Status tab)">
        <div className="overflow-auto">
          <table className="dense w-full min-w-[1400px]">
            <thead>
              <tr>
                <Th>Cell ID</Th>
                <Th>Factory</Th>
                <Th>Passport</Th>
                <Th>Gate</Th>
                <Th>Status</Th>
                <Th>Date Reviewed</Th>
                {GP_THEME_NUMS.map((n) => <Th key={n}>{n}. {GP_THEMES[n]}</Th>)}
                <Th>Headline Note</Th>
              </tr>
            </thead>
            <tbody>
              {workbookCells.map((cell) => {
                const cl = model.cellLines.find((c) => c.cell === cell);
                const factory = cl?.factory ?? model.assets.find((a) => a.cell === cell)?.factory ?? '';
                const isPassport = cl?.passport ?? false;
                return GP_GATES.map((gate, gi) => {
                  const st = gpGateStatus(model, cell, gate);
                  const dk = gpDateKey(cell, gate);
                  return (
                    <tr key={`${cell}|${gate}`} className={gi === 0 ? 'border-t-2 border-slate-300' : ''}>
                      {gi === 0 && (
                        <>
                          <td className="td font-semibold whitespace-nowrap" rowSpan={GP_GATES.length}>{cell}</td>
                          <td className="td text-xs" rowSpan={GP_GATES.length}>{factory}</td>
                          <td className="td" rowSpan={GP_GATES.length}>
                            <span className="chip" style={{ background: isPassport ? '#0B5CAB' : '#8a97a5' }}>{isPassport ? 'Passport' : 'Factory Model'}</span>
                          </td>
                        </>
                      )}
                      <td className="td font-medium whitespace-nowrap">{gate}</td>
                      <td className="td whitespace-nowrap">
                        <span className="chip" style={{ background: SC[st.label] ?? '#8a97a5' }}>{st.label}</span>
                      </td>
                      <td className="td w-36">
                        <input type="date" aria-label={`Date reviewed ${cell} ${gate}`} className="inp" value={model.assessor.gpDateReviewed[dk] ?? ''} onChange={(e) => dateEdit(cell, gate, e.target.value)} />
                      </td>
                      {GP_THEME_NUMS.map((tNum) => {
                        const rk = gpRatingKey(cell, gate, tNum);
                        const v = model.assessor.gpRatings[rk] ?? '';
                        return (
                          <td key={tNum} className="td w-28">
                            <select aria-label={`${gate} theme ${tNum} ${GP_THEMES[tNum]}`} className={`inp ${v === '' ? 'inp-gap' : ''}`} style={{ borderLeft: `4px solid ${RC[v]}` }} value={v} onChange={(e) => gpEdit(cell, gate, tNum, e.target.value as Rating)}>
                              <option value="">— rate —</option>
                              <option>Met</option>
                              <option>Partial</option>
                              <option>Not met</option>
                            </select>
                          </td>
                        );
                      })}
                      <td className="td min-w-[200px]">
                        <input aria-label={`Headline note ${cell} ${gate}`} className="inp" value={model.assessor.gpHeadlineNote[dk] ?? ''} onChange={(e) => noteEdit(cell, gate, e.target.value)} placeholder="Headline note…" />
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
