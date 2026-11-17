'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatNumber } from '@/lib/analytics';

type HomeStatsData = {
  download_users: number;
  download_files: number;
  live_learners: number;
};

export function HomeStats() {
  const [stats, setStats] = useState<HomeStatsData | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    async function load() {
      const { data, error } = await supabase!.rpc('home_stats');
      if (!active || error || !data) return;
      const value = data as Partial<HomeStatsData>;
      setStats({
        download_users: Number(value.download_users ?? 0),
        download_files: Number(value.download_files ?? 0),
        live_learners: Number(value.live_learners ?? 0),
      });
    }

    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex items-center gap-3.5 rounded-xl border border-line bg-paper px-4 py-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-cream">
          <Download className="h-4 w-4" aria-hidden />
        </span>
        <p className="text-[13px] leading-relaxed text-muted">
          In the last 30 days,{' '}
          <span className="font-display text-[21px] leading-none text-ink">
            {stats ? formatNumber(stats.download_users) : '—'}
          </span>{' '}
          {stats?.download_users === 1 ? 'user' : 'users'} downloaded{' '}
          <span className="font-medium text-ink">
            {stats ? formatNumber(stats.download_files) : '—'}
          </span>{' '}
          {stats?.download_files === 1 ? 'file' : 'files'}.
        </p>
      </div>

      <div className="flex items-center gap-3.5 rounded-xl border border-line bg-paper px-4 py-3.5">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-40" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
        </span>
        <p className="text-[13px] leading-relaxed text-muted">
          <span className="font-display text-[21px] leading-none text-ink">
            {stats ? formatNumber(stats.live_learners) : '—'}
          </span>{' '}
          {stats?.live_learners === 1 ? 'learner' : 'learners'} online now.
        </p>
      </div>
    </div>
  );
}
