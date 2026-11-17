'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, FileText, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/components/AuthProvider';
import { fetchArchive } from '@/lib/papers';
import { downloadRagflowDocument, getRagflowConfig } from '@/lib/ragflow';
import { supabase } from '@/lib/supabase';
import type { ArchiveResult, Paper } from '@/lib/types';

const GUEST_DOWNLOAD_KEY = 'differential-quant.guest.lastDownload';
const PAGE_SIZE = 12;

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
  const [archive, setArchive] = useState<ArchiveResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [dataset, setDataset] = useState('All');
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchArchive()
      .then((result) => {
        if (active) setArchive(result);
      })
      .catch(() => {
        if (active) setArchive({ papers: [], source: 'demo', note: 'Could not load the archive.' });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setVisibleCounts({});
  }, [query, dataset]);

  const papers = archive?.papers ?? [];
  const datasets = useMemo(
    () => Array.from(new Set(papers.map((paper) => paper.subject))).sort((a, b) => a.localeCompare(b)),
    [papers],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return papers.filter((paper) => {
      if (dataset !== 'All' && paper.subject !== dataset) return false;
      if (needle && !paper.title.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [papers, query, dataset]);

  const groups = useMemo(() => {
    const map = new Map<string, Paper[]>();
    for (const paper of filtered) {
      const list = map.get(paper.subject);
      if (list) list.push(paper);
      else map.set(paper.subject, [paper]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const allExpanded =
    groups.length > 0 &&
    groups.every(([name, items]) => (visibleCounts[name] ?? PAGE_SIZE) >= items.length);

  function toggleExpandAll() {
    if (allExpanded) {
      setVisibleCounts({});
      return;
    }
    const next: Record<string, number> = {};
    for (const [name, items] of groups) next[name] = items.length;
    setVisibleCounts(next);
  }

  async function refresh() {
    setRefreshing(true);
    setNotice(null);
    try {
      const result = await fetchArchive(true);
      setArchive(result);
      setVisibleCounts({});
      setNotice(`Loaded ${result.papers.length} documents.`);
    } catch {
      setNotice('Could not refresh the archive.');
    } finally {
      setRefreshing(false);
    }
  }

  async function download(paper: Paper) {
    setNotice(null);
    if (!user && !guestCanDownload()) {
      setNotice('Guests can download one paper per second. Please wait a moment and try again.');
      return;
    }

    setBusyId(paper.id);
    try {
      if (paper.source === 'ragflow' && paper.ragflowDocId) {
        if (!paper.ragflowDatasetId) {
          setNotice('This paper is missing its knowledge-base reference.');
          return;
        }
        await downloadRagflowDocument(
          getRagflowConfig(),
          paper.ragflowDatasetId,
          paper.ragflowDocId,
          paper.title.replace(/[\\/:*?"<>|]/g, '-'),
        );
      } else if (paper.url) {
        window.open(paper.url, '_blank', 'noopener,noreferrer');
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
          /* history logging is best-effort */
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
              Every document from every RAGFlow dataset, grouped by dataset and shown under its
              original file name. No renaming, no parsed titles.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {archive ? (
              <span className="rounded-full border border-line bg-paper px-3 py-1.5 text-[11px] text-muted">
                {archive.source === 'ragflow'
                  ? 'Live from RAGFlow'
                  : archive.source === 'supabase'
                    ? 'Supabase archive'
                    : 'Demo data'}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-[11.5px] text-muted transition-colors hover:text-ink disabled:opacity-50"
              title="Reload every dataset from RAGFlow"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Loading…' : 'Refresh'}
            </button>
          </div>
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

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="input pl-10"
              placeholder="Search file names…"
              aria-label="Search papers"
            />
          </div>
          <select
            value={dataset}
            onChange={(event) => setDataset(event.target.value)}
            className="input sm:w-[280px]"
            aria-label="Filter by dataset"
          >
            <option value="All">All datasets ({papers.length})</option>
            {datasets.map((item) => (
              <option key={item} value={item}>
                {item} ({papers.filter((paper) => paper.subject === item).length})
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted">
          <span>
            {archive === null
              ? 'Loading every dataset from RAGFlow…'
              : `${filtered.length} document${filtered.length === 1 ? '' : 's'} in ${groups.length} dataset${
                  groups.length === 1 ? '' : 's'
                }`}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            {archive?.note ? <span>{archive.note}</span> : null}
            {groups.length > 0 ? (
              <button
                type="button"
                onClick={toggleExpandAll}
                className="rounded-full border border-line bg-paper px-3 py-1.5 text-[11px] text-muted transition-colors hover:text-ink"
              >
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </button>
            ) : null}
          </div>
        </div>

        {archive === null ? (
          <div className="mt-8 space-y-4">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-32 animate-pulse rounded-2xl bg-soft/60" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
            <p className="font-display text-[24px]">No documents match those filters.</p>
            <p className="mt-2 text-[13px] text-muted">
              Clear the search or pick another dataset. If the archive is empty, check the RAGFlow
              connection from the admin settings.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {groups.map(([name, items]) => {
              const visible = visibleCounts[name] ?? PAGE_SIZE;
              const shown = items.slice(0, visible);
              return (
                <section key={name}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
                    <h2 className="font-display text-[24px] leading-tight">{name}</h2>
                    <span className="text-[11.5px] text-muted">
                      {items.length} document{items.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="mt-2 divide-y divide-line/60">
                    {shown.map((paper) => (
                      <div
                        key={paper.id}
                        className="flex items-center gap-3 py-2.5 transition-colors hover:bg-paper/60"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-[13px]" title={paper.title}>
                          {paper.title}
                        </span>
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
                    ))}
                  </div>

                  {items.length > visible ? (
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleCounts((previous) => ({
                          ...previous,
                          [name]: visible + 24,
                        }))
                      }
                      className="mt-2 rounded-full border border-line bg-paper px-3.5 py-1.5 text-[11.5px] text-muted transition-colors hover:text-ink"
                    >
                      Show more ({items.length - visible} remaining)
                    </button>
                  ) : null}
                </section>
              );
            })}
          </div>
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
