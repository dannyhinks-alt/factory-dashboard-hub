import type { Model } from './engine/types';

// Minimal File System Access API typings (not in lib.dom for all TS versions)
export interface FsHandle { name: string; createWritable: () => Promise<{ write: (d: string | Blob) => Promise<void>; close: () => Promise<void> }> }
type PickerWindow = Window & { showSaveFilePicker?: (o: unknown) => Promise<FsHandle> };

export const fsSupported = () => typeof window !== 'undefined' && typeof (window as PickerWindow).showSaveFilePicker === 'function';
export const serialise = (m: Model) => JSON.stringify({ app: 'factory-dashboard-flow-hub', version: 1, savedAt: new Date().toISOString(), model: m }, null, 1);
export function deserialise(text: string): Model {
  const j = JSON.parse(text); const m = (j.model ?? j) as Model;
  if (!m || !Array.isArray(m.assets) || !m.settings) throw new Error('Not a Factory Dashboard & Flow Hub save file.');
  return m;
}
export async function pickSaveFile(suggested: string): Promise<FsHandle> {
  return (window as PickerWindow).showSaveFilePicker!({ suggestedName: suggested, types: [{ description: 'Hub auto-save (.json)', accept: { 'application/json': ['.json'] } }] });
}
export async function writeHandle(h: FsHandle, text: string) { const w = await h.createWritable(); await w.write(text); await w.close(); }
export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
