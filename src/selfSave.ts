/**
 * Self-contained "Save App + Data (.html)": the whole master workspace is written into the page's own
 * <script id="embedded-master-state" type="application/json"> tag, so one .html file carries the app and its data.
 */
import { fsSupported, pickSaveFile, readCachedSession, serialise, writeHandle } from './persist';
import type { Model } from './engine/types';

export const EMBEDDED_ID = 'embedded-master-state';
export const SELF_SAVE_NAME = 'Factory_Dashboard_Hub_Master.html';
export const SELF_SAVE_TOAST = 'Saved self-contained app + master data (.html) — ready to move or share anywhere.';
// the tag is assembled from parts so this source never contains the literal tag text itself
const TAG = new RegExp('(<script id="' + EMBEDDED_ID + '" type="application/json">)([\\s\\S]*?)(</script>)');

/** JSON that can sit inside a <script> element: every "<" (so "</script" and "<!--") is written as a backslash-u003c escape, which parses back to "<". */
export const escapeForScriptTag = (json: string): string => json.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** Puts the workspace JSON into the embedded-state tag of an HTML document string (null clears it back to {}). */
export function injectEmbeddedState(html: string, model: Model | null): string {
  if (!TAG.test(html)) throw new Error('This page has no embedded-master-state tag, so it cannot carry data. Use the offline index.html build.');
  const json = model ? escapeForScriptTag(serialise(model)) : '{}';
  return html.replace(TAG, (_all, open: string, _old: string, close: string) => open + json + close);
}

/** Raw text of the embedded-state tag in the running page ('' when absent). */
export function readEmbeddedText(doc: Document = document): string { return doc.getElementById(EMBEDDED_ID)?.textContent?.trim() ?? ''; }
export function setEmbeddedText(model: Model | null, doc: Document = document): void { const el = doc.getElementById(EMBEDDED_ID); if (el) el.textContent = model ? escapeForScriptTag(serialise(model)) : '{}'; }

const savedAtOf = (text: string): number => { try { const t = Date.parse(JSON.parse(text)?.savedAt); return Number.isFinite(t) ? t : 0; } catch { return 0; } };
export interface BootState { model: Model | null; source: 'embedded' | 'cache' | null }

/**
 * Chooses what the app opens with. Embedded data wins on a fresh machine or when it is at least as new as the browser cache;
 * a browser cache with a newer timestamped edit wins; anything unreadable, legacy or empty is ignored.
 */
export function pickBootState(embeddedText: string, cacheText: string | null): BootState {
  const embedded = embeddedText && embeddedText !== '{}' ? readCachedSession(embeddedText) : null;
  const cached = readCachedSession(cacheText);
  if (embedded && (!cached || savedAtOf(embeddedText) >= savedAtOf(cacheText ?? ''))) return { model: embedded, source: 'embedded' };
  if (cached) return { model: cached, source: 'cache' };
  return { model: embedded, source: embedded ? 'embedded' : null };
}

/** Snapshot of the current page as a standalone HTML document with the workspace embedded (UI reset to the loading placeholder). */
export function currentPageWithData(model: Model, placeholderHtml: string): string {
  const copy = document.documentElement.cloneNode(true) as HTMLElement;
  const root = copy.querySelector('#root'); if (root) root.innerHTML = placeholderHtml;
  copy.querySelector('#boot-error')?.remove();
  return injectEmbeddedState('<!doctype html>\n' + copy.outerHTML, model);
}

/** Saves via the File System Access API (shared folder id) or an <a download> fallback. Returns false when the user cancels. */
export async function saveHtml(html: string, download: (name: string, data: BlobPart, type: string) => void): Promise<boolean> {
  if (!fsSupported()) { download(SELF_SAVE_NAME, html, 'text/html'); return true; }
  try {
    const h = await pickSaveFile(SELF_SAVE_NAME, 'Self-Contained HTML App', { 'text/html': ['.html'] });
    if (h === null) return false;
    await writeHandle(h, html);
    return true;
  } catch (e) { if ((e as Error).name === 'AbortError') return false; throw e; }
}
