import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as XLSX from 'xlsx';
import { DICTIONARY } from '../engine/constants';
import { RULES, runChecks } from '../engine/checks';
import { demoModel, emptyModel } from '../engine/demo';
import { todayIso } from '../engine/governance';
import { exportWorkbook, readWorkbook } from '../engine/xlsx';
import type { FocusTarget, Model, ScopeFilters, Severity } from '../engine/types';
import { UPLIFTS } from '../engine/constants';
import { AppCtx } from '../store';
import { buildDocx } from '../docxExport';
import { deserialise, download, fsSupported, pickSaveFile, serialise, writeHandle } from '../persist';
import type { FsHandle } from '../persist';
import { Info } from './kit';
import { WsDashboard } from './WsDashboard';
import { WsData } from './WsData';
import { WsCompare } from './WsCompare';
import { WsFlow } from './WsFlow';
import { WsSensitivity } from './WsSensitivity';
import { WsGovernance } from './WsGovernance';
import { PrintSummary } from './PrintSummary';

const WS = ['Executive Dashboard', 'Factory Data & Settings', 'Model vs Passport', 'Flow View', 'Sensitivity & Levers', 'Gates, Register & Self-Test'];
const SEV_COL: Record<Severity, string> = { ERROR: '#c0392b', WARN: '#c98a00', INFO: '#0b5cab' };
const SESSION_KEY = 'factory-hub.session.v1';
const DEFAULT_FILTERS: ScopeFilters = { factory: 'All', topN: 10, source: 'Both', board: 'All', sort: 'Worst first', show: 'Headroom', uplift: 'Typical' };
const readSession = (): Model | null => { try { const t = localStorage.getItem(SESSION_KEY); return t ? deserialise(t) : null; } catch { return null; } };
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
  const [notes, setNotes] = useState<string[]>([]);
  const [sevFilter, setSevFilter] = useState<Severity | 'ALL'>('ALL');
  const [ruleFilter, setRuleFilter] = useState('');
  const [gapOpen, setGapOpen] = useState(true);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const asOf = useMemo(() => todayIso(), []);

  const checks = useMemo(() => (model ? runChecks(model, asOf) : null), [model, asOf]);
  const dict = useMemo(() => ({ ...DICTIONARY, ...(model?.dictionary ?? {}) }), [model?.dictionary]);
  const help = useCallback((t: string) => dict[t] ?? DICTIONARY[t] ?? '', [dict]);

  /** Atomic replace: every piece of previous state (model, workbook, filters, links, cache) is discarded before the new model is installed. */
  const load = useCallback((m: Model, wb: XLSX.WorkBook | null, warn: string[] = []) => {
    writeSession(null); wbRef.current = wb; setHandle(null); setSave({ kind: 'none' }); setF(DEFAULT_FILTERS); setSevFilter('ALL'); setRuleFilter('');
    setModel(structuredClone(m)); setNotes(warn); setErr(''); setDirty(false); setVersion(0); setFocus(null); setWs(1); setGapOpen(true); writeSession(m);
  }, []);
  const clearAll = () => {
    if (!window.confirm('Clear ALL data? This wipes the loaded workbook, the saved session in this browser and any unsaved edits, and returns to a blank start. It cannot be undone.')) return;
    writeSession(null); wbRef.current = null; setHandle(null); setSave({ kind: 'none' }); setF(DEFAULT_FILTERS); setSevFilter('ALL'); setRuleFilter('');
    setModel(null); setNotes([]); setErr(''); setDirty(false); setVersion(0); setFocus(null); setWs(1);
  };
  const loadDemo = () => { if (model && !window.confirm('Loading the demo workbook will REPLACE all data currently loaded. Continue?')) return; load(demoModel(), null); };
  useEffect(() => { if (model) writeSession(model); }, [model]);
  const edit = useCallback((fn: (d: Model) => void) => { setModel((cur) => { if (!cur) return cur; const d = structuredClone(cur); fn(d); return d; }); setDirty(true); setVersion((v) => v + 1); }, []);

  const openXlsx = async (file: File) => {
    try { const r = readWorkbook(await file.arrayBuffer(), file.name); load(r.model, r.wb, r.warnings); }
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
  const ctx = useMemo(() => model && checks ? { model, edit, checks, filters, setFilters: (p: Partial<ScopeFilters>) => setF((f) => ({ ...f, ...p })), focus, goTo, help, asOf } : null, [model, edit, checks, filters, focus, goTo, help, asOf]);

  const pill = !handle ? (dirty ? { t: 'Unsaved changes · not linked', c: '#c98a00' } : { t: 'No auto-save linked', c: '#5d6b79' })
    : save.kind === 'saving' || dirty ? { t: save.kind === 'saving' ? 'Saving…' : 'Unsaved changes', c: '#c98a00' } : save.kind === 'error' ? { t: `Save failed: ${save.msg}`, c: '#c0392b' } : { t: `Saved ${save.at ?? ''}`, c: '#1f8a4c' };

  const header = (
    <header className="no-print bg-steel-900 text-white px-4 py-2 flex flex-wrap items-center gap-2">
      <div className="font-bold text-[15px] mr-2">Factory Dashboard &amp; Flow Hub <span className="font-normal text-steel-300 text-xs">V1 · offline</span></div>
      {model && <span className="text-xs text-steel-300 mr-auto" data-testid="source-name">{model.sourceName}</span>}
      {!model && <span className="mr-auto" />}
      {model && <>
        <button className="btn" onClick={() => fileRef.current?.click()}>Open .xlsx</button>
        <button className="btn" onClick={loadDemo}>Load Demo Workbook</button>
        <button className="btn" onClick={link}>Link Auto-Save (.json)</button>
        <span data-testid="save-pill" role="status" className="px-2 py-1 rounded text-xs font-semibold text-white" style={{ background: pill.c }}>{pill.t}</span>
        <button className="btn" onClick={exportX}>Export .xlsx</button>
        <button className="btn" onClick={exportD}>Export .docx</button>
        <button className="btn" onClick={() => window.print()}>Print summary</button>
        <button className="px-3 py-1.5 rounded border border-red-300 bg-red-700 text-white font-semibold hover:bg-red-800 text-[13px]" data-testid="clear-all" onClick={clearAll}>Clear All Data</button>
      </>}
    </header>
  );
  const hidden = <><input ref={fileRef} type="file" accept=".xlsx,.xlsm" hidden data-testid="xlsx-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void openXlsx(f); e.target.value = ''; }} />
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
            <button className="btn" onClick={loadDemo}>Load Demo Workbook</button>
            <button className="btn" onClick={() => jsonRef.current?.click()}>Resume from auto-save (.json)</button>
          </div>
          {err && <p role="alert" className="mt-4 text-bad font-semibold">{err}</p>}
          <p className="text-xs text-steel-500 mt-6">The app starts blank. The demo workbook is optional and only loads when you click its button.</p>
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
              <button className="btn ml-auto" onClick={() => setGapOpen(!gapOpen)}>{gapOpen ? 'Hide list' : 'Show list'}</button>
            </div>
            {gapOpen && <ul className="mt-2 max-h-44 overflow-auto divide-y divide-steel-100 border border-steel-200 rounded" data-testid="gap-list">
              {sorted.length === 0 && <li className="p-2 text-good font-semibold">No gaps found. All 34 Data Checks are clear.</li>}
              {sorted.map((i, k) => <li key={k}><button className="w-full text-left px-2 py-1 hover:bg-amber-50 flex gap-2 items-baseline" data-testid="gap-item" onClick={() => i.target && goTo(i.target)}>
                <span className="chip shrink-0" style={{ background: SEV_COL[i.severity] }}>{i.severity}</span><span className="text-steel-500 shrink-0 w-10">{i.rule}</span><span>{i.message}</span>
                {i.target && <span className="ml-auto text-accent shrink-0">Go to → WS{i.target.ws}</span>}</button></li>)}
            </ul>}
            <details className="mt-2" data-testid="rules-table"><summary className="cursor-pointer text-xs font-semibold text-steel-700">All 34 Data Check rules{ruleFilter ? ` (filtered to ${ruleFilter})` : ''}</summary>
              <div className="max-h-56 overflow-auto border border-steel-200 rounded mt-1"><table className="w-full text-xs"><thead><tr><th className="th">#</th><th className="th">Severity</th><th className="th">Rule</th><th className="th">Where</th><th className="th">Flags</th></tr></thead><tbody>
                {RULES.map((r, i) => <tr key={r.id} className={checks.perRule[r.id] ? 'bg-amber-50' : ''}><td className="td">{i + 1}</td><td className="td"><span className="chip" style={{ background: SEV_COL[r.severity] }}>{r.severity}</span></td><td className="td">{r.title}</td><td className="td">{r.where}</td>
                  <td className="td"><button className="underline text-accent" disabled={!checks.perRule[r.id]} onClick={() => { setRuleFilter(ruleFilter === r.id ? '' : r.id); setGapOpen(true); }}>{checks.perRule[r.id]}</button></td></tr>)}</tbody></table></div></details>
          </section>
          <nav className="bg-steel-100 border-b border-steel-200 px-4 flex gap-1 overflow-x-auto" aria-label="Workspaces">
            {WS.map((w, i) => <button key={w} onClick={() => setWs(i + 1)} aria-current={ws === i + 1} data-testid={`ws-${i + 1}`} className={`px-3 py-2 whitespace-nowrap border-b-2 ${ws === i + 1 ? 'border-accent font-bold text-accent bg-white' : 'border-transparent text-steel-700 hover:bg-steel-50'}`}>{i + 1}. {w}</button>)}
          </nav>
        </div>
        <main className="flex-1 p-4 no-print" data-testid={`workspace-${ws}`}>
          {ws === 1 && <WsDashboard />}{ws === 2 && <WsData />}{ws === 3 && <WsCompare />}{ws === 4 && <WsFlow />}{ws === 5 && <WsSensitivity />}{ws === 6 && <WsGovernance />}
        </main>
        <PrintSummary />
      </div>
    </AppCtx.Provider>
  );
}
