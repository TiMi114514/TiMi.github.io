/**
 * Past-paper downloads with visible progress.
 *
 * PDFs come from the home PC through Tailscale Funnel (~25 KB/s, ~2 s before the
 * first byte), so a 250 KB paper takes ~7 s. Instead of a silent "Preparing…" we:
 *   - show feedback the instant the button is pressed (no waiting for the network),
 *   - stream the body and report real progress (bytes / total / %),
 *   - keep finished files in memory so a second click is instant,
 *   - start fetching on hover / touch so the click often finds it already loading,
 *   - allow cancelling.
 */
import { getRagflowConfig } from './ragflow';

export type DownloadProgress = { loaded: number; total: number | null; phase: 'connecting' | 'downloading' | 'done' | 'error' | 'cancelled' };

type Entry = { blob?: Blob; promise?: Promise<Blob>; controller?: AbortController; listeners: Set<(p: DownloadProgress) => void>; last: DownloadProgress };

const MAX_CACHE_BYTES = 40 * 1024 * 1024;
const cache = new Map<string, Entry>();

function keyOf(datasetId: string, docId: string) {
  return `${datasetId}/${docId}`;
}

function evict() {
  let total = 0;
  const done = [...cache.entries()].filter(([, e]) => e.blob);
  for (const [, e] of done) total += e.blob!.size;
  for (const [k, e] of done) {
    if (total <= MAX_CACHE_BYTES) break;
    total -= e.blob!.size;
    cache.delete(k);
  }
}

function emit(entry: Entry, p: DownloadProgress) {
  entry.last = p;
  for (const fn of entry.listeners) fn(p);
}

function start(datasetId: string, docId: string): Entry {
  const key = keyOf(datasetId, docId);
  const existing = cache.get(key);
  if (existing && (existing.blob || existing.promise)) return existing;

  const entry: Entry = existing ?? { listeners: new Set(), last: { loaded: 0, total: null, phase: 'connecting' } };
  const controller = new AbortController();
  entry.controller = controller;
  cache.set(key, entry);
  emit(entry, { loaded: 0, total: null, phase: 'connecting' });

  const cfg = getRagflowConfig();
  const url = `${cfg.baseUrl}/api/v1/datasets/${encodeURIComponent(datasetId)}/documents/${encodeURIComponent(docId)}`;
  entry.promise = (async () => {
    // Signed-in students send their token so the gateway limits them per account
    // (a whole school can share one IP).
    let headers: Record<string, string> = {};
    try {
      const { supabase } = await import('./supabase');
      const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
      if (token) headers = { Authorization: `Bearer ${token}` };
    } catch {
      /* guest */
    }
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) {
      let message = `下载失败（${res.status}）`;
      try {
        const j = (await res.json()) as { message?: string };
        if (j.message) message = res.status === 429 ? '下载太频繁，请稍后再试' : j.message;
      } catch {
        /* not JSON */
      }
      throw new Error(message);
    }
    const total = Number(res.headers.get('content-length')) || null;
    if (!res.body) {
      const blob = await res.blob();
      emit(entry, { loaded: blob.size, total: blob.size, phase: 'done' });
      return blob;
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    emit(entry, { loaded, total, phase: 'downloading' });
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      emit(entry, { loaded, total, phase: 'downloading' });
    }
    const blob = new Blob(chunks as BlobPart[], { type: res.headers.get('content-type') || 'application/pdf' });
    emit(entry, { loaded, total: total ?? loaded, phase: 'done' });
    return blob;
  })();

  entry.promise.then(
    (blob) => {
      entry.blob = blob;
      entry.promise = undefined;
      evict();
    },
    (error: unknown) => {
      cache.delete(key);
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      emit(entry, { ...entry.last, phase: aborted ? 'cancelled' : 'error' });
    },
  );
  return entry;
}

/** Begin fetching in the background (hover / touchstart). Harmless if repeated. */
export function prefetchPaper(datasetId?: string, docId?: string): void {
  if (!datasetId || !docId) return;
  start(datasetId, docId);
}

export function cancelPaper(datasetId: string, docId: string): void {
  cache.get(keyOf(datasetId, docId))?.controller?.abort();
}

export function isPaperReady(datasetId?: string, docId?: string): boolean {
  return !!(datasetId && docId && cache.get(keyOf(datasetId, docId))?.blob);
}

/** Download with progress; resolves once the browser has been handed the file. */
export async function downloadPaper(
  datasetId: string,
  docId: string,
  filename: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  const entry = start(datasetId, docId);
  if (onProgress) {
    entry.listeners.add(onProgress);
    onProgress(entry.last);
  }
  try {
    const blob = entry.blob ?? (await entry.promise!);
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename || 'paper.pdf';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    onProgress?.({ loaded: blob.size, total: blob.size, phase: 'done' });
  } finally {
    if (onProgress) entry.listeners.delete(onProgress);
  }
}

export function formatProgress(p: DownloadProgress | null | undefined): string {
  if (!p || p.phase === 'connecting') return '连接中…';
  if (p.phase === 'done') return '已完成';
  const kb = Math.round(p.loaded / 1024);
  if (p.total) return `${Math.min(99, Math.floor((p.loaded / p.total) * 100))}% · ${kb} / ${Math.round(p.total / 1024)} KB`;
  return `${kb} KB`;
}
