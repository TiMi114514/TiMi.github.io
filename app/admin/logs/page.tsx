'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type DownloadRow = {
  key: string;
  title: string | null;
  source: 'account' | 'guest';
  created_at: string;
};

type ViewRow = {
  id: number;
  path: string;
  country: string | null;
  session_id: string;
  created_at: string;
};

export default function AdminLogsPage() {
  const [downloads, setDownloads] = useState<DownloadRow[] | null>(null);
  const [views, setViews] = useState<ViewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    async function load() {
      const [downloadResult, eventResult, viewResult] = await Promise.all([
        supabase!
          .from('downloads')
          .select('id, paper_title, created_at')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase!
          .from('download_events')
          .select('id, file_name, created_at')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase!
          .from('page_views')
          .select('id, path, country, session_id, created_at')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      if (!active) return;
      if (downloadResult.error || eventResult.error || viewResult.error) {
        setError(
          downloadResult.error?.message ??
            eventResult.error?.message ??
            viewResult.error?.message ??
            'Failed to load logs.',
        );
      }

      const signedIn: DownloadRow[] = ((downloadResult.data as {
        id: number;
        paper_title: string | null;
        created_at: string;
      }[]) ?? []).map((row) => ({
        key: `account-${row.id}`,
        title: row.paper_title,
        source: 'account',
        created_at: row.created_at,
      }));
      const guests: DownloadRow[] = ((eventResult.data as {
        id: number;
        file_name: string | null;
        created_at: string;
      }[]) ?? []).map((row) => ({
        key: `guest-${row.id}`,
        title: row.file_name,
        source: 'guest',
        created_at: row.created_at,
      }));

      setDownloads(
        [...signedIn, ...guests]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 100),
      );
      setViews((viewResult.data as ViewRow[] | null) ?? []);
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const filteredDownloads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return downloads ?? [];
    return (downloads ?? []).filter(
      (row) =>
        (row.title ?? '').toLowerCase().includes(needle) ||
        row.source.includes(needle),
    );
  }, [downloads, query]);

  const filteredViews = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return views ?? [];
    return (views ?? []).filter(
      (row) =>
        row.path.toLowerCase().includes(needle) ||
        (row.country ?? '').toLowerCase().includes(needle),
    );
  }, [views, query]);

  function exportCsv() {
    const header = ['Type', 'Detail', 'Source / Country', 'Time'];
    const rows = [
      ...filteredDownloads.map((row) => [
        'download',
        row.title ?? '',
        row.source,
        row.created_at,
      ]),
      ...filteredViews.map((row) => [
        'page_view',
        row.path,
        row.country ?? 'Unknown',
        row.created_at,
      ]),
    ];
    const csv = [header, ...rows]
      .map((line) =>
        line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','),
      )
      .join('\r\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `logs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] sm:text-[32px]">Logs</h1>
      <p className="mt-1 text-[13px] text-[#71717a]">
        Downloads (account and guest) plus page views. Page views contain no IP addresses or
        cookies.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a1a1aa]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search file name, path or country"
            className="w-full rounded-lg border border-[#e4e4e7] bg-white py-2 pl-9 pr-3 text-[12.5px] outline-none placeholder:text-[#a1a1aa] focus:border-[#a1a1aa]"
          />
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={filteredDownloads.length + filteredViews.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e4e7] bg-white px-3 py-2 text-[12px] text-[#3f3f46] transition-colors hover:bg-[#fafafa] disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[12.5px] text-[#b91c1c]">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-[#e4e4e7] bg-white">
          <h2 className="flex items-center justify-between border-b border-[#e4e4e7] px-5 py-3.5 text-[14px] font-semibold">
            Downloads
            <span className="text-[11px] font-normal text-[#a1a1aa]">
              {filteredDownloads.length}
            </span>
          </h2>
          <div className="max-h-[420px] overflow-y-auto">
            {downloads === null ? (
              <p className="px-5 py-10 text-center text-[12px] text-[#a1a1aa]">Loading…</p>
            ) : filteredDownloads.length === 0 ? (
              <p className="px-5 py-10 text-center text-[12px] text-[#a1a1aa]">
                No downloads match.
              </p>
            ) : (
              <div className="divide-y divide-[#f0f0f1]">
                {filteredDownloads.map((row) => (
                  <div key={row.key} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px]">{row.title || 'Past paper'}</p>
                      <p className="text-[10.5px] text-[#a1a1aa]">
                        {row.source === 'guest' ? 'Guest download' : 'Signed-in download'}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-[#a1a1aa]">
                      {new Date(row.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[#e4e4e7] bg-white">
          <h2 className="flex items-center justify-between border-b border-[#e4e4e7] px-5 py-3.5 text-[14px] font-semibold">
            Page views
            <span className="text-[11px] font-normal text-[#a1a1aa]">{filteredViews.length}</span>
          </h2>
          <div className="max-h-[420px] overflow-y-auto">
            {views === null ? (
              <p className="px-5 py-10 text-center text-[12px] text-[#a1a1aa]">Loading…</p>
            ) : filteredViews.length === 0 ? (
              <p className="px-5 py-10 text-center text-[12px] text-[#a1a1aa]">
                No page views match.
              </p>
            ) : (
              <div className="divide-y divide-[#f0f0f1]">
                {filteredViews.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px]">{row.path}</p>
                      <p className="truncate text-[10.5px] text-[#a1a1aa]">
                        {row.country || 'Unknown'} · session {row.session_id.slice(0, 8)}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-[#a1a1aa]">
                      {new Date(row.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
