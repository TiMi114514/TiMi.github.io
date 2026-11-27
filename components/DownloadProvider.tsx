'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, Loader2, X, XCircle } from 'lucide-react';
import { cancelPaper, downloadPaper, formatProgress, prefetchPaper, type DownloadProgress } from '@/lib/paper-download';

type Job = { key: string; datasetId: string; docId: string; name: string; progress: DownloadProgress; error?: string; startedAt: number };

type Ctx = {
  /** Start a download; feedback appears immediately in the bottom-right panel. Resolves true on success. */
  download: (paper: { ragflowDatasetId?: string; ragflowDocId?: string; title: string }) => Promise<boolean>;
  progressOf: (docId?: string) => DownloadProgress | null;
  prefetch: (paper: { ragflowDatasetId?: string; ragflowDocId?: string }) => void;
};

const DownloadCtx = createContext<Ctx>({
  download: async () => false,
  progressOf: () => null,
  prefetch: () => undefined,
});

export function useDownloads() {
  return useContext(DownloadCtx);
}

/** Download manager: instant feedback, live progress, cancel, and a small queue panel. */
export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const timers = useRef(new Map<string, number>());

  const update = useCallback((key: string, patch: Partial<Job>) => {
    setJobs((list) => list.map((j) => (j.key === key ? { ...j, ...patch } : j)));
  }, []);

  const dismissLater = useCallback((key: string, ms: number) => {
    window.clearTimeout(timers.current.get(key));
    timers.current.set(key, window.setTimeout(() => setJobs((list) => list.filter((j) => j.key !== key)), ms));
  }, []);

  const download = useCallback<Ctx['download']>(async (paper) => {
    if (!paper.ragflowDatasetId || !paper.ragflowDocId) return false;
    const key = paper.ragflowDocId;
    const name = paper.title.replace(/[\\/:*?"<>|]/g, '-');
    window.clearTimeout(timers.current.get(key));
    setJobs((list): Job[] => [
      { key, datasetId: paper.ragflowDatasetId!, docId: paper.ragflowDocId!, name, progress: { loaded: 0, total: null, phase: 'connecting' as const }, startedAt: Date.now() },
      ...list.filter((j) => j.key !== key),
    ].slice(0, 4));
    try {
      await downloadPaper(paper.ragflowDatasetId, paper.ragflowDocId, name, (progress) => update(key, { progress }));
      update(key, { progress: { loaded: 1, total: 1, phase: 'done' } });
      dismissLater(key, 3500);
      return true;
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === 'AbortError';
      update(key, {
        progress: { loaded: 0, total: null, phase: cancelled ? 'cancelled' : 'error' },
        error: cancelled ? '已取消' : error instanceof Error ? error.message : '下载失败',
      });
      dismissLater(key, cancelled ? 1500 : 8000);
      return false;
    }
  }, [update, dismissLater]);

  const value = useMemo<Ctx>(() => ({
    download,
    progressOf: (docId) => jobs.find((j) => j.docId === docId)?.progress ?? null,
    prefetch: (paper) => prefetchPaper(paper.ragflowDatasetId, paper.ragflowDocId),
  }), [download, jobs]);

  return (
    <DownloadCtx.Provider value={value}>
      {children}
      {jobs.length ? (
        <div className="fixed bottom-4 right-4 z-[90] w-[min(340px,calc(100vw-2rem))] space-y-2" aria-live="polite">
          {jobs.map((job) => {
            const p = job.progress;
            const pct = p.total ? Math.min(100, (p.loaded / p.total) * 100) : p.phase === 'done' ? 100 : null;
            const slow = p.phase === 'connecting' && Date.now() - job.startedAt > 3000;
            return (
              <div key={job.key} className="rounded-2xl border border-line bg-paper px-4 py-3 shadow-float">
                <div className="flex items-start gap-2.5">
                  {p.phase === 'done' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#3f7d5a]" aria-hidden />
                  ) : p.phase === 'error' || p.phase === 'cancelled' ? (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#8a3b2a]" aria-hidden />
                  ) : (
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium">{job.name}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted">
                      {job.error ?? (p.phase === 'done' ? '下载完成，已保存到浏览器的下载目录' : slow ? '正在连接资料库，首次连接需几秒…' : formatProgress(p))}
                    </p>
                  </div>
                  {p.phase === 'connecting' || p.phase === 'downloading' ? (
                    <button type="button" onClick={() => cancelPaper(job.datasetId, job.docId)} className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-cream hover:text-ink" aria-label="取消下载">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                {p.phase === 'connecting' || p.phase === 'downloading' ? (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-soft">
                    {pct === null ? (
                      <div className="h-full w-1/3 animate-[dlslide_1.2s_ease-in-out_infinite] rounded-full bg-ink/60" />
                    ) : (
                      <div className="h-full rounded-full bg-ink/70 transition-[width] duration-300" style={{ width: `${Math.max(4, pct)}%` }} />
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </DownloadCtx.Provider>
  );
}

/** Small inline label for a button while its file downloads. */
export function DownloadLabel({ docId, idle }: { docId?: string; idle: string }) {
  const { progressOf } = useDownloads();
  const p = progressOf(docId);
  if (!p || p.phase === 'done' || p.phase === 'error' || p.phase === 'cancelled') {
    return (
      <>
        <Download className="h-3.5 w-3.5" aria-hidden /> {idle}
      </>
    );
  }
  return (
    <>
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      {p.total ? `${Math.min(99, Math.floor((p.loaded / p.total) * 100))}%` : '连接中'}
    </>
  );
}
