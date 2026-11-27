'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, FileText, Search, ShieldCheck } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { PaperCard } from '@/components/PaperCard';
import { useAuth } from '@/components/AuthProvider';
import {
  fetchArchivePreview,
  searchRagflowDocuments,
  type ArchivePreviewData,
} from '@/lib/ragflow';
import { parsePaperName } from '@/lib/paper-meta';
import { getCatalog, searchCatalog, type Catalog } from '@/lib/catalog';
import { DownloadLabel, useDownloads } from '@/components/DownloadProvider';
import { getBrowserSessionId, getVisitorId } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { Paper } from '@/lib/types';
import { useI18n, type MessageKey } from '@/lib/i18n';
import en from '@/lib/i18n/en';

const GUEST_DOWNLOAD_KEY = 'differential-quant.guest.lastDownload';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 16 }, (_, index) => CURRENT_YEAR - index);
const SEASONS: { code: 'm' | 's' | 'w'; label: MessageKey }[] = [
  { code: 'm', label: 'season.m' },
  { code: 's', label: 'season.s' },
  { code: 'w', label: 'season.w' },
];
const TYPES: { code: string; label: MessageKey }[] = [
  { code: 'qp', label: 'type.qp' },
  { code: 'ms', label: 'type.msLong' },
  { code: 'gt', label: 'type.gt' },
  { code: 'er', label: 'type.er' },
  { code: 'ci', label: 'type.ci' },
  { code: 'in', label: 'type.in' },
  { code: 'sf', label: 'type.sf' },
];

function hasKey(key: string): key is MessageKey {
  return Object.prototype.hasOwnProperty.call(en, key);
}

