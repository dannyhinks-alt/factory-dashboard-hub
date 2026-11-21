import type { ReactNode } from 'react';
import { BAND_COL, BasisPill } from './kit';
import type { FlowResult } from '../engine/flow';
import { axisUnit, wipAt } from '../engine/flow';
import { band } from '../engine/calc';

export const PALETTE = ['#0b5cab', '#c2410c', '#1f8a4c', '#7c3aed', '#b45309', '#0e7490', '#be185d', '#4d7c0f', '#475569', '#a21caf'];
const W = 640;
const Legend = ({ items }: { items: { name: string; color: string }[] }) => <div className="flex flex-wrap gap-2 text-[11px] mt-1" data-testid="legend">{items.map((i) => <span key={i.name} className="rounded-full px-2 py-0.5 font-semibold text-white" style={{ background: i.color }}>{i.name}</span>)}</div>;
const Svg = ({ h, children, label }: { h: number; children: ReactNode; label: string }) => <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${h}`} className="w-full h-auto max-w-[900px]">{children}</svg>;

const NAME_W = 165; // fixed cell-name column: never shares space with bars or negative labels
const GUTTER = 58; // reserved space left of the 0% axis for negative value labels
const ROW = 34;
const NoData = () => <span className="inline-block rounded-full px-2 text-[12px] leading-5" style={{ background: '#E2E8F0', color: '#94a3b8' }}>no data</span>;
const Name = ({ text, sub }: { text: string; sub?: ReactNode }) => <div className="shrink-0 text-[13px] text-slate-800 min-w-0" style={{ width: NAME_W, flexShrink: 0 }} title={text}><div className="truncate leading-[16px]">{text}</div>{sub && <div className="flex items-center gap-1 leading-[16px] text-[11px] text-slate-500 whitespace-nowrap">{sub}</div>}</div>;
const Empty = () => <div className="text-slate-500 p-4 text-[13px]">No data to chart.</div>;

/** Horizontal grouped bars on a shared axis. Plain HTML/CSS rows, so type and bars never scale with screen width. */
export function HBars({ rows, series, label, fmt = (v: number) => `${(v * 100).toFixed(0)}%`, marker, bandColour = false, zero = true }: {
  rows: { label: string; sub?: ReactNode; values: (number | null)[] }[]; series: { name: string; color: string }[]; label: string; fmt?: (v: number) => string; marker?: (rowIdx: number) => number | null; bandColour?: boolean; zero?: boolean }) {
  const vals = rows.flatMap((r) => r.values).filter((v): v is number => v !== null);
  const marks = rows.map((_, i) => marker?.(i) ?? null).filter((v): v is number => v !== null);
  if (!rows.length) return <Empty />;
  const all = [...vals, ...marks, zero ? 0 : vals[0] ?? 0]; const lo = Math.min(...all, 0), hi = Math.max(...all, 0.0001), range = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / range) * 100; const bh = series.length === 1 ? 14 : series.length === 2 ? 12 : 9;
  return <div role="img" aria-label={label}>
    {rows.map((r, i) => <div key={`${i}-${r.label}`} className="flex items-center" style={{ height: ROW }}>
      <Name text={r.label} sub={r.sub} />
      <div className="relative flex-1" style={{ height: ROW, marginLeft: GUTTER, paddingRight: 48 }}><div className="relative" style={{ height: ROW }}>
        <div className="absolute top-0 bottom-0" style={{ left: `${pos(0)}%`, width: 1, background: '#94a3b8' }} />
        {r.values.every((v) => v === null) && <div className="absolute" style={{ left: `${pos(0)}%`, top: 6, marginLeft: 6 }}><NoData /></div>}
        {r.values.map((v, j) => v === null ? null : <div key={j} className="absolute" style={{ top: (ROW - (bh * series.length + 2 * (series.length - 1))) / 2 + j * (bh + 2), height: bh, left: `${pos(Math.min(0, v))}%`, width: `${Math.abs(v) / range * 100}%`, background: bandColour && series.length === 1 ? BAND_COL[band(v)] : series[j].color, borderRadius: 2 }} title={`${r.label} · ${series[j].name}: ${fmt(v)}`}>
          <span className="absolute text-[12px] leading-none whitespace-nowrap tabular-nums" style={{ top: Math.max(0, (bh - 12) / 2), ...(v >= 0 ? { left: '100%', marginLeft: 4 } : { right: '100%', marginRight: 4 }) }}>{bh >= 12 ? fmt(v) : ''}</span></div>)}
        {marker && marker(i) !== null && <div className="absolute" style={{ left: `${pos(marker(i)!)}%`, top: 3, bottom: 3, width: 2, background: '#0F172A' }} title="Class limit" />}
      </div></div></div>)}
    <Legend items={[...series, ...(marker ? [{ name: 'Class limit', color: '#0F172A' }] : [])]} /></div>;
}

export function StackedH({ rows, parts, label, unit = '', pctMode = false }: { rows: { label: string; v: number[] }[]; parts: { name: string; color: string }[]; label: string; unit?: string; pctMode?: boolean }) {
  const tot = rows.map((r) => r.v.reduce((a, b) => a + b, 0)); const mx = pctMode ? 1 : Math.max(...tot, 1);
  if (!rows.length || tot.every((t) => t === 0)) return <Empty />;
  return <div role="img" aria-label={label}>
    {rows.map((r, i) => { const t = tot[i] || 1; return <div key={`${i}-${r.label}`} className="flex items-center" style={{ height: ROW }}>
      <Name text={r.label} />
      <div className="flex-1 flex items-center" style={{ marginLeft: 8 }}>
        <div className="flex h-[18px] rounded-sm overflow-hidden" style={{ width: `${((pctMode ? 1 : tot[i] / mx)) * 100}%` }}>
          {r.v.map((v, j) => <div key={j} style={{ width: `${(v / t) * 100}%`, background: parts[j].color }} title={`${r.label} · ${parts[j].name}: ${Math.round(v).toLocaleString('en-GB')}${unit} (${((v / t) * 100).toFixed(0)}%)`} />)}</div>
        <span className="ml-2 text-[12px] tabular-nums text-slate-700 whitespace-nowrap">{Math.round(tot[i]).toLocaleString('en-GB')}{unit}</span></div></div>; })}
    <Legend items={parts} /></div>;
}

export function VBars({ data, label, color = '#0B5CAB', fmt = (v: number) => v.toFixed(1), unit = '' }: { data: { label: string; value: number }[]; label: string; color?: string; fmt?: (v: number) => string; unit?: string }) {
  const mx = Math.max(...data.map((d) => d.value), 0.0001);
  if (!data.length) return <Empty />;
  return <div role="img" aria-label={label}>{data.map((d, i) => <div key={`${i}-${d.label}`} className="flex items-center" style={{ height: ROW }}>
    <Name text={d.label} /><div className="flex-1 flex items-center" style={{ marginLeft: 8 }}>
      <div style={{ width: `${(Math.max(0, d.value) / mx) * 100}%`, height: 16, background: color, borderRadius: 2 }} title={`${d.label}: ${fmt(d.value)}${unit}`} />
      <span className="ml-2 text-[12px] tabular-nums whitespace-nowrap">{fmt(d.value)}{unit}</span></div></div>)}</div>;
}

export function Histogram({ values, p10, p50, p90, label }: { values: number[]; p10: number; p50: number; p90: number; label: string }) {
  if (!values.length) return <Empty />;
  const lo = values[0], hi = values[values.length - 1], bins = 24, cnt = Array<number>(bins).fill(0);
  values.forEach((v) => { cnt[Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo || 1)) * bins))]++; });
  const mx = Math.max(...cnt); const at = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  return <div role="img" aria-label={label} className="max-w-[760px]"><div className="relative flex items-end gap-[2px]" style={{ height: 140 }}>
    {cnt.map((c, i) => <div key={i} className="flex-1" style={{ height: `${(c / mx) * 100}%`, background: '#0B5CAB', opacity: 0.75 }} title={`${c} runs`} />)}
    {([[p10, 'P10', '#059669'], [p50, 'P50', '#0F172A'], [p90, 'P90', '#E11D48']] as const).map(([v, t, c]) => <div key={t} className="absolute top-0 bottom-0" style={{ left: `${at(v)}%`, width: 2, background: c }}><span className="absolute -bottom-5 -translate-x-1/2 text-[12px] whitespace-nowrap" style={{ color: c }}>{t} {Math.round(v)}d</span></div>)}
  </div><div className="h-6" /></div>;
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
    <svg role="img" aria-label="Gantt and stacked WIP chart" viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-w-[1000px] touch-none select-none" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e); }} onPointerMove={(e) => e.buttons && pick(e)}>
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
export function DivergingBars({ rows, label }: { rows: { label: string; value: number | null; tag: string; passport?: boolean }[]; label: string }) {
  const vals = rows.map((r) => r.value).filter((v): v is number => v !== null);
  if (!vals.length) return <Empty />;
  const ext = Math.max(0.1, ...vals.map((v) => Math.abs(v)));
  return <div role="img" aria-label={label}>
    <div className="flex text-[12px] text-slate-500" style={{ paddingLeft: NAME_W }}><span style={{ marginLeft: GUTTER }} className="text-rose-600">← overloaded</span><span className="flex-1 text-center">0%</span><span className="text-emerald-600" style={{ marginRight: 250 }}>spare headroom →</span></div>
    {rows.map((r, i) => <div key={`${i}-${r.label}`} className="flex items-center" style={{ height: ROW }}>
      <Name text={r.label} />
      <div className="relative flex-1" style={{ height: ROW, marginLeft: GUTTER, marginRight: 8 }}>
        <div className="absolute inset-y-0 left-0 w-1/2" style={{ background: '#FFF1F2' }} /><div className="absolute inset-y-0 right-0 w-1/2" style={{ background: '#ECFDF5' }} />
        <div className="absolute inset-y-0" style={{ left: '50%', width: 1, background: '#0F172A' }} />
        {r.value === null ? <div className="absolute" style={{ left: '50%', top: 6, marginLeft: 6 }}><NoData /></div> :
          <div className="absolute" style={{ top: 8, height: 18, left: r.value < 0 ? `${50 - (Math.min(ext, -r.value) / ext) * 50}%` : '50%', width: `${(Math.min(ext, Math.abs(r.value)) / ext) * 50}%`, background: r.value < 0 ? '#E11D48' : '#059669', borderRadius: 2 }} title={`${r.label}: ${(r.value * 100).toFixed(1)}%`}>
            <span className="absolute text-[12px] leading-[18px] font-semibold whitespace-nowrap tabular-nums" style={r.value < 0 ? { right: '100%', marginRight: 4 } : { left: '100%', marginLeft: 4 }}>{(r.value * 100).toFixed(1)}%</span></div>}
      </div>
      <div className="shrink-0 flex items-center gap-1 text-[12px] text-slate-600 min-w-0" style={{ width: 250 }}><BasisPill passport={!!r.passport} /><span className="truncate" title={r.tag}>{r.tag}</span></div></div>)}</div>;
}

/** Utilisation vs Complexity Class Limit chart: bars coloured red when over limit, inline context label, formula tooltip. */
export function UtilBars({ rows, label }: {
  rows: { assetLabel: string; cellLabel: ReactNode; effUtil: number | null; limit: number | null }[];
  label: string;
}) {
  if (!rows.length) return <div className="text-slate-500 p-4 text-[13px]">No data to chart.</div>;
  const vals = rows.map((r) => r.effUtil ?? 0); const limits = rows.map((r) => r.limit ?? 0);
  const hi = Math.max(...vals, ...limits, 0.0001); const range = hi;
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const BH = 14;
  return <div role="img" aria-label={label}>
    {rows.map((r, i) => {
      const util = r.effUtil; const lim = r.limit; if (util === null) return null;
      const overLimit = lim !== null && util > lim;
      const headroom = lim !== null ? (lim - util) / lim : null;
      const barW = `${(util / range) * 100}%`;
      const limX = lim !== null ? `${(lim / range) * 100}%` : null;
      const tooltip = lim !== null
        ? `${pct(util)} utilisation / ${pct(lim)} limit · ${headroom !== null ? (headroom >= 0 ? '+' : '') + pct(headroom) : '–'} headroom\nFormula: Required Load ÷ OEE-Adjusted Available Hours = Effective Utilisation\nHeadroom = (Limit − Utilisation) ÷ Limit`
        : `${pct(util)} utilisation (no limit set)`;
      const barColor = overLimit ? '#dc2626' : '#0B5CAB';
      return <div key={`${i}-${r.assetLabel}`} className="flex items-center" style={{ height: ROW }}>
        <Name text={r.assetLabel} sub={r.cellLabel} />
        <div className="relative flex-1" style={{ height: ROW, marginLeft: 8, paddingRight: 48 }}>
          <div className="relative" style={{ height: ROW }}>
            <div className="absolute" style={{ left: 0, top: (ROW - BH) / 2, height: BH, width: barW, background: barColor, borderRadius: 2 }} title={tooltip} />
            {limX && <div className="absolute" style={{ left: limX, top: 3, bottom: 3, width: 2, background: '#0F172A' }} title={`Complexity class limit: ${pct(lim!)}`} />}
            <span className="absolute text-[11px] tabular-nums whitespace-nowrap font-mono" style={{ top: (ROW - 11) / 2, left: barW, marginLeft: 6 }}>
              {pct(util)}{lim !== null ? ` / ${pct(lim)} limit · ` : ' · '}
              <span style={{ color: overLimit ? '#dc2626' : headroom !== null && headroom < 0.1 ? '#D97706' : '#059669' }}>
                {headroom !== null ? (headroom >= 0 ? '+' : '') + pct(headroom) + ' headroom' : '–'}
              </span>
            </span>
          </div></div></div>; })}
    <Legend items={[{ name: 'Effective utilisation (within limit)', color: '#0B5CAB' }, { name: 'Over limit', color: '#dc2626' }, { name: 'Class limit', color: '#0F172A' }]} /></div>;
}

export function Ring({ value, size = 84, label }: { value: number | null; size?: number; label: string }) {
  const r = size / 2 - 8, c = 2 * Math.PI * r, v = value === null ? 0 : Math.min(1, Math.max(0, value));
  const col = value === null ? '#94A3B8' : value > 1 ? '#E11D48' : value > 0.85 ? '#D97706' : '#059669';
  return <svg role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={8} />
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize="15" fontWeight={700} fill="#0F172A">{value === null ? '–' : `${Math.round(value * 100)}%`}</text></svg>;
}
