import type { ReactNode } from 'react';
import { BAND_COL } from './kit';
import type { FlowResult } from '../engine/flow';
import { axisUnit, wipAt } from '../engine/flow';
import { band } from '../engine/calc';

export const PALETTE = ['#0b5cab', '#c2410c', '#1f8a4c', '#7c3aed', '#b45309', '#0e7490', '#be185d', '#4d7c0f', '#475569', '#a21caf'];
const W = 640;
const Legend = ({ items }: { items: { name: string; color: string }[] }) => <div className="flex flex-wrap gap-3 text-[11px] text-steel-700 mt-1">{items.map((i) => <span key={i.name} className="inline-flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-sm" style={{ background: i.color }} />{i.name}</span>)}</div>;
const Svg = ({ h, children, label }: { h: number; children: ReactNode; label: string }) => <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${h}`} className="w-full h-auto">{children}</svg>;

/** Horizontal grouped bars; values are fractions shown as %. Colours may follow RAG bands for single series. */
export function HBars({ rows, series, label, fmt = (v: number) => `${(v * 100).toFixed(0)}%`, marker, bandColour = false, zero = true }: {
  rows: { label: string; values: (number | null)[] }[]; series: { name: string; color: string }[]; label: string; fmt?: (v: number) => string; marker?: (rowIdx: number) => number | null; bandColour?: boolean; zero?: boolean }) {
  const vals = rows.flatMap((r) => r.values).filter((v): v is number => v !== null);
  const marks = rows.map((_, i) => marker?.(i) ?? null).filter((v): v is number => v !== null);
  const all = [...vals, ...marks, zero ? 0 : vals[0] ?? 0];
  const lo = Math.min(...all, 0), hi = Math.max(...all, 0.0001), L = 150, R = W - 40, sc = (v: number) => L + ((v - lo) / (hi - lo || 1)) * (R - L);
  const bh = 14, gap = 8, rh = series.length * bh + gap, H = rows.length * rh + 28;
  if (!rows.length) return <div className="text-steel-500 p-4">No data to chart.</div>;
  return <div><Svg h={H} label={label}>
    <line x1={sc(0)} x2={sc(0)} y1={0} y2={H - 20} stroke="#8a97a5" />
    {rows.map((r, i) => <g key={r.label} transform={`translate(0,${i * rh + 4})`}>
      <text x={L - 6} y={(series.length * bh) / 2 + 4} textAnchor="end" fontSize="11" fill="#34414e">{r.label.length > 22 ? r.label.slice(0, 21) + '…' : r.label}</text>
      {r.values.map((v, j) => v === null ? <text key={j} x={sc(0) + 4} y={j * bh + 11} fontSize="10" fill="#8a97a5">no data</text> :
        <g key={j}><rect x={Math.min(sc(0), sc(v))} y={j * bh} width={Math.abs(sc(v) - sc(0))} height={bh - 2} fill={bandColour && series.length === 1 ? BAND_COL[band(v)] : series[j].color} rx={1}><title>{`${r.label} · ${series[j].name}: ${fmt(v)}`}</title></rect>
          <text x={v >= 0 ? sc(v) + 3 : sc(v) - 3} y={j * bh + 11} fontSize="10" textAnchor={v >= 0 ? 'start' : 'end'} fill="#1b2430">{fmt(v)}</text></g>)}
      {marker && marker(i) !== null && <g><line x1={sc(marker(i)!)} x2={sc(marker(i)!)} y1={-2} y2={series.length * bh} stroke="#1b2430" strokeWidth={2} strokeDasharray="3 2" /></g>}
    </g>)}
  </Svg><Legend items={[...series, ...(marker ? [{ name: 'Class limit', color: '#1b2430' }] : [])]} /></div>;
}

export function StackedH({ rows, parts, label, unit = '', pctMode = false }: { rows: { label: string; v: number[] }[]; parts: { name: string; color: string }[]; label: string; unit?: string; pctMode?: boolean }) {
  const tot = rows.map((r) => r.v.reduce((a, b) => a + b, 0)); const mx = pctMode ? 1 : Math.max(...tot, 1);
  const L = 110, R = W - 50, bh = 22, H = rows.length * (bh + 10) + 10;
  if (!rows.length || tot.every((t) => t === 0)) return <div className="text-steel-500 p-4">No data to chart.</div>;
  return <div><Svg h={H} label={label}>{rows.map((r, i) => { let x = L; const t = tot[i] || 1; return <g key={r.label} transform={`translate(0,${i * (bh + 10) + 4})`}>
    <text x={L - 6} y={bh / 2 + 4} textAnchor="end" fontSize="11" fill="#34414e">{r.label}</text>
    {r.v.map((v, j) => { const w = ((pctMode ? v / t : v) / mx) * (R - L); const el = <rect key={j} x={x} y={0} width={Math.max(0, w)} height={bh} fill={parts[j].color}><title>{`${r.label} · ${parts[j].name}: ${Math.round(v).toLocaleString('en-GB')}${unit} (${((v / t) * 100).toFixed(0)}%)`}</title></rect>; x += w; return el; })}
    <text x={x + 4} y={bh / 2 + 4} fontSize="10" fill="#1b2430">{Math.round(tot[i]).toLocaleString('en-GB')}{unit}</text></g>; })}</Svg><Legend items={parts} /></div>;
}

export function VBars({ data, label, color = '#0b5cab', fmt = (v: number) => v.toFixed(1), unit = '' }: { data: { label: string; value: number }[]; label: string; color?: string; fmt?: (v: number) => string; unit?: string }) {
  const L = 120, R = W - 50, mx = Math.max(...data.map((d) => d.value), 0.0001), bh = 16, H = data.length * (bh + 6) + 6;
  if (!data.length) return <div className="text-steel-500 p-4">No data to chart.</div>;
  return <Svg h={H} label={label}>{data.map((d, i) => <g key={d.label} transform={`translate(0,${i * (bh + 6) + 3})`}><text x={L - 6} y={12} textAnchor="end" fontSize="11" fill="#34414e">{d.label}</text>
    <rect x={L} width={(Math.max(0, d.value) / mx) * (R - L)} height={bh} fill={color}><title>{`${d.label}: ${fmt(d.value)}${unit}`}</title></rect><text x={L + (Math.max(0, d.value) / mx) * (R - L) + 4} y={12} fontSize="10">{fmt(d.value)}{unit}</text></g>)}</Svg>;
}

export function Histogram({ values, p10, p50, p90, label }: { values: number[]; p10: number; p50: number; p90: number; label: string }) {
  if (!values.length) return <div className="text-steel-500 p-4">Run needs FPD data.</div>;
  const lo = values[0], hi = values[values.length - 1], bins = 24, cnt = Array(bins).fill(0);
  values.forEach((v) => { cnt[Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo || 1)) * bins))]++; });
  const mx = Math.max(...cnt), L = 30, R = W - 20, H = 160, bw = (R - L) / bins, x = (v: number) => L + ((v - lo) / (hi - lo || 1)) * (R - L);
  return <Svg h={H + 24} label={label}>{cnt.map((c, i) => <rect key={i} x={L + i * bw + 1} y={H - (c / mx) * (H - 14)} width={bw - 2} height={(c / mx) * (H - 14)} fill="#0b5cab" opacity={0.75}><title>{`${c} runs`}</title></rect>)}
    {[[p10, 'P10', '#1f8a4c'], [p50, 'P50', '#1b2430'], [p90, 'P90', '#c0392b']].map(([v, t, c]) => <g key={t as string}><line x1={x(v as number)} x2={x(v as number)} y1={4} y2={H} stroke={c as string} strokeWidth={2} /><text x={x(v as number)} y={H + 14} textAnchor="middle" fontSize="10" fill={c as string}>{t as string} {Math.round(v as number)}d</text></g>)}</Svg>;
}

export function GanttWip({ flow, cursor, onCursor, names }: { flow: FlowResult; cursor: number; onCursor: (t: number) => void; names: Record<string, string> }) {
  const ids = Object.keys(flow.sched); const end = Math.max(flow.endDay, 1); const ax = axisUnit(end);
  const L = 70, R = W - 15, rh = 18, top = 22, gH = ids.length * rh, wipH = 90, H = top + gH + 40 + wipH + 24;
  const x = (t: number) => L + (t / end) * (R - L);
  const ticks: number[] = []; for (let t = 0; t <= end; t += ax.size * Math.max(1, Math.ceil(end / ax.size / 12))) ticks.push(t);
  const crit = new Set(flow.chain);
  // stacked WIP sampled
  const S = 80; const samples = Array.from({ length: S + 1 }, (_, i) => (i / S) * end); const stacks = samples.map((t) => wipAt(flow, t));
  const maxW = Math.max(...stacks.map((s) => s.reduce((a, b) => a + b.wip, 0)), 0.0001); const wy = top + gH + 40;
  const cur = wipAt(flow, cursor);
  const pick = (e: React.PointerEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; onCursor(Math.min(end, Math.max(0, ((px - L) / (R - L)) * end))); };
  return <div>
    <svg role="img" aria-label="Gantt and stacked WIP chart" viewBox={`0 0 ${W} ${H}`} className="w-full h-auto touch-none select-none" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e); }} onPointerMove={(e) => e.buttons && pick(e)}>
      {ticks.map((t) => <g key={t}><line x1={x(t)} x2={x(t)} y1={top - 4} y2={top + gH} stroke="#e7ebef" /><text x={x(t)} y={12} fontSize="10" textAnchor="middle" fill="#5d6b79">{ax.unit === 'days' ? Math.round(t) : ax.unit === 'weeks' ? `W${Math.round(t / 7)}` : ax.unit === 'months' ? `M${Math.round(t / 30.4)}` : `Y${(t / 365).toFixed(1)}`}</text></g>)}
      {ids.map((id, i) => { const s = flow.sched[id]; const c = crit.has(id); return <g key={id}><text x={L - 4} y={top + i * rh + 12} textAnchor="end" fontSize="10" fill={c ? '#c0392b' : '#34414e'} fontWeight={c ? 700 : 400}>{id}</text>
        <rect x={x(s.start)} y={top + i * rh + 2} width={Math.max(1.5, x(s.end) - x(s.start))} height={rh - 5} rx={2} fill={c ? '#c0392b' : PALETTE[i % PALETTE.length]} opacity={0.85}><title>{`${id} ${names[id] ?? ''}: day ${s.start.toFixed(1)} to ${s.end.toFixed(1)}`}</title></rect></g>; })}
      <text x={L} y={wy - 8} fontSize="11" fontWeight={600} fill="#34414e">Stacked WIP (units in process, Little's Law)</text>
      {ids.map((id, k) => { const pts = stacks.map((s, si) => { const below = s.slice(0, k).reduce((a, b) => a + b.wip, 0), v = s[k].wip; return [x(samples[si]), wy + wipH - ((below + v) / maxW) * wipH, wy + wipH - (below / maxW) * wipH]; });
        const d = `M${pts.map((p) => `${p[0]},${p[1]}`).join('L')}L${[...pts].reverse().map((p) => `${p[0]},${p[2]}`).join('L')}Z`; return <path key={id} d={d} fill={PALETTE[k % PALETTE.length]} opacity={0.8}><title>{id}</title></path>; })}
      <line x1={L} x2={R} y1={wy + wipH} y2={wy + wipH} stroke="#8a97a5" />
      <text x={L - 4} y={wy + 8} textAnchor="end" fontSize="10">{maxW.toFixed(1)}</text>
      <g data-testid="cursor"><line x1={x(cursor)} x2={x(cursor)} y1={top - 6} y2={wy + wipH} stroke="#1b2430" strokeWidth={2} /><circle cx={x(cursor)} cy={top - 6} r={5} fill="#1b2430" style={{ cursor: 'ew-resize' }} />
        <text x={Math.min(R - 60, x(cursor) + 6)} y={wy + wipH + 16} fontSize="11" fontWeight={600}>day {cursor.toFixed(0)} · WIP {cur.reduce((a, b) => a + b.wip, 0).toFixed(2)}</text></g>
    </svg></div>;
}

export function FlowMap({ flow, links, names }: { flow: FlowResult; links: { parent: string; child: string }[]; names: Record<string, string> }) {
  const ids = Object.keys(flow.sched); const level: Record<string, number> = {}; ids.forEach((i) => (level[i] = 0));
  for (let p = 0; p < ids.length + 1; p++) links.forEach((l) => { if (level[l.parent] !== undefined && level[l.child] !== undefined && l.parent !== l.child && level[l.child] <= level[l.parent] && level[l.parent] < ids.length) level[l.child] = level[l.parent] + 1; });
  const cols = Math.max(0, ...Object.values(level)) + 1; const byLevel: string[][] = Array.from({ length: cols }, () => []); ids.forEach((i) => byLevel[level[i]].push(i));
  const rows = Math.max(1, ...byLevel.map((b) => b.length)); const cw = (W - 20) / cols, rh = 46, H = rows * rh + 20;
  const pos = (id: string) => { const c = level[id], r = byLevel[c].indexOf(id); const off = (rows - byLevel[c].length) / 2; return { x: 10 + c * cw + cw / 2, y: 14 + (r + off) * rh + 16 }; };
  const crit = new Set(flow.chain); const critEdge = (l: { parent: string; child: string }) => flow.sched[l.child]?.driver === l.parent && crit.has(l.child) && crit.has(l.parent);
  return <Svg h={H} label="Flow map of FPD dependencies"><defs><marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0L8,4L0,8Z" fill="#5d6b79" /></marker><marker id="arrc" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0L8,4L0,8Z" fill="#c0392b" /></marker></defs>
    {links.filter((l) => flow.sched[l.parent] && flow.sched[l.child]).map((l, i) => { const a = pos(l.parent), b = pos(l.child), c = critEdge(l); return <line key={i} x1={a.x + 26} y1={a.y} x2={b.x - 28} y2={b.y} stroke={c ? '#c0392b' : '#8a97a5'} strokeWidth={c ? 2.5 : 1.2} markerEnd={`url(#${c ? 'arrc' : 'arr'})`} />; })}
    {ids.map((id) => { const p = pos(id), c = crit.has(id); return <g key={id}><rect x={p.x - 28} y={p.y - 14} width={56} height={28} rx={4} fill={c ? '#c0392b' : '#fff'} stroke={c ? '#c0392b' : '#5d6b79'} /><text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight={600} fill={c ? '#fff' : '#1b2430'}>{id}<title>{names[id]}</title></text></g>; })}</Svg>;
}

