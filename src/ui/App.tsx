import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { DICTIONARY } from '../engine/constants';
import { RULES, runChecks } from '../engine/checks';
import { factoriesOf, cells as calcCells } from '../engine/calc';
import { readiness, scopeChecks, statusReason } from '../engine/overview';
import { verdictOf } from '../engine/story';
import { impactMessage } from '../engine/toast';
import { emptyModel } from '../engine/blank';
import { todayIso } from '../engine/governance';
import { exportWorkbook, readWorkbook } from '../engine/xlsx';
import { importSummary } from '../engine/importXlsx';
import { applyFilledGaps, buildGapWorkbook, gapFileName, looksLikeGapWorkbook } from '../engine/gaps';
import type { GapImportReport } from '../engine/gaps';
import type { ImportSummary } from '../engine/importXlsx';
import type { FocusTarget, Model, ScopeFilters, Severity } from '../engine/types';
import { UPLIFTS } from '../engine/constants';
import { AppCtx } from '../store';
import { buildDocx } from '../docxExport';
import { deserialise, readCachedSession, download, fsSupported, pickSaveFile, serialise, writeHandle } from '../persist';
import type { FsHandle } from '../persist';
import { Info, Seg } from './kit';
import { WsDashboard } from './WsDashboard';
import { WsData } from './WsData';
import { WsFlow } from './WsFlow';
import { WsSensitivity } from './WsSensitivity';
import { SelfTestDrawer, WsGovernance } from './WsGovernance';
import { WsCompare } from './WsCompare';
import { PrintSummary } from './PrintSummary';

const WS = ['Overall Status', 'Data & Gap Filler', 'Product Flow (FPD)', 'Gates, Scenarios & Register'];
const SEV_COL: Record<Severity, string> = { ERROR: '#c0392b', WARN: '#c98a00', INFO: '#0b5cab' };
const SESSION_KEY = 'factory-hub.session.v1';
const DEFAULT_FILTERS: ScopeFilters = { factory: 'All', topN: 10, source: 'Both', board: 'All', sort: 'Worst first', show: 'Headroom', uplift: 'Typical' };
const readSession = (): Model | null => { try { const t = localStorage.getItem(SESSION_KEY); const m = readCachedSession(t); if (t && !m) localStorage.removeItem(SESSION_KEY); return m; } catch { return null; } }; // legacy, demo or unreadable caches are discarded on boot
const writeSession = (m: Model | null) => { try { if (m) localStorage.setItem(SESSION_KEY, serialise(m)); else localStorage.removeItem(SESSION_KEY); } catch { /* storage blocked or full: session simply is not cached */ } };
type Save = { kind: 'none' | 'saving' | 'saved' | 'error'; at?: string; msg?: string };

