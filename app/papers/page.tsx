'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { PaperCard } from '@/components/PaperCard';
import { useAuth } from '@/components/AuthProvider';
import { fetchArchive } from '@/lib/papers';
import { downloadRagflowDocument, getRagflowConfig } from '@/lib/ragflow';
import { supabase } from '@/lib/supabase';
import type { ArchiveResult, Paper } from '@/lib/types';

export default function PapersPage() {
  const { user, loading, verified } = useAuth();
  const [archive, setArchive] = useState<ArchiveResult | null>(null);
  const [subject, setSubject] = useState('All');
  const [year, setYear] = useState('All');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(24);

  useEffect(() => {
    setVisibleCount(24);
  }, [subject, year, query]);

  useEffect(() => {
    let active = true;
    fetchArchive()
      .then((result) => {
        if (active) setArchive(result);
      })
      .catch(() => {
        if (active) setArchive({ papers: [], source: 'demo' });
      });
    return () => {
      active = false;
    };
  }, []);

  const papers = archive?.papers ?? [];
  const subjects = useMemo(
    () => Array.from(new Set(papers.map((paper) => paper.subject))).sort(),
    [papers],
  );
  const years = useMemo(
    () =>
      Array.from(new Set(papers.map((paper) => paper.year).filter((value): value is number => !!value)))
        .sort((a, b) => b - a)
        .map(String),
    [papers],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return papers.filter((paper) => {
      if (subject !== 'All' && paper.subject !== subject) return false;
      if (year !== 'All' && String(paper.year ?? '') !== year) return false;
      if (needle && !paper.title.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [papers, subject, year, query]);

  async function download(paper: Paper) {
    setNotice(null);
    if (!user) {
      setNotice('Sign in to download papers from the archive.');
      return;
    }
    if (!verified) {
      setNotice('Verify your email first — check your inbox for the confirmation link.');
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
          `${paper.title.replace(/[\\/:*?"<>|]/g, '-')}.pdf`,
        );
      } else if (paper.url) {
        window.open(paper.url, '_blank', 'noopener,noreferrer');
      } else {
        setNotice(
          'This card is a sample. Connect your RAGFlow dataset or add a file URL in Supabase to enable downloads.',
        );
        return;
      }

      if (supabase) {
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
            <p className="mt-4 max-w-[520px] text-[14px] leading-relaxed text-muted">
              Every paper in your knowledge base, organised by subject and year. Sign in with a
              verified email to download.
            </p>
          </div>
          {archive ? (
            <span className="rounded-full border border-line bg-paper px-3 py-1.5 text-[11px] text-muted">
              {archive.source === 'ragflow'
                ? 'Live from RAGFlow'
                : archive.source === 'supabase'
                  ? 'Supabase archive'
                  : 'Demo data'}
            </span>
          ) : null}
        </div>

        {!loading && !user ? (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-3 text-[13px]">
            <span className="flex items-center gap-2 text-muted">
              <ShieldAlert className="h-4 w-4" aria-hidden />
              Browsing is free. Sign in to download papers and ask the tutor.
            </span>
            <div className="flex items-center gap-2">
              <Link href="/login" className="btn-outline px-3 py-1.5">
                Sign in
              </Link>
              <Link href="/signup" className="btn-dark px-3.5 py-1.5">
                Create account
              </Link>
            </div>
          </div>
        ) : null}

        {user && !verified ? (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e7d3b0] bg-[#fbf3e2] px-4 py-3 text-[13px] text-[#6d5320]">
            <span className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" aria-hidden />
              Verify your email to unlock downloads.
            </span>
            <Link href="/account" className="link-underline text-[#6d5320]">
              Resend verification
            </Link>
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
              placeholder="Search papers…"
              aria-label="Search papers"
            />
          </div>
          <select
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="input sm:w-[170px]"
            aria-label="Filter by subject"
          >
            <option value="All">All subjects</option>
            {subjects.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(event) => setYear(event.target.value)}
            className="input sm:w-[130px]"
            aria-label="Filter by year"
          >
            <option value="All">All years</option>
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {archive === null ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-[280px] animate-pulse rounded-2xl bg-soft/60" />
            ))
          ) : filtered.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-line px-6 py-16 text-center">
              <p className="font-display text-[24px]">No papers match those filters.</p>
              <p className="mt-2 text-[13px] text-muted">
                Try clearing the search, or connect a knowledge base with more documents.
              </p>
            </div>
          ) : (
            filtered.slice(0, visibleCount).map((paper) => (
              <PaperCard
                key={paper.id}
                paper={paper}
                cta="download"
                busy={busyId === paper.id}
                onDownload={() => void download(paper)}
              />
            ))
          )}
        </div>

        {filtered.length > visibleCount ? (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleCount((value) => value + 24)}
              className="btn-light px-5 py-2.5"
            >
              Show more papers ({filtered.length - visibleCount} remaining)
            </button>
          </div>
        ) : null}

        {archive?.note ? (
          <p className="mt-8 text-[12px] text-muted">{archive.note}</p>
        ) : null}

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