/** Diverging bars centred on 0%: overloaded cells extend left (rose), spare headroom extends right (emerald). */
export function DivergingBars({ rows, label }: { rows: { label: string; value: number | null; tag: string }[]; label: string }) {
  const vals = rows.map((r) => r.value).filter((v): v is number => v !== null);
  if (!vals.length) return <div className="text-steel-500 p-4">No data to chart.</div>;
  const ext = Math.max(0.1, ...vals.map((v) => Math.abs(v))), L = 170, R = W - 120, mid = (L + R) / 2, half = (R - L) / 2, bh = 20, H = rows.length * (bh + 14) + 30;
  const x = (v: number) => mid + (Math.max(-ext, Math.min(ext, v)) / ext) * half;
  return <Svg h={H} label={label}>
    <rect x={L} y={0} width={mid - L} height={H - 22} fill="#FFF1F2" /><rect x={mid} y={0} width={R - mid} height={H - 22} fill="#ECFDF5" />
    <line x1={mid} x2={mid} y1={0} y2={H - 22} stroke="#0F172A" strokeWidth={1.5} /><text x={mid} y={H - 6} textAnchor="middle" fontSize="10" fill="#0F172A">0%</text>
    <text x={L + 4} y={H - 6} fontSize="10" fill="#E11D48">← overloaded</text><text x={R - 4} y={H - 6} textAnchor="end" fontSize="10" fill="#059669">spare headroom →</text>
    {rows.map((r, i) => <g key={r.label} transform={`translate(0,${i * (bh + 14) + 6})`}>
      <text x={L - 8} y={bh / 2 + 4} textAnchor="end" fontSize="11" fill="#1E293B">{r.label.length > 24 ? r.label.slice(0, 23) + '…' : r.label}</text>
      {r.value === null ? <text x={mid + 6} y={bh / 2 + 4} fontSize="10" fill="#64748B">no data</text> : <>
        <rect x={Math.min(mid, x(r.value))} width={Math.abs(x(r.value) - mid)} height={bh} rx={2} fill={r.value < 0 ? '#E11D48' : '#059669'}><title>{`${r.label}: ${(r.value * 100).toFixed(1)}%`}</title></rect>
        <text x={r.value < 0 ? x(r.value) - 4 : x(r.value) + 4} y={bh / 2 + 4} textAnchor={r.value < 0 ? 'end' : 'start'} fontSize="10" fontWeight={600} fill="#0F172A">{(r.value * 100).toFixed(1)}%</text></>}
      <text x={R + 8} y={bh / 2 + 4} fontSize="10" fill="#475569">{r.tag}</text></g>)}
  </Svg>;
}

export function Ring({ value, size = 84, label }: { value: number | null; size?: number; label: string }) {
  const r = size / 2 - 8, c = 2 * Math.PI * r, v = value === null ? 0 : Math.min(1, Math.max(0, value));
  const col = value === null ? '#94A3B8' : value > 1 ? '#E11D48' : value > 0.85 ? '#D97706' : '#059669';
  return <svg role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={8} />
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize="15" fontWeight={700} fill="#0F172A">{value === null ? '–' : `${Math.round(value * 100)}%`}</text></svg>;
}
