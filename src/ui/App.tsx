import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as XLSX from 'xlsx';
import { DICTIONARY } from '../engine/constants';
import { runChecks } from '../engine/checks';
import { demoModel } from '../engine/demo';
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
type Save = { kind: 'none' | 'saving' | 'saved' | 'error'; at?: string; msg?: string };

export function App() {
  const [model, setModel] = useState<Model | null>(null);
  const wbRef = useRef<XLSX.WorkBook | null>(null);
  const [ws, setWs] = useState(1);
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [filters, setF] = useState<ScopeFilters>({ factory: 'All', topN: 10, source: 'Both', board: 'All', sort: 'Worst first', show: 'Headroom', uplift: 'Typical' });
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(0);
  const [handle, setHandle] = useState<FsHandle | null>(null);
  const [save, setSave] = useState<Save>({ kind: 'none' });
  const [err, setErr] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [sevFilter, setSevFilter] = useState<Severity | 'ALL'>('ALL');
  const [gapOpen, setGapOpen] = useState(true);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const asOf = useMemo(() => todayIso(), []);

  const checks = useMemo(() => (model ? runChecks(model, asOf) : null), [model, asOf]);
  const dict = useMemo(() => ({ ...DICTIONARY, ...(model?.dictionary ?? {}) }), [model?.dictionary]);
  const help = useCallback((t: string) => dict[t] ?? DICTIONARY[t] ?? '', [dict]);

  const load = useCallback((m: Model, wb: XLSX.WorkBook | null, warn: string[] = []) => { wbRef.current = wb; setModel(m); setNotes(warn); setErr(''); setDirty(false); setVersion(0); setFocus(null); setWs(1); setGapOpen(true); }, []);
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
        <button className="btn" onClick={link}>Link Auto-Save (.json)</button>
        <span data-testid="save-pill" role="status" className="px-2 py-1 rounded text-xs font-semibold text-white" style={{ background: pill.c }}>{pill.t}</span>
        <button className="btn" onClick={exportX}>Export .xlsx</button>
        <button className="btn" onClick={exportD}>Export .docx</button>
        <button className="btn" onClick={() => window.print()}>Print summary</button>
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
            <button className="btn" onClick={() => load(demoModel(), null)}>Load Demo Workbook</button>
            <button className="btn" onClick={() => jsonRef.current?.click()}>Resume from auto-save (.json)</button>
          </div>
          {err && <p role="alert" className="mt-4 text-bad font-semibold">{err}</p>}
          <p className="text-xs text-steel-500 mt-6">Demo: factories HT and DPF, cells 02_HTMF_UTAQW, 04_DPF_WELDG, 07_DPF_MACHN and FPD-01 to FPD-10.</p>
        </div>
      </main></div>;
  }

  const shown = checks.issues.filter((i) => sevFilter === 'ALL' || i.severity === sevFilter);
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
