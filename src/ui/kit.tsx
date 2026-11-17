import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useApp } from '../store';
import { normalisePct } from '../engine/calc';
import type { Band } from '../engine/calc';

export function Info({ term, text }: { term?: string; text?: string }) {
  const { help } = useApp();
  const [open, setOpen] = useState(false);
  const body = text ?? (term ? help(term) : '');
  if (!body) return null;
  return (
    <span className="relative inline-block align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label={`Help: ${term ?? 'info'}`} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className="ml-1 w-4 h-4 inline-flex items-center justify-center rounded-full border border-steel-300 text-[10px] leading-none text-steel-500 hover:bg-accent hover:text-white focus:bg-accent focus:text-white no-print" data-help={term}>ⓘ</button>
      {open && <span role="tooltip" className="absolute z-50 left-0 top-5 w-64 p-2 rounded shadow-lg bg-ink text-white text-[12px] font-normal normal-case whitespace-normal">{term && <b className="block mb-0.5">{term}</b>}{body}</span>}
    </span>
  );
}

export const Label = ({ children, term }: { children: ReactNode; term?: string }) => <span className="inline-flex items-center">{children}{term && <Info term={term} />}</span>;
export const Th = ({ children, term, className = '' }: { children: ReactNode; term?: string; className?: string }) => <th className={`th ${className}`}><Label term={term}>{children}</Label></th>;

export function Card({ title, term, children, right, id }: { title: ReactNode; term?: string; children: ReactNode; right?: ReactNode; id?: string }) {
  return <section className="card" id={id}><div className="card-h"><Label term={term}>{title}</Label><span className="ml-auto flex gap-2 items-center font-normal">{right}</span></div><div className="p-3">{children}</div></section>;
}

export const BAND_COL: Record<Band, string> = { GREEN: '#1f8a4c', AMBER: '#c98a00', RED: '#c0392b', NONE: '#8a97a5' };
export const BandChip = ({ band, children }: { band: Band; children?: ReactNode }) => <span className="chip" style={{ background: BAND_COL[band] }}>{children ?? (band === 'NONE' ? 'NO DATA' : band)}</span>;

export function NumInput({ value, onChange, pct = false, step, min, label, gap = true, w }: { value: number | null; onChange: (v: number | null) => void; pct?: boolean; step?: number; min?: number; label: string; gap?: boolean; w?: string }) {
  const show = (v: number | null) => (v === null ? '' : String(pct ? Math.round(v * 10000) / 100 : v));
  const [t, setT] = useState(show(value));
  const last = useRef(value);
  useEffect(() => { if (last.current !== value) { setT(show(value)); last.current = value; } }, [value]); // eslint-disable-line
  return <input aria-label={label} type="number" step={step ?? (pct ? 1 : 'any')} min={min} className={`inp ${gap && value === null ? 'inp-gap' : ''} ${w ?? ''}`} value={t} placeholder="gap"
    onBlur={() => setT(show(value))}
    onChange={(e) => { setT(e.target.value); const n = e.target.value.trim() === '' ? null : Number(e.target.value); const v = n === null || !Number.isFinite(n) ? null : pct ? normalisePct(n) : n; last.current = v; onChange(v); }} />;
}

export function Sel({ value, options, onChange, label, gap = true, blank = '— select —' }: { value: string; options: readonly string[]; onChange: (v: string) => void; label: string; gap?: boolean; blank?: string }) {
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  return <select aria-label={label} className={`inp ${gap && !value ? 'inp-gap' : ''}`} value={value} onChange={(e) => onChange(e.target.value)}><option value="">{blank}</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
}

export function Toggle({ on, onChange, label, onText = 'ON', offText = 'OFF', small = false }: { on: boolean; onChange: (v: boolean) => void; label: string; onText?: string; offText?: string; small?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`inline-flex items-center gap-2 px-2 ${small ? 'h-5 text-[11px]' : 'py-1 text-[12px]'} rounded border font-semibold ${on ? 'bg-good text-white border-good' : 'bg-white text-steel-700 border-steel-300'}`}>
    <span className={`w-7 h-4 rounded-full relative ${on ? 'bg-white/40' : 'bg-steel-300'}`}><span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${on ? 'left-3.5' : 'left-0.5'}`} /></span>{on ? onText : offText}</button>;
}

export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: string }) {
  return <div role="group" aria-label={label} className="inline-flex rounded border border-steel-300 overflow-hidden">{options.map((o) => <button key={String(o)} type="button" aria-pressed={o === value} onClick={() => onChange(o)} className={`px-2 py-1 text-[12px] ${o === value ? 'bg-accent text-white' : 'bg-white hover:bg-steel-100'}`}>{String(o)}</button>)}</div>;
}

export const Field = ({ label, term, children }: { label: string; term?: string; children: ReactNode }) => <label className="flex flex-col gap-0.5 text-[12px] text-steel-700"><Label term={term}>{label}</Label>{children}</label>;

/** Row that flashes and scrolls into view when it is the current focus target. */
export function useFocusRow(match: boolean) {
  const ref = useRef<HTMLTableRowElement>(null);
  useEffect(() => { if (match && ref.current) { ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' }); ref.current.classList.remove('focus-flash'); void ref.current.offsetWidth; ref.current.classList.add('focus-flash'); } }, [match]);
  return ref;
}
export const FocusRow = ({ match, children, id }: { match: boolean; children: ReactNode; id?: string }) => { const ref = useFocusRow(match); return <tr ref={ref} data-focus-id={id}>{children}</tr>; };
export const Empty = ({ children }: { children: ReactNode }) => <div className="p-6 text-center text-steel-500 border border-dashed border-steel-300 rounded">{children}</div>;
