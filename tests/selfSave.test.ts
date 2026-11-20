import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deserialise, serialise } from '../src/persist';
import { escapeForScriptTag, injectEmbeddedState, pickBootState } from '../src/selfSave';
import { demoModel } from './fixtures/sample';

const TEMPLATE = '<!doctype html><html><head><script id="embedded-master-state" type="application/json">{}</script></head><body><div id="root"></div><script>var x = 1;</script></body></html>';
const model = () => { const m = demoModel(); m.sourceName = 'Real project.xlsx'; m.programmeName = 'Alpha </script><script>alert(1)</script> <!-- x'; return m; };
const embeddedOf = (html: string) => html.match(/<script id="embedded-master-state" type="application\/json">([\s\S]*?)<\/script>/)![1];
const stamped = (m: ReturnType<typeof model>, savedAt: string) => JSON.stringify({ ...JSON.parse(serialise(m)), savedAt });

describe('Save App + Data (.html): embedding', () => {
  it('escapes every "<" so </script and <!-- can never end or confuse the script tag', () => {
    const out = escapeForScriptTag('{"a":"</script><!-- </SCRIPT>"}'); expect(out).not.toMatch(/<\/script/i); expect(out).not.toContain('<!--'); expect(JSON.parse(out).a).toBe('</script><!-- </SCRIPT>');
  });
  it('injects the workspace into the tag and the page still has exactly one real closing tag for it', () => {
    const html = injectEmbeddedState(TEMPLATE, model()); const inner = embeddedOf(html);
    expect(inner).not.toMatch(/<\/script/i); expect((html.match(/<\/script>/g) ?? []).length).toBe(2); expect(html).toContain('<script>var x = 1;</script>');
    const back = deserialise(inner); expect(back.programmeName).toBe('Alpha </script><script>alert(1)</script> <!-- x'); expect(back.assets.length).toBe(model().assets.length);
  });
  it('replacing again overwrites rather than appends, and null resets to {}', () => {
    const once = injectEmbeddedState(TEMPLATE, model()); const twice = injectEmbeddedState(once, demoModel()); expect((twice.match(/embedded-master-state/g) ?? []).length).toBe(1);
    expect(embeddedOf(injectEmbeddedState(twice, null))).toBe('{}');
  });
  it('refuses a page that has no embedded-state tag', () => { expect(() => injectEmbeddedState('<html></html>', model())).toThrow(/no embedded-master-state/); });
  it('the real offline build ships the empty tag and survives injection', () => {
    const html = readFileSync('dist-offline/index.html', 'utf8'); const saved = injectEmbeddedState(html, model());
    expect(saved.length).toBeGreaterThan(html.length); expect(saved.replace(embeddedOf(saved), '{}')).toBe(html);
  });
});

describe('Save App + Data (.html): boot loader', () => {
  const m = model(); const old = '2026-01-01T00:00:00.000Z', recent = '2026-06-01T00:00:00.000Z';
  it('a fresh machine (no cache) hydrates from the embedded state', () => { const b = pickBootState(stamped(m, old), null); expect(b.source).toBe('embedded'); expect(b.model!.assets.length).toBe(m.assets.length); });
  it('an empty {} tag falls back to the cache, then to blank', () => { expect(pickBootState('{}', stamped(m, old)).source).toBe('cache'); expect(pickBootState('{}', null)).toEqual({ model: null, source: null }); expect(pickBootState('', null).source).toBeNull(); });
  it('a browser cache with a newer timestamped edit beats the embedded state', () => { const cache = model(); cache.programmeName = 'Edited later'; const b = pickBootState(stamped(m, old), stamped(cache, recent)); expect(b.source).toBe('cache'); expect(b.model!.programmeName).toBe('Edited later'); });
  it('embedded data that is at least as new as the cache wins', () => { expect(pickBootState(stamped(m, recent), stamped(m, old)).source).toBe('embedded'); expect(pickBootState(stamped(m, recent), stamped(m, recent)).source).toBe('embedded'); });
  it('invalid, legacy or demo embedded state is ignored', () => {
    const legacy = JSON.parse(stamped(m, recent)); delete legacy.schema; const demo = JSON.parse(stamped(m, recent)); demo.model.sourceName = 'Demo workbook';
    for (const bad of ['not json', '[]', 'null', JSON.stringify(legacy), JSON.stringify(demo)]) expect(pickBootState(bad, null).source).toBeNull();
  });
});
