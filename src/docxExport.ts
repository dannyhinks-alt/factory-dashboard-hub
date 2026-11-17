import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { calendarHours, cells, costByFactory, gbp, n1, pct } from './engine/calc';
import type { CheckResult } from './engine/checks';
import { solve } from './engine/flow';
import { allGates } from './engine/governance';
import { UPLIFTS } from './engine/constants';
import { fiveLines, verdictOf } from './engine/story';
import type { Model, ScopeFilters } from './engine/types';

const cell = (t: string, bold = false) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t, bold, size: 18 })] })] });
const tbl = (head: string[], rows: string[][]) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, children: head.map((h) => cell(h, true)) }), ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) }))] });
const H = (t: string) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 100 } });

export async function buildDocx(m: Model, f: ScopeFilters, checks: CheckResult): Promise<Blob> {
  const cs = cells(m, 'model'); const verdict = verdictOf(cs, checks.counts.ERROR); const flow = solve(m, UPLIFTS[f.uplift] ?? 0);
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ text: 'Factory Dashboard & Flow Hub: Summary', heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `Source: ${m.sourceName}. Verdict: ${verdict}.`, bold: true })], alignment: AlignmentType.LEFT }),
    H('The story in five lines'), ...fiveLines(m, f, checks.counts.ERROR).map((l, i) => new Paragraph({ text: `${i + 1}. ${l}` })),
    H('Cell headroom board'), tbl(['Factory', 'Cell', 'Headroom', 'Band', 'Bottleneck'], cs.map((c) => [c.factory, c.cell, pct(c.headroom), c.band, c.bottleneck?.asset.asset ?? '–'])),
    H('Cost and space by factory'), tbl(['Factory', 'Extra machines', 'Cost', 'Worst case', 'Likely range', 'Space (m²)'], costByFactory(m).map((r) => [r.factory, String(r.add), gbp(r.cost), gbp(r.worstCost), `${gbp(r.likelyLow)} to ${gbp(r.likelyHigh)}`, n1(r.space, 0)])),
    H('Calendar hours'), tbl(['Factory', 'Not scheduled', 'OEE loss', 'Load', 'Free'], calendarHours(m).map((r) => [r.factory, n1(r.notScheduled, 0), n1(r.oeeLoss, 0), n1(r.load, 0), n1(r.free, 0)])),
    H('Flow view'), new Paragraph(`Programme length ${n1(flow.endDay, 0)} days (${f.uplift}). Critical chain: ${flow.chain.join(' ← ') || 'n/a'}.`),
    H('Gate assessor'), tbl(['Gate', 'Met', 'Partial', 'Not met', 'Evidence', 'Status'], allGates(m).map((g) => [g.gate, String(g.met), String(g.partial), String(g.notMet), `${g.evidence}/6`, g.label])),
    H(`Data checks: ${checks.counts.ERROR} ERROR, ${checks.counts.WARN} WARN, ${checks.counts.INFO} INFO`), tbl(['Rule', 'Severity', 'Detail'], checks.issues.slice(0, 80).map((i) => [i.rule, i.severity, i.message])),
  ] }] });
  return Packer.toBlob(doc);
}
