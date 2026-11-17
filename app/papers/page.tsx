'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { downloadRagflowDocument, getRagflowConfig } from '@/lib/ragflow';
import { getBrowserSessionId } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { Paper } from '@/lib/types';

const GUEST_DOWNLOAD_KEY = 'differential-quant.guest.lastDownload';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 16 }, (_, index) => CURRENT_YEAR - index);
const SEASONS = [
  { code: 'm', label: 'March' },
  { code: 's', label: 'June' },
  { code: 'w', label: 'November' },
] as const;
const TYPES = [
  { code: 'qp', label: 'Question paper' },
  { code: 'ms', label: 'Mark scheme (answers)' },
  { code: 'gt', label: 'Grade thresholds' },
  { code: 'er', label: 'Examiner report' },
  { code: 'ci', label: 'Confidential instructions' },
  { code: 'in', label: 'Insert' },
  { code: 'sf', label: 'Specimen paper' },
];

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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const needle = query.trim();
    const hasFilters =
      needle.length >= 2 || year !== 'All' || type !== 'All' || dataset !== 'All';

    if (!hasFilters) {
      setNotice(
        'Enter a file name, choose a subject, or pick a year or paper type to search.',
      );
      return;
    }
    if (season !== 'All' && year === 'All' && dataset === 'All') {
      setNotice('Pick a year or a subject together with the exam season.');
      return;
    }

    setSearching(true);
    setNotice(null);
    try {
      const matches = await searchRagflowDocuments({
        query: needle,
        datasetId: dataset === 'All' ? undefined : dataset,
        year: year === 'All' ? null : Number(year),
        season: season === 'All' ? null : (season as 'm' | 's' | 'w'),
        type: type === 'All' ? null : type,
      });
      setResults(matches);
      setSearchedQuery(needle || 'Filters');
      const parts = [
        dataset === 'All' ? 'all subjects' : preview?.datasets.find((item) => item.id === dataset)?.name,
        year === 'All' ? null : year,
        season === 'All' ? null : SEASONS.find((item) => item.code === season)?.label,
        type === 'All' ? null : TYPES.find((item) => item.code === type)?.label,
      ].filter(Boolean);
      setSearchSummary(parts.join(' · '));
      if (matches.length === 0) {
        setNotice('No file names match those filters.');
      }
    } catch {
      setNotice('Search failed. Check the RAGFlow connection and try again.');
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
      setNotice('Guests can download one paper per second. Please wait a moment and try again.');
      return;
    }

    setBusyId(paper.id);
    try {
      if (paper.ragflowDocId && paper.ragflowDatasetId) {
        await downloadRagflowDocument(
          getRagflowConfig(),
          paper.ragflowDatasetId,
          paper.ragflowDocId,
          paper.title.replace(/[\\/:*?"<>|]/g, '-'),
        );
      } else {
        setNotice('This paper has no file attached.');
        return;
      }

      if (supabase && user) {
        try {
          await supabase.from('downloads').insert({
            user_id: user.id,
            paper_id: paper.id,
            paper_title: paper.title,
          });
        } catch {
          /* best effort */
        }
      } else if (supabase && !user) {
        try {
          await supabase.from('download_events').insert({
            session_id: getBrowserSessionId(),
            paper_id: paper.id,
            file_name: paper.title,
            dataset: paper.subject,
          });
        } catch {
          /* best effort */
        }
      }
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Download failed.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <Header />
      <main className="container-page py-14 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow">The archive</p>
            <h1 className="mt-3 font-display text-[46px] leading-none tracking-[-0.01em] sm:text-[54px]">
              Past papers
            </h1>
            <p className="mt-4 max-w-[600px] text-[14px] leading-relaxed text-muted">
              A few papers are shown straight away. Search the full archive when you need a
              specific file — file names are kept exactly as they are stored in RAGFlow.
            </p>
          </div>
          {preview ? (
            <span className="rounded-full border border-line bg-paper px-3 py-1.5 text-[11px] text-muted">
              {preview.totalDocuments.toLocaleString('en-US')} documents ·{' '}
              {preview.datasets.filter((item) => item.count > 0).length} datasets
            </span>
          ) : null}
        </div>

        {!loading && !user ? (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-3 text-[13px]">
            <span className="flex items-center gap-2 text-muted">
              <ShieldCheck className="h-4 w-4 text-[#3f7d5a]" aria-hidden />
              Free to browse and download — no account needed. Guests can download one paper per
              second.
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
            <h2 className="font-display text-[22px] leading-none">Search the full archive</h2>
            <span className="text-[11px] text-muted">
              Only filename matches are fetched — no full dataset download
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
                placeholder="File name, e.g. 9700_w19_ms_22 or 9990_m26"
                aria-label="Search file names"
              />
            </div>
            <select
              value={dataset}
              onChange={(event) => setDataset(event.target.value)}
              className="input sm:w-[270px]"
              aria-label="Choose dataset"
            >
              <option value="All">All datasets</option>
              {(preview?.datasets ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.count})
                </option>
              ))}
            </select>
            <button type="submit" disabled={searching} className="btn-dark px-5 py-2.5">
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <select
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className="input"
              aria-label="Year"
            >
              <option value="All">All years</option>
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
              aria-label="Exam season"
            >
              <option value="All">All exam seasons</option>
              {SEASONS.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="input"
              aria-label="Paper type"
            >
              <option value="All">All paper types</option>
              {TYPES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <p className="mt-2 text-[11px] text-muted">
            Year, exam season and paper type are matched from the file name. Mark schemes are the
            answers; grade thresholds use <span className="font-mono">gt</span>.
          </p>
        </form>

        {results === null ? (
          <section className="mt-10">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Featured</p>
                <h2 className="mt-2 font-display text-[30px] leading-none">A few papers</h2>
              </div>
              <span className="text-[11.5px] text-muted">
                Use search above for anything else
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
                <p className="font-display text-[22px]">The archive is unavailable right now.</p>
                <p className="mt-2 text-[12.5px] text-muted">
                  Check the RAGFlow connection from the admin settings.
                </p>
              </div>
            ) : (
              <div className="mt-5 grid gap-5 md:grid-cols-3">
                {preview.papers.map((paper) => (
                  <PaperCard
                    key={paper.id}
                    paper={paper}
                    cta="download"
                    busy={busyId === paper.id}
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
                <p className="eyebrow">Search results</p>
                <h2 className="mt-2 font-display text-[30px] leading-none">
                  {searchedQuery === 'Filters' ? 'Filtered results' : `“${searchedQuery}”`}
                </h2>
                <p className="mt-1 text-[12px] text-muted">
                  {results.length} match{results.length === 1 ? '' : 'es'}
                  {searchSummary ? ` · ${searchSummary}` : ''}
                </p>
              </div>
              <button type="button" onClick={clearSearch} className="btn-light px-4 py-2">
                Back to featured
              </button>
            </div>

            {results.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-line px-6 py-14 text-center">
                <p className="font-display text-[22px]">No file names match.</p>
                <p className="mt-2 text-[12.5px] text-muted">
                  Try a shorter prefix, or clear the dataset filter.
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-8">
                {groups.map(([name, items]) => (
                  <section key={name}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
                      <h3 className="font-display text-[23px] leading-tight">{name}</h3>
                      <span className="text-[11.5px] text-muted">
                        {items.length} document{items.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="divide-y divide-line/60">
                      {items.map((paper) => {
                        const meta = parsePaperName(paper.title);
                        const metaLabel = [meta.year, meta.season, meta.type]
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
                              disabled={busyId === paper.id}
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-[11.5px] text-ink transition-colors hover:bg-cream disabled:opacity-50"
                            >
                              <Download className="h-3.5 w-3.5" aria-hidden />
                              {busyId === paper.id ? 'Preparing…' : 'Download'}
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
              <p className="font-display text-[20px]">Stuck on one of these?</p>
              <p className="mt-1 text-[12.5px] text-muted">
                Ask the tutor about any question — it cites the paper and chapter it used.
              </p>
            </div>
          </div>
          <Link href="/tutor" className="btn-dark px-5 py-2.5">
            Ask the tutor
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
