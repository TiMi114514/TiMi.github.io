'use client';

import { useMemo } from 'react';
import { BarCard } from '@/components/admin/BarCard';
import { ErrorBox, StatCard, parseUserAgent, useAdminData } from '@/components/admin/ui';
import { getAudience, type Bucket } from '@/lib/admin-api';

function group(buckets: Bucket[], pick: (label: string) => string) {
  const map = new Map<string, number>();
  for (const bucket of buckets) {
    const key = pick(bucket.label);
    map.set(key, (map.get(key) ?? 0) + bucket.count);
  }
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

/** Audience tab: who the visitors are (from live_presence via admin_audience). */
export function AudiencePanel({ days, refreshKey }: { days: number; refreshKey: number }) {
  const { data, error } = useAdminData(() => getAudience(days), [days, refreshKey]);

  const browsers = useMemo(() => group(data?.user_agents ?? [], (ua) => parseUserAgent(ua).browser.split(' ')[0]), [data]);
  const systems = useMemo(() => group(data?.user_agents ?? [], (ua) => parseUserAgent(ua).os), [data]);
  const devices = useMemo(() => group(data?.user_agents ?? [], (ua) => parseUserAgent(ua).device), [data]);
  const toRows = (buckets: Bucket[] | undefined) => (buckets ?? []).map((b) => ({ label: b.label, value: b.count }));

  const guests = data ? data.visitors - data.signed_in : null;

  return (
    <>
      <ErrorBox message={error} />
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Visitors" value={data?.visitors ?? '—'} hint={`seen in the last ${days} days`} />
        <StatCard label="Signed in" value={data?.signed_in ?? '—'} tone="green" />
        <StatCard label="Guests" value={guests ?? '—'} tone="amber" />
        <StatCard
          label="Guest share"
          value={data && data.visitors ? `${Math.round(((guests ?? 0) / data.visitors) * 100)}%` : '—'}
        />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <BarCard title="Region / city (from IP)" rows={toRows(data?.regions)} emptyLabel="No visitor locations yet." />
        <BarCard title="Country (edge IP)" rows={toRows(data?.countries)} emptyLabel="No countries yet." />
        <BarCard title="Browser" rows={browsers} emptyLabel="No user agents yet." />
        <BarCard title="Operating system" rows={systems} emptyLabel="No user agents yet." />
        <BarCard title="Device" rows={devices} emptyLabel="No user agents yet." />
        <BarCard title="Browser language" rows={toRows(data?.languages)} emptyLabel="No language data yet." />
      </div>
    </>
  );
}
