'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Filter,
  HelpCircle,
  Plus,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import { BarCard } from '@/components/admin/BarCard';
import { TrafficChart } from '@/components/admin/TrafficChart';
import { supabase } from '@/lib/supabase';
import {
  formatDuration,
  formatNumber,
  pageLabel,
  percentChange,
  type AdminAnalytics,
} from '@/lib/analytics';

type Tab = 'traffic' | 'sales' | 'sessions';

function normalize(value: unknown): AdminAnalytics | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<AdminAnalytics>;
  return {
    days: Number(raw.days ?? 7),
    total_visits: Number(raw.total_visits ?? 0),
    unique_visitors: Number(raw.unique_visitors ?? 0),
    avg_duration: Number(raw.avg_duration ?? 0),
    prev_total_visits: Number(raw.prev_total_visits ?? 0),
    prev_unique_visitors: Number(raw.prev_unique_visitors ?? 0),
    prev_avg_duration: Number(raw.prev_avg_duration ?? 0),
    live_visitors: Number(raw.live_visitors ?? 0),
    series: Array.isArray(raw.series) ? raw.series : [],
    pages: Array.isArray(raw.pages) ? raw.pages : [],
    countries: Array.isArray(raw.countries) ? raw.countries : [],
  };
}

function Delta({ current, previous }: { current: number; previous: number }) {
  const change = percentChange(current, previous);
  if (change === null) return <span className="text-[12px] text-[#a1a1aa]">—</span>;
  const positive = change >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[12px] font-medium ${
        positive ? 'text-[#16a34a]' : 'text-[#dc2626]'
      }`}
    >
      {positive ? (
        <ArrowUpRight className="h-3.5 w-3.5" />
      ) : (
        <ArrowDownRight className="h-3.5 w-3.5" />
      )}
      {Math.abs(change)}%
    </span>
  );
}

function Metrics({ data }: { data: AdminAnalytics | null }) {
  const items = [
    {
      label: 'Total visits',
      value: data ? formatNumber(data.total_visits) : '—',
      delta: data ? <Delta current={data.total_visits} previous={data.prev_total_visits} /> : null,
    },
    {
      label: 'Unique visitors',
      value: data ? formatNumber(data.unique_visitors) : '—',
      delta: data ? (
        <Delta current={data.unique_visitors} previous={data.prev_unique_visitors} />
      ) : null,
    },
    {
      label: 'Visit duration',
      value: data ? formatDuration(data.avg_duration) : '—',
      delta: data ? <Delta current={data.avg_duration} previous={data.prev_avg_duration} /> : null,
    },
  ];

  return (
    <div className="grid divide-y divide-[#e4e4e7] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {items.map((item) => (
        <div key={item.label} className="px-5 py-4">
          <div className="flex items-center gap-1.5 text-[12.5px] text-[#71717a]">
            {item.label}
            <HelpCircle className="h-3.5 w-3.5 text-[#a1a1aa]" />
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <span className="text-[20px] font-semibold leading-none">{item.value}</span>
            {item.delta}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<Tab>('traffic');

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    async function load(silent = false) {
      if (!silent) setLoading(true);
      const { data: result, error: rpcError } = await supabase!.rpc('admin_analytics', {
        p_days: days,
      });
      if (!active) return;
      if (rpcError) {
        setError(rpcError.message);
        setData(null);
      } else {
        setError(null);
        setData(normalize(result));
      }
      setLoading(false);
    }

    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, 5 * 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [days, refreshKey]);

  const pageRows = useMemo(
    () => (data?.pages ?? []).map((row) => ({ label: pageLabel(row.path), value: row.visits })),
    [data],
  );
  const countryRows = useMemo(
    () => (data?.countries ?? []).map((row) => ({ label: row.country, value: row.visits })),
    [data],
  );

  return (
    <div className="text-[#18181b]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] sm:text-[32px]">Analytics</h1>
        <div className="flex items-center gap-2 pt-1 text-[13px] text-[#3f3f46]">
          <span className="font-medium">{data?.live_visitors ?? 0}</span>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#22c55e]" />
          </span>
          <span className="text-[#52525b]">Live visitors</span>
        </div>
      </header>

      <div className="mt-4 flex gap-6 overflow-x-auto border-b border-[#e4e4e7] text-[13.5px]">
        {(
          [
            ['traffic', 'Traffic overview'],
            ['sales', 'Sales overview'],
            ['sessions', 'Session recordings'],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`-mb-px shrink-0 border-b-2 pb-2.5 ${
              tab === value
                ? 'border-[#18181b] font-medium text-[#18181b]'
                : 'border-transparent text-[#71717a] hover:text-[#3f3f46]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-[#e4e4e7] bg-white text-[#52525b] transition-colors hover:bg-[#fafafa]"
          aria-label="Refresh analytics"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>

        <label className="flex h-9 items-center gap-2 rounded-lg border border-[#e4e4e7] bg-white px-3 text-[12.5px] text-[#3f3f46]">
          <CalendarDays className="h-4 w-4 text-[#71717a]" />
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="bg-transparent pr-1 text-[12.5px] outline-none"
            aria-label="Date range"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>

        <button
          type="button"
          disabled
          title="Filters are not enabled yet"
          className="flex h-9 items-center gap-2 rounded-lg border border-[#e4e4e7] bg-white px-3 text-[12.5px] text-[#3f3f46] opacity-60"
        >
          <Filter className="h-4 w-4 text-[#71717a]" /> Filters
        </button>

        <button
          type="button"
          disabled
          title="Custom events are not enabled yet"
          className="grid h-9 w-9 place-items-center rounded-lg border border-[#e4e4e7] bg-white text-[#52525b] opacity-60"
          aria-label="Event settings"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>

        <button
          type="button"
          disabled
          title="Custom events are not enabled yet"
          className="ml-auto flex h-9 items-center gap-1.5 rounded-lg bg-[#18181b] px-3.5 text-[12.5px] font-medium text-white opacity-90"
        >
          <Plus className="h-4 w-4" /> Add event
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[12.5px] text-[#b91c1c]">
          {error}
        </div>
      ) : null}

      {tab === 'traffic' ? (
        <>
          <section className="mt-4 rounded-xl border border-[#e4e4e7] bg-white">
            <Metrics data={data} />
            <div className="border-t border-[#e4e4e7] px-2 pb-2 pt-3">
              {loading && !data ? (
                <div className="h-[240px] animate-pulse rounded-lg bg-[#f4f4f5]" />
              ) : (
                <TrafficChart series={data?.series ?? []} />
              )}
            </div>
          </section>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <BarCard
              title="Page traffic"
              rows={pageRows}
              emptyLabel="No page views yet. Open a few pages and they will show up here."
            />
            <BarCard
              title="Country"
              rows={countryRows}
              emptyLabel="No country data yet. It is estimated from the visitor's time zone."
            />
          </div>
        </>
      ) : (
        <section className="mt-4 grid min-h-[320px] place-items-center rounded-xl border border-[#e4e4e7] bg-white">
          <div className="max-w-sm px-6 py-16 text-center">
            <h2 className="text-[16px] font-semibold">
              {tab === 'sales' ? 'Sales overview' : 'Session recordings'}
            </h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[#71717a]">
              {tab === 'sales'
                ? 'There are no paid plans or orders in this deployment yet. The panel is reserved for when you add them.'
                : 'Recording sessions is not enabled. Page views, referrers and country estimates are collected without cookies or IP addresses.'}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
