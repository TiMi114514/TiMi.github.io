'use client';

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatNumber } from '@/lib/analytics';
import { useT } from '@/lib/i18n';

function renderTemplate(template: string, slots: Record<string, ReactNode>): ReactNode {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const match = /^\{(\w+)\}$/.exec(part);
    if (match && match[1] in slots) return <Fragment key={i}>{slots[match[1]]}</Fragment>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

type HomeStatsData = {
  download_users: number;
  download_files: number;
  live_learners: number;
};

export function HomeStats() {
  const t = useT();
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
          {renderTemplate(t('stats.downloads'), {
            users: (
              <span className="font-display text-[21px] leading-none text-ink">
                {stats ? formatNumber(stats.download_users) : '—'}
              </span>
            ),
            files: (
              <span className="font-medium text-ink">
                {stats ? formatNumber(stats.download_files) : '—'}
              </span>
            ),
          })}
        </p>
      </div>

      <div className="flex items-center gap-3.5 rounded-xl border border-line bg-paper px-4 py-3.5">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-40" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
        </span>
        <p className="text-[13px] leading-relaxed text-muted">
          {renderTemplate(t('stats.online'), {
            n: (
              <span className="font-display text-[21px] leading-none text-ink">
                {stats ? formatNumber(stats.live_learners) : '—'}
              </span>
            ),
          })}
        </p>
      </div>
    </div>
  );
}