function renderTemplate(template: string, values: Record<string, React.ReactNode>) {
  return template.split(/(\{\w+\})/).map((part, index) => {
    const match = /^\{(\w+)\}$/.exec(part);
    if (match && match[1] in values) {
      return <React.Fragment key={index}>{values[match[1]]}</React.Fragment>;
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function guestCanDownload(): boolean {
  try {
    const now = Date.now();
    const last = Number(window.sessionStorage.getItem(GUEST_DOWNLOAD_KEY) || 0);
    if (now - last < 1000) return false;
    window.sessionStorage.setItem(GUEST_DOWNLOAD_KEY, String(now));
    return true;
  } catch {
    return true;
  }
}

export default function PapersPage() {
  const { user, loading } = useAuth();
  const { t, locale } = useI18n();
  const [preview, setPreview] = useState<ArchivePreviewData | null>(null);
  const [query, setQuery] = useState('');
  const [dataset, setDataset] = useState('All');
  const [year, setYear] = useState('All');
  const [season, setSeason] = useState('All');
  const [type, setType] = useState('All');
  const [results, setResults] = useState<Paper[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [searchSummary, setSearchSummary] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const downloads = useDownloads();
  const [searchMs, setSearchMs] = useState<number | null>(null);

  // Whole-archive catalogue: one ~56 KB download, cached; searches then run locally.
  useEffect(() => {
    let active = true;
    getCatalog().then((c) => {
      if (!active || !c) return;
      setCatalog(c);
      // The subject list and counts come from the catalogue too — no extra requests.
      setPreview((prev) => prev ?? {
        papers: [],
        datasets: c.datasets.map((d) => ({ id: d.id, name: d.name, count: d.count })),
        totalDocuments: c.entries.length,
      });
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetchArchivePreview()
      .then((data) => {
        if (active) setPreview(data);
      })
      .catch(() => {
        if (active) setPreview({ papers: [], datasets: [], totalDocuments: 0 });
      });
    return () => {
      active = false;
    };
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, Paper[]>();
    for (const paper of results ?? []) {
      const list = map.get(paper.subject);
      if (list) list.push(paper);
      else map.set(paper.subject, [paper]);
    }
    return Array.from(map.entries());
  }, [results]);

  // With the catalogue loaded, results follow the inputs live (debounced) — no button press needed.
  const liveReady = useRef(false);
  useEffect(() => {
    if (!catalog) return;
    if (!liveReady.current) {
      liveReady.current = true;
      return;
    }
    const needle = query.trim();
    const active = needle.length >= 2 || year !== 'All' || type !== 'All' || dataset !== 'All';
    if (!active) return;
    const timer = window.setTimeout(() => void search(), 180);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, query, dataset, year, season, type]);

  async function search(event?: React.FormEvent) {
    event?.preventDefault();
    const needle = query.trim();
    const hasFilters =
      needle.length >= 2 || year !== 'All' || type !== 'All' || dataset !== 'All';

    if (!hasFilters) {
      setNotice(t('papers.needFilter'));
      return;
    }
    if (season !== 'All' && year === 'All' && dataset === 'All') {
      setNotice(t('papers.seasonNeedsYear'));
      return;
    }

    setSearching(true);
    setNotice(null);
    try {
      const started = performance.now();
      const local = catalog ?? (await getCatalog());
      const filters = {
        query: needle,
        datasetId: dataset === 'All' ? undefined : dataset,
        year: year === 'All' ? null : Number(year),
        season: season === 'All' ? null : (season as 'm' | 's' | 'w'),
        type: type === 'All' ? null : type,
      };
      // Fast path: search the cached catalogue in the browser. Fallback: the old per-dataset requests.
      const matches = local ? searchCatalog(local, filters) : await searchRagflowDocuments({
        query: needle,
        datasetId: dataset === 'All' ? undefined : dataset,
        year: year === 'All' ? null : Number(year),
        season: season === 'All' ? null : (season as 'm' | 's' | 'w'),
        type: type === 'All' ? null : type,
      });
      setSearchMs(Math.round(performance.now() - started));
      setResults(matches);
      setSearchedQuery(needle || 'Filters');
      const parts = [
        dataset === 'All' ? t('papers.allSubjects') : preview?.datasets.find((item) => item.id === dataset)?.name,
        year === 'All' ? null : year,
        season === 'All' ? null : (() => { const found = SEASONS.find((item) => item.code === season); return found ? t(found.label) : null; })(),
        type === 'All' ? null : (() => { const found = TYPES.find((item) => item.code === type); return found ? t(found.label) : null; })(),
      ].filter(Boolean);
      setSearchSummary(parts.join(' · '));
      if (matches.length === 0) {
        setNotice(t('papers.noMatchNotice'));
      }
    } catch {
      setNotice(t('papers.searchFailed'));
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setResults(null);
    setQuery('');
    setDataset('All');
    setYear('All');
    setSeason('All');
    setType('All');
    setNotice(null);
  }

  async function download(paper: Paper) {
    setNotice(null);
    if (!user && !guestCanDownload()) {
      setNotice(t('papers.guestWait'));
      return;
    }

    try {
      if (!paper.ragflowDocId || !paper.ragflowDatasetId) {
        setNotice(t('papers.noFile'));
        return;
      }
      // Instant feedback + live progress in the download panel; errors are shown there too.
      const ok = await downloads.download(paper);
      if (!ok) return;

      if (supabase && user) {
        try {
          await supabase.from('downloads').insert({
            user_id: user.id,
            paper_id: paper.id,
            paper_title: paper.title,
            visitor_id: getVisitorId(),
          });
        } catch {
          /* best effort */
        }
      } else if (supabase && !user) {
        try {
          await supabase.from('download_events').insert({
            session_id: getBrowserSessionId(),
            visitor_id: getVisitorId(),
            paper_id: paper.id,
            file_name: paper.title,
            dataset: paper.subject,
          });
        } catch {
          /* best effort */
        }
      }
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : t('papers.downloadFailed'));
    } finally {
      /* progress state lives in the download manager */
    }
  }

  return (
    <div>
      <Header />
      <main className="container-page py-14 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow">{t('papers.eyebrow')}</p>
            <h1 className="mt-3 font-display text-[46px] leading-none tracking-[-0.01em] sm:text-[54px]">
              {t('papers.title')}
            </h1>
            <p className="mt-4 max-w-[600px] text-[14px] leading-relaxed text-muted">
              {t('papers.intro')}
            </p>
          </div>
          {preview ? (
            <span className="rounded-full border border-line bg-paper px-3 py-1.5 text-[11px] text-muted">
              {t('papers.badge', {
                docs: preview.totalDocuments.toLocaleString(locale),
                sets: preview.datasets.filter((item) => item.count > 0).length,
              })}
            </span>
          ) : null}
        </div>

        {!loading && !user ? (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-3 text-[13px]">
            <span className="flex items-center gap-2 text-muted">
              <ShieldCheck className="h-4 w-4 text-[#3f7d5a]" aria-hidden />
              {t('papers.guestBanner')}
            </span>
          </div>
        ) : null}

        {notice ? (
          <div className="mt-4 rounded-xl border border-line bg-paper px-4 py-3 text-[12.5px] text-muted">
            {notice}
          </div>
        ) : null}

        <form
          onSubmit={search}
          className="mt-8 rounded-2xl border border-line bg-paper p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-[22px] leading-none">{t('papers.searchTitle')}</h2>
            <span className="text-[11px] text-muted">
              {catalog ? t('papers.instantHint', { n: catalog.entries.length.toLocaleString() }) : t('papers.searchHint')}
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="input pl-10"
                placeholder={t('papers.placeholder')}
                aria-label={t('papers.searchAria')}
              />
            </div>
            <select
              value={dataset}
              onChange={(event) => setDataset(event.target.value)}
              className="input sm:w-[270px]"
              aria-label={t('papers.chooseDataset')}
            >
              <option value="All">{t('papers.allDatasets')}</option>
              {(preview?.datasets ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.count})
                </option>
              ))}
            </select>
            <button type="submit" disabled={searching} className="btn-dark px-5 py-2.5">
              {searching ? t('papers.searching') : t('papers.search')}
            </button>
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <select
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className="input"
              aria-label={t('papers.yearAria')}
            >
              <option value="All">{t('papers.allYears')}</option>
              {YEARS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              value={season}
              onChange={(event) => setSeason(event.target.value)}
              className="input"
              aria-label={t('papers.seasonAria')}
            >
              <option value="All">{t('papers.allSeasons')}</option>
              {SEASONS.map((item) => (
                <option key={item.code} value={item.code}>
                  {t(item.label)}
                </option>
              ))}
            </select>
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="input"
              aria-label={t('papers.typeAria')}
            >
              <option value="All">{t('papers.allTypes')}</option>
              {TYPES.map((item) => (
                <option key={item.code} value={item.code}>
                  {t(item.label)}
                </option>
              ))}
            </select>
          </div>

          <p className="mt-2 text-[11px] text-muted">
            {renderTemplate(t('papers.filterNote'), {
              gt: <span className="font-mono">gt</span>,
            })}
          </p>
        </form>

        {results === null ? (
          <section className="mt-10">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">{t('papers.featuredEyebrow')}</p>
                <h2 className="mt-2 font-display text-[30px] leading-none">{t('papers.featuredTitle')}</h2>
              </div>
              <span className="text-[11.5px] text-muted">
                {t('papers.useSearch')}
              </span>
            </div>

            {preview === null ? (
              <div className="mt-5 grid gap-5 md:grid-cols-3">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="h-[280px] animate-pulse rounded-2xl bg-soft/60" />
                ))}
              </div>
            ) : preview.papers.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-line px-6 py-14 text-center">
                <p className="font-display text-[22px]">{t('papers.unavailable')}</p>
                <p className="mt-2 text-[12.5px] text-muted">
                  {t('papers.unavailableHint')}
                </p>
              </div>
            ) : (
              <div className="mt-5 grid gap-5 md:grid-cols-3">
                {preview.papers.map((paper) => (
                  <PaperCard
                    key={paper.id}
                    paper={paper}
                    cta="download"
                    onDownload={() => void download(paper)}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="mt-10">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">{t('papers.resultsEyebrow')}</p>
                <h2 className="mt-2 font-display text-[30px] leading-none">
                  {searchedQuery === 'Filters' ? t('papers.filtered') : `“${searchedQuery}”`}
                </h2>
                <p className="mt-1 text-[12px] text-muted">
                  {t('papers.matches', { n: results.length })}
                  {searchSummary ? ` · ${searchSummary}` : ''}
                  {searchMs !== null && catalog ? ` · ${searchMs} ms` : ''}
                </p>
              </div>
              <button type="button" onClick={clearSearch} className="btn-light px-4 py-2">
                {t('papers.back')}
              </button>
            </div>

            {results.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-line px-6 py-14 text-center">
                <p className="font-display text-[22px]">{t('papers.noMatchTitle')}</p>
                <p className="mt-2 text-[12.5px] text-muted">
                  {t('papers.noMatchHint')}
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-8">
                {groups.map(([name, items]) => (
                  <section key={name}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
                      <h3 className="font-display text-[23px] leading-tight">{name}</h3>
                      <span className="text-[11.5px] text-muted">
                        {t('papers.docs', { n: items.length })}
                      </span>
                    </div>
                    <div className="divide-y divide-line/60">
                      {items.map((paper) => {
                        const meta = parsePaperName(paper.title);
                        const seasonKey = meta.seasonCode ? `season.${meta.seasonCode}` : '';
                        const typeKey = meta.typeCode ? `type.${meta.typeCode}` : '';
                        const metaLabel = [
                          meta.year,
                          hasKey(seasonKey) ? t(seasonKey) : meta.season,
                          hasKey(typeKey) ? t(typeKey) : meta.type,
                        ]
                          .filter(Boolean)
                          .join(' · ');
                        return (
                          <div
                            key={paper.id}
                            className="flex items-center gap-3 py-2.5 transition-colors hover:bg-paper/60"
                          >
                            <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px]" title={paper.title}>
                                {paper.title}
                              </p>
                              {metaLabel ? (
                                <p className="mt-0.5 text-[10.5px] text-muted">{metaLabel}</p>
                              ) : null}
                            </div>
                            <span className="hidden w-16 shrink-0 text-right text-[11px] text-muted sm:block">
                              {paper.size || '—'}
                            </span>
                            <button
                              type="button"
                              onClick={() => void download(paper)}
                              onPointerEnter={() => downloads.prefetch(paper)}
                              onTouchStart={() => downloads.prefetch(paper)}
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-[11.5px] text-ink transition-colors hover:bg-cream disabled:opacity-50"
                            >
                              <DownloadLabel docId={paper.ragflowDocId} idle={t('papers.download')} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="mt-14 flex flex-col items-start justify-between gap-4 rounded-2xl border border-line bg-paper px-6 py-6 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-[#3f7d5a]" aria-hidden />
            <div>
              <p className="font-display text-[20px]">{t('papers.stuckTitle')}</p>
              <p className="mt-1 text-[12.5px] text-muted">
                {t('papers.stuckBody')}
              </p>
            </div>
          </div>
          <Link href="/tutor" className="btn-dark px-5 py-2.5">
            {t('home.ask')}
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
