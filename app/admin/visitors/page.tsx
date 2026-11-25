'use client';

import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Fingerprint, Search } from 'lucide-react';
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  PageHeader,
  Panel,
  RefreshButton,
  StatCard,
  downloadCsv,
  formatWhen,
  inputClass,
  parseUserAgent,
  statusTone,
  timeAgo,
  useAdminData,
} from '@/components/admin/ui';
import { getLiveVisitors, type LiveVisitor, type VisitorStatus } from '@/lib/admin-api';

const WINDOWS = [
  { minutes: 10, label: 'Last 10 min' },
  { minutes: 60, label: 'Last hour' },
  { minutes: 24 * 60, label: 'Last 24 h' },
  { minutes: 7 * 24 * 60, label: 'Last 7 days' },
];

function place(visitor: LiveVisitor): string {
  const parts = [visitor.city, visitor.region, visitor.country || visitor.country_code].filter(Boolean);
  return Array.from(new Set(parts)).join(', ') || '—';
}

export default function AdminVisitorsPage() {
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [statusFilter, setStatusFilter] = useState<'all' | VisitorStatus>('all');
  const [kindFilter, setKindFilter] = useState<'all' | 'user' | 'guest'>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, error, loading, reload } = useAdminData(
    () => getLiveVisitors(windowMinutes),
    [windowMinutes],
    15_000,
  );

  const visitors = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.items ?? []).filter((visitor) => {
      if (statusFilter !== 'all' && visitor.status !== statusFilter) return false;
      if (kindFilter !== 'all' && visitor.kind !== kindFilter) return false;
      if (!needle) return true;
      return [
        visitor.email,
        visitor.display_name,
        visitor.ip,
        visitor.fingerprint,
        visitor.user_agent,
        visitor.path,
        place(visitor),
        visitor.visitor_id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [data, statusFilter, kindFilter, query]);

  const guests = (data?.items ?? []).filter((item) => item.kind === 'guest' && item.status === 'active').length;
  const users = (data?.items ?? []).filter((item) => item.kind === 'user' && item.status === 'active').length;

  function exportCsv() {
    downloadCsv(
      `visitors-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Status', 'Type', 'Email', 'Name', 'IP', 'Location', 'Fingerprint', 'User agent', 'Language', 'Screen', 'Timezone', 'Page', 'Downloads', 'First seen', 'Last seen'],
      visitors.map((v) => [
        v.status,
        v.kind,
        v.email,
        v.display_name,
        v.ip,
        place(v),
        v.fingerprint,
        v.user_agent,
        v.language,
        v.screen,
        v.timezone,
        v.path,
        v.downloads,
        v.first_seen,
        v.last_seen,
      ]),
    );
  }

  return (
    <div>
      <PageHeader
        title="Live visitors"
        description="Everyone with the site open — signed-in users and guests. A visitor is active if their tab sent a heartbeat in the last 2 minutes, idle up to 10 minutes. Refreshes every 15 seconds."
        actions={
          <>
            <Button onClick={exportCsv} disabled={visitors.length === 0}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <RefreshButton onClick={() => void reload()} loading={loading} />
          </>
        }
      />

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active now" value={data?.active ?? '—'} tone="green" hint="heartbeat < 2 min" />
        <StatCard label="Idle" value={data?.idle ?? '—'} tone="amber" hint="2–10 min" />
        <StatCard label="Signed-in active" value={data ? users : '—'} hint="with an account" />
        <StatCard label="Guests active" value={data ? guests : '—'} hint="not signed in" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a1a1aa]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search email, IP, fingerprint, location, user agent, page"
            className={`${inputClass} pl-9`}
          />
        </div>
        <select value={windowMinutes} onChange={(e) => setWindowMinutes(Number(e.target.value))} className={`${inputClass} w-auto`}>
          {WINDOWS.map((item) => (
            <option key={item.minutes} value={item.minutes}>
              {item.label}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className={`${inputClass} w-auto`}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="idle">Idle</option>
          <option value="offline">Offline</option>
        </select>
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)} className={`${inputClass} w-auto`}>
          <option value="all">Users and guests</option>
          <option value="user">Signed-in users</option>
          <option value="guest">Guests</option>
        </select>
      </div>

      <ErrorBox message={error} />

      <Panel className="mt-4" title="Visitors" right={`${visitors.length} shown · updated ${data ? timeAgo(data.generated_at) : '—'}`}>
        {data === null ? (
          <Empty>Loading…</Empty>
        ) : visitors.length === 0 ? (
          <Empty>No visitors in this window.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-[12px]">
              <thead className="border-b border-[#e4e4e7] bg-[#fafafa] text-[11px] uppercase tracking-[0.04em] text-[#71717a]">
                <tr>
                  <th className="w-8 px-3 py-2.5" />
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Visitor</th>
                  <th className="px-3 py-2.5 font-medium">IP / location</th>
                  <th className="px-3 py-2.5 font-medium">Fingerprint</th>
                  <th className="px-3 py-2.5 font-medium">Browser / OS</th>
                  <th className="px-3 py-2.5 font-medium">Page</th>
                  <th className="px-3 py-2.5 text-right font-medium">Downloads</th>
                  <th className="px-3 py-2.5 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f1]">
                {visitors.map((visitor) => {
                  const ua = parseUserAgent(visitor.user_agent);
                  const open = expanded === visitor.actor;
                  return (
                    <Fragment key={visitor.actor}>
                      <tr className="cursor-pointer align-top hover:bg-[#fafafa]" onClick={() => setExpanded(open ? null : visitor.actor)}>
                        <td className="px-3 py-2.5 text-[#a1a1aa]">
                          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={statusTone(visitor.status)}>
                            <span className={`h-1.5 w-1.5 rounded-full ${visitor.status === 'active' ? 'animate-pulse bg-[#22c55e]' : visitor.status === 'idle' ? 'bg-[#f59e0b]' : 'bg-[#a1a1aa]'}`} />
                            {visitor.status}
                          </Badge>
                        </td>
                        <td className="max-w-[220px] px-3 py-2.5">
                          {visitor.kind === 'user' ? (
                            <>
                              <p className="truncate font-medium">{visitor.display_name || visitor.email}</p>
                              <p className="truncate text-[10.5px] text-[#a1a1aa]">{visitor.email}</p>
                            </>
                          ) : (
                            <>
                              <p className="font-medium text-[#52525b]">Guest</p>
                              <p className="truncate font-mono text-[10.5px] text-[#a1a1aa]">{visitor.visitor_id?.slice(0, 13)}</p>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-mono text-[11.5px]">{visitor.ip || '—'}</p>
                          <p className="max-w-[200px] truncate text-[10.5px] text-[#71717a]" title={place(visitor)}>
                            {visitor.country_code ? `${visitor.country_code} · ` : ''}
                            {place(visitor)}
                          </p>
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="flex items-center gap-1 font-mono text-[11px]">
                            <Fingerprint className="h-3 w-3 text-[#a1a1aa]" />
                            {visitor.fingerprint ? visitor.fingerprint.slice(0, 12) : '—'}
                          </p>
                          {visitor.same_fingerprint > 0 ? (
                            <p className="mt-0.5 text-[10.5px] text-[#b45309]">+{visitor.same_fingerprint} other visitor(s) share it</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5">
                          <p>{ua.browser}</p>
                          <p className="text-[10.5px] text-[#71717a]">
                            {ua.os} · {ua.device}
                          </p>
                        </td>
                        <td className="max-w-[160px] truncate px-3 py-2.5 font-mono text-[11px] text-[#52525b]" title={visitor.path ?? ''}>
                          {visitor.path || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium">{visitor.downloads}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <p>{timeAgo(visitor.last_seen)}</p>
                          <p className="text-[10.5px] text-[#a1a1aa]">since {formatWhen(visitor.first_seen)}</p>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="bg-[#fafafa]">
                          <td />
                          <td colSpan={8} className="px-3 pb-4 pt-1">
                            <div className="grid gap-4 md:grid-cols-2">
                              <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-[11.5px]">
                                <dt className="text-[#71717a]">User agent</dt>
                                <dd className="break-all font-mono text-[10.5px]">{visitor.user_agent || '—'}</dd>
                                <dt className="text-[#71717a]">Fingerprint</dt>
                                <dd className="break-all font-mono text-[10.5px]">{visitor.fingerprint || '—'}</dd>
                                <dt className="text-[#71717a]">Visitor id</dt>
                                <dd className="break-all font-mono text-[10.5px]">{visitor.visitor_id || '—'}</dd>
                                <dt className="text-[#71717a]">User id</dt>
                                <dd className="break-all font-mono text-[10.5px]">{visitor.user_id || '—'}</dd>
                                <dt className="text-[#71717a]">Language</dt>
                                <dd>{visitor.language || '—'}</dd>
                                <dt className="text-[#71717a]">Screen</dt>
                                <dd>{visitor.screen || '—'}</dd>
                                <dt className="text-[#71717a]">Device timezone</dt>
                                <dd>{visitor.timezone || '—'}</dd>
                                <dt className="text-[#71717a]">Heartbeats</dt>
                                <dd>{visitor.heartbeats}</dd>
                                <dt className="text-[#71717a]">First / last</dt>
                                <dd>
                                  {formatWhen(visitor.first_seen)} → {formatWhen(visitor.last_seen)}
                                </dd>
                              </dl>
                              <div>
                                <p className="text-[11.5px] text-[#71717a]">Fingerprint components</p>
                                <pre className="mt-1 max-h-[220px] overflow-auto rounded-lg border border-[#e4e4e7] bg-white p-3 font-mono text-[10.5px] leading-relaxed">
                                  {visitor.fp_components ? JSON.stringify(visitor.fp_components, null, 2) : '—'}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="mt-3 text-[11px] leading-relaxed text-[#a1a1aa]">
        IP, country and user agent are read server-side from the request headers. Region and city come from the
        visitor&apos;s IP lookup. Downloads count both signed-in and guest downloads linked to this visitor.
        Records older than 30 days are deleted automatically.
      </p>
    </div>
  );
}