export function App() {
  const [model, setModel] = useState<Model | null>(readSession); // blank (null) unless a saved session exists: never demo data
  const wbRef = useRef<XLSX.WorkBook | null>(null);
  const [ws, setWs] = useState(1);
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [filters, setF] = useState<ScopeFilters>(DEFAULT_FILTERS);
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(0);
  const [handle, setHandle] = useState<FsHandle | null>(null);
  const [save, setSave] = useState<Save>({ kind: 'none' });
  const [err, setErr] = useState('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [sevFilter, setSevFilter] = useState<Severity | 'ALL'>('ALL');
  const [ruleFilter, setRuleFilter] = useState('');
  const [gapOpen, setGapOpen] = useState(true);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const gapRef = useRef<HTMLInputElement>(null);
  const asOf = useMemo(() => todayIso(), []);

  const allChecks = useMemo(() => (model ? runChecks(model, asOf) : null), [model, asOf]);
  const checks = useMemo(() => (model && allChecks ? scopeChecks(model, allChecks, filters.factory) : null), [model, allChecks, filters.factory]);
  const [toasts, setToasts] = useState<{ id: number; msg: string; tone: 'good' | 'warn' | 'info' }[]>([]);
  const toastId = useRef(0); const lastToast = useRef(0);
  const toast = useCallback((msg: string, tone: 'good' | 'warn' | 'info' = 'info') => {
    const id = ++toastId.current; const now = Date.now(); const fast = now - lastToast.current < 1500; lastToast.current = now;
    setToasts((t) => [...(fast ? t.slice(0, -1) : t).slice(-2), { id, msg, tone }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  const modelRef = useRef<Model | null>(model); modelRef.current = model;
  const dict = useMemo(() => ({ ...DICTIONARY, ...(model?.dictionary ?? {}) }), [model?.dictionary]);
  const help = useCallback((t: string) => dict[t] ?? DICTIONARY[t] ?? '', [dict]);

  /** Atomic replace: every piece of previous state (model, workbook, filters, links, cache) is discarded before the new model is installed. */
  const load = useCallback((m: Model, wb: XLSX.WorkBook | null, warn: string[] = [], sum: ImportSummary | null = null) => {
    setSummary(sum); writeSession(null); wbRef.current = wb; setHandle(null); setSave({ kind: 'none' }); setF(DEFAULT_FILTERS); setSevFilter('ALL'); setRuleFilter('');
    setModel(structuredClone(m)); setNotes(warn); setErr(''); setDirty(false); setVersion(0); setFocus(null); setWs(1); setGapOpen(true); writeSession(m);
  }, []);
  const clearAll = () => {
    if (!window.confirm('Clear / blank the workspace? This wipes the loaded workbook, the saved session in this browser and any unsaved edits, and returns to a blank start. It cannot be undone.')) return;
    writeSession(null); wbRef.current = null; setHandle(null); setSave({ kind: 'none' }); setF(DEFAULT_FILTERS); setSevFilter('ALL'); setRuleFilter('');
    setModel(null); setSummary(null); setNotes([]); setErr(''); setDirty(false); setVersion(0); setFocus(null); setWs(1);
  };
  useEffect(() => { if (model) writeSession(model); }, [model]);
  const edit = useCallback((fn: (d: Model) => void, opts?: { silent?: boolean }) => {
    const cur = modelRef.current; if (!cur) return; const d = structuredClone(cur); fn(d); modelRef.current = d;
    setModel(d); setDirty(true); setVersion((v) => v + 1);
    if (!opts?.silent) { const r = impactMessage(cur, d, asOf); toast(r.msg, r.tone); }
  }, [asOf, toast]);

  /** Non-destructive patch from a filled-in gaps workbook; reports the exact effect. */
  const importGaps = (wb: XLSX.WorkBook) => {
    const cur = modelRef.current; if (!cur) { setErr('Open your project first (or a .json auto-save), then import the filled gaps into it.'); return; }
    const before = runChecks(cur, asOf).counts; let rep: GapImportReport | null = null;
    edit((d) => { rep = applyFilledGaps(d, wb); }, { silent: true });
    const r = rep as GapImportReport | null; if (!r || !r.sheets.length) { toast('No gap sheets found in that workbook', 'warn'); return; }
    const after = runChecks(modelRef.current!, asOf).counts; const resolved = before.ERROR + before.WARN - after.ERROR - after.WARN;
    toast(`Imported filled gaps: ${r.fieldsUpdated} field${r.fieldsUpdated === 1 ? '' : 's'} updated (${r.assetsPatched} asset, ${r.cellsPatched} cell, ${r.fpdsPatched} product family, ${r.ratingsSet} gate rating${r.ratingsSet === 1 ? '' : 's'}) · ERROR ${before.ERROR} → ${after.ERROR}, WARN ${before.WARN} → ${after.WARN}${resolved > 0 ? ` (${resolved} flag${resolved === 1 ? '' : 's'} resolved)` : ''}${r.unmatched.length ? ` · ${r.unmatched.length} row${r.unmatched.length === 1 ? '' : 's'} not matched and skipped` : ''}`, r.unmatched.length || !r.fieldsUpdated ? 'warn' : 'good');
  };
  const exportGaps = async () => {
    if (!model || !checks) return;
    download(gapFileName(filters.factory, new Date().toISOString().slice(0, 10)), await buildGapWorkbook(model, checks.issues, filters.factory, new Date().toISOString().slice(0, 10)), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    toast(`Exported ${checks.issues.length} flag${checks.issues.length === 1 ? '' : 's'} for ${filters.factory === 'All' ? 'all factories' : filters.factory}: fill the amber boxes, then use Import Filled Gaps`, 'info');
  };
  const openXlsx = async (file: File) => {
    try { const buf = await file.arrayBuffer(); const wb0 = XLSX.read(buf, { type: 'array' }); if (looksLikeGapWorkbook(wb0)) { importGaps(wb0); return; } const r = readWorkbook(buf, file.name); load(r.model, r.wb, r.warnings, importSummary(r.model)); }
    catch (e) { setErr(`Could not read "${file.name}" as an .xlsx workbook: ${(e as Error).message}`); }
  };
  const openJson = async (file: File) => { try { load(deserialise(await file.text()), null, ['Loaded from auto-save file.']); } catch (e) { setErr((e as Error).message); } };

  // auto-save
  useEffect(() => {
    if (!handle || !model || version === 0) return;
    setSave({ kind: 'saving' });
    const t = setTimeout(async () => { try { await writeHandle(handle, serialise(model)); setSave({ kind: 'saved', at: new Date().toLocaleTimeString('en-GB') }); setDirty(false); } catch (e) { setSave({ kind: 'error', msg: (e as Error).message }); } }, 700);
    return () => clearTimeout(t);
  }, [version, handle]); // eslint-disable-line
  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [dirty]);

  const link = async () => {
    if (!model) return;
    try {
      if (!fsSupported()) { download('factory-hub-autosave.json', serialise(model), 'application/json'); setDirty(false); setSave({ kind: 'saved', at: new Date().toLocaleTimeString('en-GB') + ' (downloaded: browser lacks File System Access)' }); return; }
      const h = await pickSaveFile('factory-hub-autosave.json'); await writeHandle(h, serialise(model)); setHandle(h); setDirty(false); setSave({ kind: 'saved', at: new Date().toLocaleTimeString('en-GB') });
    } catch (e) { if ((e as Error).name !== 'AbortError') setSave({ kind: 'error', msg: (e as Error).message }); }
  };
  const exportX = () => { if (!model) return; download(model.sourceName.replace(/\.xlsx$/i, '') + ' (updated).xlsx', exportWorkbook(model, wbRef.current, UPLIFTS[filters.uplift] ?? 0), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); if (!handle) setDirty(false); };
  const exportD = async () => { if (model && checks) download('Factory Dashboard Summary.docx', await buildDocx(model, filters, checks), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); };

  const goTo = useCallback((t: FocusTarget) => { setWs(t.ws); setFocus({ ...t }); setTimeout(() => setFocus((f) => (f === null || f.ref !== t.ref ? f : null)), 6000); }, []);
  const scopeCells = useMemo(() => (model ? calcCells(model, 'model').filter((c) => filters.factory === 'All' || c.factory === filters.factory) : []), [model, filters.factory]);
  const status = useMemo(() => { const v = verdictOf(scopeCells, checks?.counts.ERROR ?? 0); return { verdict: v, reason: statusReason(v, scopeCells, checks?.counts.ERROR ?? 0, filters.factory) }; }, [scopeCells, checks, filters.factory]);
  const ready = useMemo(() => (checks ? readiness(checks) : { pct: 0, errors: 0, clear: 0 }), [checks]);
  const ctx = useMemo(() => model && checks ? { model, edit, checks, filters, setFilters: (p: Partial<ScopeFilters>) => setF((f) => ({ ...f, ...p })), focus, goTo, help, asOf, status, ready, toast } : null, [model, edit, checks, filters, focus, goTo, help, asOf, status, ready, toast]);

  const pill = !handle ? (dirty ? { t: 'Unsaved changes · not linked', c: '#c98a00' } : { t: 'No auto-save linked', c: '#5d6b79' })
    : save.kind === 'saving' || dirty ? { t: save.kind === 'saving' ? 'Saving…' : 'Unsaved changes', c: '#c98a00' } : save.kind === 'error' ? { t: `Save failed: ${save.msg}`, c: '#c0392b' } : { t: `Saved ${save.at ?? ''}`, c: '#1f8a4c' };

  const VC = { GOOD: '#059669', WATCH: '#D97706', BAD: '#E11D48' } as const;
  const header = (
    <div className="no-print sticky top-0 z-40 shadow-md" style={{ background: '#0F172A' }}>
      <header className="text-white px-4 py-2 flex flex-wrap items-center gap-2">
        <div className="font-bold text-[15px] mr-1">Factory Dashboard &amp; Flow Hub</div>
        {model && <label className="flex items-center gap-1 bg-white/10 rounded px-2 py-1 min-w-[220px]" title="Click to edit the Model / Programme Name">
          <span aria-hidden>✎</span><input aria-label="Model / Programme Name" data-testid="programme-name" className="bg-transparent outline-none text-white placeholder-slate-400 w-full font-semibold" placeholder="Name this model / programme"
            value={model.programmeName} onChange={(e) => edit((d) => { d.programmeName = e.target.value; }, { silent: true })} /></label>}
        {model && <span className="text-xs text-slate-400 mr-auto" data-testid="source-name">{model.sourceName}</span>}
        {!model && <span className="mr-auto" />}
        {model && <>
          <button className="btn" onClick={() => fileRef.current?.click()}>Open .xlsx</button>
          <button className="btn" onClick={link}>Link Auto-Save (.json)</button>
          <span data-testid="save-pill" role="status" className="px-2 py-1 rounded text-xs font-semibold text-white" style={{ background: pill.c }}>{pill.t}</span>
          <button className="btn" onClick={exportX}>Export .xlsx</button>
          <button className="btn" onClick={exportD}>Export .docx</button>
          <button className="btn" onClick={() => window.print()}>Print summary</button>
          <button className="px-3 py-1.5 rounded border border-red-300 bg-red-700 text-white font-semibold hover:bg-red-800 text-[13px]" data-testid="clear-all" onClick={clearAll}>Clear / Blank Workspace</button>
        </>}
      </header>
      {model && <div className="px-4 pb-2 flex flex-wrap items-center gap-3 text-white" data-testid="command-bar">
        <div data-testid="factory-filter"><Seg label="Global factory filter" value={filters.factory} options={['All', ...factoriesOf(model)]} onChange={(v) => setF((f) => ({ ...f, factory: v }))} /></div>
        <span data-testid="status-pill" data-verdict={status.verdict} className="px-3 py-1 rounded font-bold text-[13px]" style={{ background: VC[status.verdict] }}>Overall: {status.verdict} — {status.reason}</span>
        <span className="flex items-center gap-2 text-xs" data-testid="readiness" title="Share of the 34 Data Checks with no ERROR or WARN flag">
          <span>Data readiness</span><span className="inline-block w-32 h-2.5 rounded bg-slate-600 overflow-hidden"><span className="block h-full" style={{ width: `${ready.pct}%`, background: ready.errors ? '#D97706' : '#059669' }} /></span>
          <b data-testid="readiness-pct">{ready.pct}% complete</b><span className={ready.errors ? 'text-rose-300 font-semibold' : 'text-emerald-300'} data-testid="readiness-errors">{ready.errors} critical error{ready.errors === 1 ? '' : 's'} left</span></span>
      </div>}
    </div>
  );
  const hidden = <><input ref={fileRef} type="file" accept=".xlsx,.xlsm" hidden data-testid="xlsx-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void openXlsx(f); e.target.value = ''; }} />
    <input ref={gapRef} type="file" accept=".xlsx" hidden data-testid="gaps-input" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { importGaps(XLSX.read(await f.arrayBuffer(), { type: 'array' })); } catch (er) { setErr(`Could not read "${f.name}": ${(er as Error).message}`); } } e.target.value = ''; }} />
    <input ref={jsonRef} type="file" accept=".json" hidden data-testid="json-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void openJson(f); e.target.value = ''; }} /></>;

  if (!model || !ctx || !checks) {
    return <div className="min-h-full flex flex-col">{header}{hidden}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className={`card max-w-2xl w-full p-8 text-center ${drag ? 'ring-4 ring-accent' : ''}`} data-testid="dropzone"
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void openXlsx(f); }}>
          <h1 className="text-xl font-bold mb-1">Load your LEAN CELL DESIGN: FACTORY DASHBOARD workbook</h1>
          <p className="text-steel-500 mb-5">Drag and drop an <b>.xlsx</b> here, in any state, partial or complete. Every data gap is found immediately. Nothing leaves this computer.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button className="btn-p" onClick={() => fileRef.current?.click()}>Choose .xlsx workbook</button>
            <button className="btn" onClick={() => load(emptyModel('Blank workbook'), null)}>Start with an empty workbook</button>
              <button className="btn" onClick={() => jsonRef.current?.click()}>Resume from auto-save (.json)</button>
          </div>
          {err && <p role="alert" className="mt-4 text-bad font-semibold">{err}</p>}
          <p className="text-xs text-steel-500 mt-6">The app starts blank and holds no sample data. Nothing leaves this computer.</p>
        </div>
      </main></div>;
  }

  const shown = checks.issues.filter((i) => (sevFilter === 'ALL' || i.severity === sevFilter) && (!ruleFilter || i.rule === ruleFilter));
  const order: Record<Severity, number> = { ERROR: 0, WARN: 1, INFO: 2 };
  const sorted = [...shown].sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <AppCtx.Provider value={ctx}>
      <div className="min-h-full flex flex-col">{header}{hidden}
        <div className="no-print">
          <section className="bg-white border-b border-steel-200 px-4 py-2" aria-label="Gap and Action Summary" data-testid="gap-panel">
            <div className="flex flex-wrap items-center gap-2">
              <b className="text-[14px]">Gap &amp; Action Summary</b><Info text="Every Data Check rule that has fired. Click an item to jump straight to the cell, asset, FPD, risk or setting to fix it." />
              {(['ERROR', 'WARN', 'INFO'] as Severity[]).map((s) => <button key={s} onClick={() => setSevFilter(sevFilter === s ? 'ALL' : s)} aria-pressed={sevFilter === s} data-testid={`sev-${s}`} className="chip" style={{ background: SEV_COL[s], opacity: sevFilter === 'ALL' || sevFilter === s ? 1 : 0.4 }}>{checks.counts[s]} {s}</button>)}
              <span className="text-xs text-steel-500">34 rules checked · {checks.issues.length} flag(s)</span>
              {notes.map((n) => <span key={n} className="text-xs text-steel-500">· {n}</span>)}
              <button className="btn-p ml-auto" data-testid="export-gaps" disabled={!checks.issues.length} onClick={() => void exportGaps()}>Export Gaps (.xlsx)</button>
              <button className="btn" data-testid="import-gaps" onClick={() => gapRef.current?.click()}>Import Filled Gaps (.xlsx)</button>
              <button className="btn" onClick={() => setGapOpen(!gapOpen)}>{gapOpen ? 'Hide list' : 'Show list'}</button>
            </div>
            {gapOpen && <ul className="mt-2 max-h-44 overflow-auto divide-y divide-steel-100 border border-steel-200 rounded" data-testid="gap-list">
              {sorted.length === 0 && <li className="p-2 text-good font-semibold">No gaps found. All 34 Data Checks are clear.</li>}
              {sorted.map((i, k) => <li key={k}><div role="button" tabIndex={0} className="w-full text-left px-2 py-1 hover:bg-amber-50 flex gap-2 items-baseline cursor-pointer" data-testid="gap-item" onClick={() => i.target && goTo(i.target)} onKeyDown={(e) => e.key === 'Enter' && i.target && goTo(i.target)}>
                <span className="chip shrink-0" style={{ background: SEV_COL[i.severity] }}>{i.severity}</span><span className="shrink-0 rounded bg-slate-100 text-slate-500 text-[10px] px-1 py-0.5 border border-slate-200" title={i.rule}>{i.rule}</span><span className="font-medium">{i.message}</span><span onClick={(e) => e.stopPropagation()}><Info text={RULES.find((r) => r.id === i.rule)?.help} term={RULES.find((r) => r.id === i.rule)?.plain} /></span>
                {i.target && <span className="ml-auto text-accent shrink-0">Go to →</span>}</div></li>)}
            </ul>}
            <details className="mt-2" data-testid="rules-table"><summary className="cursor-pointer text-xs font-semibold text-steel-700">All 34 Data Check rules{ruleFilter ? ` (filtered to ${ruleFilter})` : ''}</summary>
              <div className="max-h-56 overflow-auto border border-steel-200 rounded mt-1"><table className="w-full text-xs"><thead><tr><th className="th">#</th><th className="th">Severity</th><th className="th">Rule</th><th className="th">Where</th><th className="th">Flags</th></tr></thead><tbody>
                {RULES.map((r, i) => <tr key={r.id} className={checks.perRule[r.id] ? 'bg-amber-50' : ''}><td className="td">{i + 1}</td><td className="td"><span className="chip" style={{ background: SEV_COL[r.severity] }}>{r.severity}</span></td><td className="td"><span className="font-medium">{r.plain}</span> <Info text={r.help} term={`${r.id}: ${r.plain}`} /><div className="text-[10px] text-slate-400">{r.title}</div></td><td className="td">{r.where}</td>
                  <td className="td"><button className="underline text-accent" disabled={!checks.perRule[r.id]} onClick={() => { setRuleFilter(ruleFilter === r.id ? '' : r.id); setGapOpen(true); }}>{checks.perRule[r.id]}</button></td></tr>)}</tbody></table></div></details>
          </section>
          {summary && <section className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex flex-wrap items-center gap-x-6 gap-y-1" data-testid="import-summary" aria-label="Import summary">
            <b>Import summary</b>
            {([['Model Cells', summary.modelCells], ['Passport Cells', summary.passportCells], ['Model Assets', summary.modelAssets], ['Passport Assets', summary.passportAssets]] as const).map(([l, v]) => <span key={l}>{l}: <b data-testid={`sum-${l.replace(' ', '-')}`}>{v}</b></span>)}
            <span className="text-xs text-steel-500">{summary.cellLines} cell line(s) and {summary.assetLines} asset line(s) read from the Data tab</span>
            <button className="btn ml-auto" onClick={() => setSummary(null)}>Dismiss</button></section>}
          <nav className="bg-steel-100 border-b border-steel-200 px-4 flex gap-1 overflow-x-auto" aria-label="Workspaces">
            {WS.map((w, i) => <button key={w} onClick={() => setWs(i + 1)} aria-current={ws === i + 1} data-testid={`ws-${i + 1}`} className={`px-3 py-2 whitespace-nowrap border-b-2 ${ws === i + 1 ? 'border-accent font-bold text-accent bg-white' : 'border-transparent text-steel-700 hover:bg-steel-50'}`}>{i + 1}. {w}</button>)}
          </nav>
        </div>
        <main className="flex-1 p-4 no-print" data-testid={`workspace-${ws}`}>
          {ws === 1 && <><WsDashboard /><div className="mt-4"><WsCompare /></div></>}{ws === 2 && <WsData />}{ws === 3 && <WsFlow />}{ws === 4 && <><WsGovernance /><div className="mt-4"><WsSensitivity /></div><div className="mt-4"><SelfTestDrawer /></div></>}
        </main>
        <div aria-live="polite" className="no-print fixed bottom-4 right-4 z-50 flex flex-col gap-2" data-testid="toasts">
          {toasts.map((t) => <div key={t.id} role="status" className="rounded shadow-lg px-4 py-2 text-white text-[13px] max-w-sm" style={{ background: t.tone === 'good' ? '#047857' : t.tone === 'warn' ? '#B45309' : '#1E293B' }}>{t.msg}</div>)}</div>
        <PrintSummary />
      </div>
    </AppCtx.Provider>
  );
}
