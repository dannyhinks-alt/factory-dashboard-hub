import { normaliseModel } from './engine/normalise';
import type { Model } from './engine/types';

// Minimal File System Access API typings (not in lib.dom for all TS versions)
export interface FsHandle { name: string; createWritable: () => Promise<{ write: (d: string | ArrayBuffer | ArrayBufferView | Blob) => Promise<void>; close: () => Promise<void> }> }
interface FsFileHandle { getFile: () => Promise<File> }
type FsPickerWindow = Window & {
  showSaveFilePicker?: (o: unknown) => Promise<FsHandle>;
  showOpenFilePicker?: (o: unknown) => Promise<FsFileHandle[]>;
};

export const FOLDER_ID = 'factory-hub-app-folder';
let _lastHandle: object | undefined = undefined; // FileSystemHandle — not in lib.dom for all TS versions

export const fsSupported = () => typeof window !== 'undefined' && typeof (window as FsPickerWindow).showSaveFilePicker === 'function';
export const fsOpenSupported = () => typeof window !== 'undefined' && typeof (window as FsPickerWindow).showOpenFilePicker === 'function';
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

/** Opens a file picker for reading; returns the selected File, or null when the API is unavailable or the user cancels. */
export async function pickOpenFile(description: string, accept: Record<string, string[]>): Promise<File | null> {
  const w = window as FsPickerWindow;
  if (typeof w.showOpenFilePicker !== 'function') return null;
  try {
    const [fh] = await w.showOpenFilePicker!({ id: FOLDER_ID, startIn: _lastHandle ?? 'desktop', multiple: false, types: [{ description, accept }] });
    _lastHandle = fh as object;
    return await fh.getFile();
  } catch (e) { if ((e as Error).name === 'AbortError') return null; throw e; }
}

/** Opens a file picker for saving; returns the handle, or null when the API is unavailable. Throws AbortError when the user cancels. */
export async function pickSaveFile(suggested: string, description: string, accept: Record<string, string[]>): Promise<FsHandle | null> {
  const w = window as FsPickerWindow;
  if (typeof w.showSaveFilePicker !== 'function') return null;
  const h = await w.showSaveFilePicker!({ suggestedName: suggested, id: FOLDER_ID, startIn: _lastHandle ?? 'desktop', types: [{ description, accept }] });
  _lastHandle = h as object;
  return h;
}

export async function writeHandle(h: FsHandle, data: string | ArrayBuffer | ArrayBufferView | Blob) { const w = await h.createWritable(); await w.write(data); await w.close(); }
export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
