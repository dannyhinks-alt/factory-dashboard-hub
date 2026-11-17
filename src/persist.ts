import { normaliseModel } from './engine/normalise';
import type { Model } from './engine/types';

// Minimal File System Access API typings (not in lib.dom for all TS versions)
export interface FsHandle { name: string; createWritable: () => Promise<{ write: (d: string | Blob) => Promise<void>; close: () => Promise<void> }> }
type PickerWindow = Window & { showSaveFilePicker?: (o: unknown) => Promise<FsHandle> };

export const fsSupported = () => typeof window !== 'undefined' && typeof (window as PickerWindow).showSaveFilePicker === 'function';
export const CACHE_SCHEMA = 2;
export const serialise = (m: Model) => JSON.stringify({ app: 'factory-dashboard-flow-hub', version: 1, schema: CACHE_SCHEMA, savedAt: new Date().toISOString(), model: m }, null, 1);
export function deserialise(text: string): Model {
  const j = JSON.parse(text); const m = j?.model ?? j;
  if (!m || typeof m !== 'object' || (!Array.isArray(m.assets) && !m.settings)) throw new Error('Not a Factory Dashboard & Flow Hub save file.');
  return normaliseModel(m); // older or partial saves are rebuilt onto the current shape
}
/** Strict check for the browser cache: anything from an older build, a demo session or another app is discarded. */
export function readCachedSession(text: string | null): Model | null {
  if (!text) return null;
  try {
    const j = JSON.parse(text);
    if (j?.app !== 'factory-dashboard-flow-hub' || j?.schema !== CACHE_SCHEMA || !j?.model || /^demo workbook$/i.test(String(j.model.sourceName ?? ''))) return null;
    return normaliseModel(j.model);
  } catch { return null; }
}
export async function pickSaveFile(suggested: string): Promise<FsHandle> {
  return (window as PickerWindow).showSaveFilePicker!({ suggestedName: suggested, types: [{ description: 'Hub auto-save (.json)', accept: { 'application/json': ['.json'] } }] });
}
export async function writeHandle(h: FsHandle, text: string) { const w = await h.createWritable(); await w.write(text); await w.close(); }
export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
