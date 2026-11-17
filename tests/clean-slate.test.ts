import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { combinedOverview, factoryOverview } from '../src/engine/overview';
import { emptyModel } from '../src/engine/blank';
import { readCachedSession, serialise } from '../src/persist';
import { demoModel } from './fixtures/sample';

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

describe('no test or demo data ships with the app', () => {
  it('the app source holds no sample factories, cells or assets, and no demo loader', () => {
    const banned = /02_HTMF_UTAQW|04_DPF_WELDG|07_DPF_MACHN|Vacuum Furnace|Weld Robot|loadDemo|demoModel|Load Demo Workbook/;
    for (const f of walk('src')) expect(readFileSync(f, 'utf8'), f).not.toMatch(banned);
  });
  it('the built offline file contains none of the sample data either', () => {
    const html = readFileSync('dist-offline/index.html', 'utf8');
    for (const t of ['02_HTMF_UTAQW', '04_DPF_WELDG', 'Vacuum Furnace 1', 'Weld Robot 1', 'Load Demo Workbook', 'Sample programme']) expect(html.includes(t), t).toBe(false);
  });
  it('the blank model has no factories at all', () => expect(Object.keys(emptyModel().settings.plannedWeeks)).toEqual([]));
});

describe('browser cache hygiene', () => {
  it('keeps a current-schema session and discards legacy, demo and foreign caches', () => {
    const m = demoModel(); m.sourceName = 'Real project.xlsx';
    expect(readCachedSession(serialise(m))?.assets.length).toBe(m.assets.length);
    const legacy = JSON.parse(serialise(m)); delete legacy.schema; expect(readCachedSession(JSON.stringify(legacy))).toBeNull();
    const old = JSON.parse(serialise(m)); old.schema = 1; expect(readCachedSession(JSON.stringify(old))).toBeNull();
    const demo = JSON.parse(serialise(m)); demo.model.sourceName = 'Demo workbook'; expect(readCachedSession(JSON.stringify(demo))).toBeNull();
    const foreign = JSON.parse(serialise(m)); foreign.app = 'other'; expect(readCachedSession(JSON.stringify(foreign))).toBeNull();
    for (const t of [null, '', '{{{', '{}', '[]', 'null']) expect(readCachedSession(t)).toBeNull();
  });
});

describe('Overall Combined roll-up', () => {
  const m = demoModel();
  it('sums cells, machines, assets, CapEx range and footprint across factories, with one worst bottleneck', () => {
    const c = combinedOverview(m); const parts = ['HT', 'DPF'].map((f) => factoryOverview(m, f));
    expect(c.factories).toBe(2); expect(c.green + c.amber + c.red).toBe(3); expect(c.red).toBe(parts[0].red + parts[1].red);
    expect(c.machines).toBe(parts[0].machines + parts[1].machines); expect(c.assets).toBe(9);
    expect(c.likelyLow).toBeCloseTo(parts[0].likelyLow + parts[1].likelyLow, 6); expect(c.likelyHigh).toBeCloseTo(parts[0].likelyHigh + parts[1].likelyHigh, 6); expect(c.space).toBeCloseTo(parts[0].space + parts[1].space, 6);
    expect(c.bottleneck!.headroom).toBe(Math.min(...parts.map((p) => p.bottleneck!.headroom!)));
  });
  it('utilisation is the load-weighted average, not a plain mean', () => {
    const c = combinedOverview(m); const [a, b] = ['HT', 'DPF'].map((f) => factoryOverview(m, f));
    expect(c.utilisation).toBeGreaterThan(Math.min(a.utilisation!, b.utilisation!)); expect(c.utilisation).toBeLessThan(Math.max(a.utilisation!, b.utilisation!));
  });
  it('is safe on a blank model', () => { const c = combinedOverview(emptyModel()); expect(c).toMatchObject({ factories: 0, green: 0, amber: 0, red: 0, utilisation: null, bottleneck: null }); });
});
