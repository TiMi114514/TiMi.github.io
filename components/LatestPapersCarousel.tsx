'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { downloadRagflowDocument, fetchLatestSeries, getRagflowConfig, type LatestSeries } from '@/lib/ragflow';
import { parsePaperName } from '@/lib/paper-meta';
import { getBrowserSessionId, getVisitorId } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useI18n, type MessageKey } from '@/lib/i18n';
import type { Paper } from '@/lib/types';

const AUTOPLAY_MS = 4500;

/**
 * Horizontal, auto-scrolling strip of the newest exam series in the archive
 * (currently 2026 May/June). Pauses on hover / focus / touch, respects
 * prefers-reduced-motion, and can be scrolled by hand or with the arrows.
 */
export function LatestPapersCarousel() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [data, setData] = useState<LatestSeries | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const track = useRef<HTMLDivElement | null>(null);
  const paused = useRef(false);

  useEffect(() => {
    let alive = true;
    fetchLatestSeries(300).then((result) => {
      if (!alive) return;
      if (!result) return setData(result);
      // Interleave subjects (round-robin) so the strip is not one dataset after another.
      const bySubject = new Map<string, Paper[]>();
      for (const paper of result.papers) {
        const list = bySubject.get(paper.subject) ?? [];
        list.push(paper);
        bySubject.set(paper.subject, list);
      }
      const queues = [...bySubject.values()];
      const mixed: Paper[] = [];
      while (mixed.length < 24 && queues.some((q) => q.length)) {
        for (const q of queues) {
          const next = q.shift();
          if (next) mixed.push(next);
          if (mixed.length === 24) break;
        }
      }
      setData({ ...result, papers: mixed });
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!data?.papers.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      const el = track.current;
      if (!el || paused.current || document.visibilityState !== 'visible') return;
      const card = el.querySelector<HTMLElement>('[data-card]');
      const step = card ? card.offsetWidth + 20 : el.clientWidth * 0.8;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
      el.scrollTo({ left: atEnd ? 0 : el.scrollLeft + step, behavior: 'smooth' });
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [data]);

  function scrollBy(direction: 1 | -1) {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('[data-card]');
    el.scrollBy({ left: direction * (card ? card.offsetWidth + 20 : el.clientWidth * 0.8), behavior: 'smooth' });
  }

  async function download(paper: Paper) {
    if (!paper.ragflowDatasetId || !paper.ragflowDocId) return;
    setBusy(paper.id);
    setError(null);
    try {
      await downloadRagflowDocument(getRagflowConfig(), paper.ragflowDatasetId, paper.ragflowDocId, paper.title.replace(/[\\/:*?"<>|]/g, '-'));
      if (supabase) {
        const row = user
          ? supabase.from('downloads').insert({ user_id: user.id, paper_id: paper.id, paper_title: paper.title, visitor_id: getVisitorId() })
          : supabase.from('download_events').insert({ session_id: getBrowserSessionId(), visitor_id: getVisitorId(), paper_id: paper.id, file_name: paper.title, dataset: paper.subject });
        void row.then(() => undefined, () => undefined);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('papers.downloadFailed'));
    } finally {
      setBusy(null);
    }
  }

  const seriesLabel = data ? `${t(`latest.series.${data.season}` as MessageKey)} ${data.year}` : '';

  return (
    <section className="border-t border-line/60">
      <div className="container-page py-16 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow">{t('home.archiveEyebrow')}</p>
            <h2 className="mt-3 font-display text-[38px] leading-none tracking-[-0.01em] sm:text-[44px]">
              {data ? t('latest.title', { series: seriesLabel }) : t('home.recent')}
            </h2>
            {data ? (
              <p className="mt-3 text-[13px] text-muted">{t('latest.subtitle', { n: data.total.toLocaleString() })}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {data?.papers.length ? (
              <>
                <button type="button" onClick={() => scrollBy(-1)} className="grid h-9 w-9 place-items-center rounded-full border border-line bg-paper text-muted transition-colors hover:text-ink" aria-label={t('latest.prev')}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => scrollBy(1)} className="grid h-9 w-9 place-items-center rounded-full border border-line bg-paper text-muted transition-colors hover:text-ink" aria-label={t('latest.next')}>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            ) : null}
            <Link href="/papers" className="ml-2 hidden items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink sm:flex">
              {t('home.allPapers')} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>

        {data === undefined ? (
          <div className="mt-10 flex gap-5 overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[220px] w-[300px] shrink-0 animate-pulse rounded-2xl bg-soft/60" />
            ))}
          </div>
        ) : data === null ? (
          <div className="mt-10 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
            <p className="font-display text-[20px]">{t('papers.unavailable')}</p>
            <Link href="/papers" className="btn-light mt-4 px-4 py-2">
              {t('home.allPapers')}
            </Link>
          </div>
        ) : (
          <div
            ref={track}
            onMouseEnter={() => (paused.current = true)}
            onMouseLeave={() => (paused.current = false)}
            onFocus={() => (paused.current = true)}
            onBlur={() => (paused.current = false)}
            onTouchStart={() => (paused.current = true)}
            className="scroll-slim mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-3"
            aria-roledescription="carousel"
            aria-label={t('latest.title', { series: seriesLabel })}
          >
            {data.papers.map((paper) => {
              const meta = parsePaperName(paper.title);
              const typeKey = meta.typeCode ? (`type.${meta.typeCode}` as MessageKey) : null;
              return (
                <article
                  key={paper.id}
                  data-card
                  className="flex w-[280px] shrink-0 snap-start flex-col rounded-2xl border border-line bg-paper p-5 shadow-card sm:w-[300px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate rounded-full border border-line bg-soft/70 px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
                      {paper.subject.replace(/^A-Level\s+/i, '')}
                    </span>
                    <span className="shrink-0 text-[12px] text-muted">{seriesLabel}</span>
                  </div>
                  <h3 className="mt-4 break-all font-display text-[21px] leading-[1.15]">{paper.title}</h3>
                  <p className="mt-1.5 text-[12.5px] text-muted">
                    {[typeKey ? t(typeKey) : meta.type, meta.paper ? t('type.paper', { n: meta.paper }) : null].filter(Boolean).join(' · ')}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                    <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
                      <FileText className="h-3.5 w-3.5" aria-hidden /> {paper.size || 'PDF'}
                    </span>
                    <button
                      type="button"
                      onClick={() => void download(paper)}
                      disabled={busy === paper.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-[12px] text-ink transition-colors hover:bg-cream disabled:opacity-50"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden />
                      {busy === paper.id ? t('card.preparing') : t('papers.download')}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {error ? <p className="mt-3 text-[12px] text-[#8a3b2a]">{error}</p> : null}
      </div>
    </section>
  );
}
