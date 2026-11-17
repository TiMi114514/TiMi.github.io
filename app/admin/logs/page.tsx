'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type DownloadRow = {
  id: number;
  paper_title: string | null;
  created_at: string;
  user_id: string;
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

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    async function load() {
      const [downloadResult, viewResult] = await Promise.all([
        supabase!
          .from('downloads')
          .select('id, paper_title, created_at, user_id')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase!
          .from('page_views')
          .select('id, path, country, session_id, created_at')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      if (!active) return;
      if (downloadResult.error || viewResult.error) {
        setError(downloadResult.error?.message ?? viewResult.error?.message ?? 'Failed to load logs.');
      }
      setDownloads((downloadResult.data as DownloadRow[] | null) ?? []);
      setViews((viewResult.data as ViewRow[] | null) ?? []);
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] sm:text-[32px]">Logs</h1>
      <p className="mt-1 text-[13px] text-[#71717a]">
        Recent downloads and page views. Page views contain no IP addresses or cookies.
      </p>

      {error ? (
        <div className="mt-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[12.5px] text-[#b91c1c]">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-[#e4e4e7] bg-white">
          <h2 className="border-b border-[#e4e4e7] px-5 py-3.5 text-[14px] font-semibold">
            Downloads
          </h2>
          <div className="max-h-[420px] overflow-y-auto">
            {downloads === null ? (
              <p className="px-5 py-10 text-center text-[12px] text-[#a1a1aa]">Loading…</p>
            ) : downloads.length === 0 ? (
              <p className="px-5 py-10 text-center text-[12px] text-[#a1a1aa]">No downloads yet.</p>
            ) : (
              <div className="divide-y divide-[#f0f0f1]">
                {downloads.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="truncate text-[12.5px]">{row.paper_title || 'Past paper'}</span>
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
          <h2 className="border-b border-[#e4e4e7] px-5 py-3.5 text-[14px] font-semibold">
            Page views
          </h2>
          <div className="max-h-[420px] overflow-y-auto">
            {views === null ? (
              <p className="px-5 py-10 text-center text-[12px] text-[#a1a1aa]">Loading…</p>
            ) : views.length === 0 ? (
              <p className="px-5 py-10 text-center text-[12px] text-[#a1a1aa]">No page views yet.</p>
            ) : (
              <div className="divide-y divide-[#f0f0f1]">
                {views.map((row) => (
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
