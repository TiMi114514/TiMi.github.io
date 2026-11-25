'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
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
import { UserDetailDrawer } from '@/components/admin/UserDetailDrawer';
import { getAppUsers, type AppUser } from '@/lib/admin-api';

function place(user: AppUser): string {
  return Array.from(new Set([user.city, user.region, user.country || user.country_code].filter(Boolean))).join(', ');
}

export default function AdminUsersPage() {
  const { data, error, loading, reload } = useAdminData(() => getAppUsers(), [], 30_000);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'verified' | 'pending' | 'online'>('all');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('user');
    if (id) setSelected(id);
  }, []);

  function open(id: string | null) {
    setSelected(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('user', id);
    else url.searchParams.delete('user');
    window.history.replaceState(null, '', url.toString());
  }

  const rows = data?.items ?? [];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status === 'verified' && !row.confirmed) return false;
      if (status === 'pending' && row.confirmed) return false;
      if (status === 'online' && row.status === 'offline') return false;
      if (!needle) return true;
      return [row.email, row.display_name, row.ip, place(row)].some((value) => (value ?? '').toLowerCase().includes(needle));
    });
  }, [rows, query, status]);

  function exportCsv() {
    downloadCsv(
      `app-users-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Email', 'Name', 'Verified', 'Admin', 'Status', 'Last active', 'IP', 'Location', 'Browser', 'Downloads', 'Joined', 'Last sign-in'],
      filtered.map((row) => {
        const ua = parseUserAgent(row.user_agent);
        return [
          row.email,
          row.display_name,
          row.confirmed ? 'yes' : 'no',
          row.is_admin ? 'yes' : 'no',
          row.status,
          row.last_active,
          row.ip,
          place(row),
          `${ua.browser} / ${ua.os}`,
          row.downloads,
          row.created_at,
          row.last_sign_in_at,
        ];
      }),
    );
  }

  const online = rows.filter((row) => row.status !== 'offline').length;
  const verified = rows.filter((row) => row.confirmed).length;
  const totalDownloads = rows.reduce((sum, row) => sum + row.downloads, 0);

  return (
    <div>
      <PageHeader
        title="App Users"
        description="Every account created through Supabase Auth. Click a user to see their IP, location, devices, sessions, downloads and activity."
        actions={
          <>
            <Button onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <RefreshButton onClick={() => void reload()} loading={loading} />
          </>
        }
      />

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Accounts" value={data ? rows.length : '—'} />
        <StatCard label="Online now" value={data ? online : '—'} tone="green" />
        <StatCard label="Verified" value={data ? verified : '—'} hint={data ? `${rows.length - verified} pending` : undefined} />
        <StatCard label="Downloads by accounts" value={data ? totalDownloads : '—'} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a1a1aa]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search email, name, IP or location" className={`${inputClass} pl-9`} />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={`${inputClass} w-auto`} aria-label="Filter">
          <option value="all">All accounts</option>
          <option value="online">Online</option>
          <option value="verified">Verified</option>
          <option value="pending">Pending verification</option>
        </select>
        <span className="text-[12px] text-[#71717a]">{data ? `${filtered.length} of ${rows.length}` : 'Loading…'}</span>
      </div>

      <ErrorBox message={error} />

      <Panel className="mt-4">
        {data === null ? (
          <Empty>Loading users…</Empty>
        ) : filtered.length === 0 ? (
          <Empty>No users match.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[12px]">
              <thead className="border-b border-[#e4e4e7] bg-[#fafafa] text-[11px] uppercase tracking-[0.04em] text-[#71717a]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">User</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Last active</th>
                  <th className="px-4 py-2.5 font-medium">IP / location</th>
                  <th className="px-4 py-2.5 font-medium">Browser / OS</th>
                  <th className="px-4 py-2.5 text-right font-medium">Downloads</th>
                  <th className="px-4 py-2.5 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f1]">
                {filtered.map((row) => {
                  const ua = parseUserAgent(row.user_agent);
                  return (
                    <tr key={row.id} onClick={() => open(row.id)} className="cursor-pointer hover:bg-[#fafafa]">
                      <td className="max-w-[260px] px-4 py-2.5">
                        <p className="flex items-center gap-1.5 truncate font-medium">
                          {row.display_name || row.email.split('@')[0]}
                          {row.is_admin ? <Badge tone="amber">admin</Badge> : null}
                        </p>
                        <p className="truncate text-[10.5px] text-[#71717a]">{row.email}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col items-start gap-1">
                          <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                          {row.confirmed ? null : <Badge tone="amber">unverified</Badge>}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <p>{timeAgo(row.last_active)}</p>
                        <p className="text-[10.5px] text-[#a1a1aa]">{formatWhen(row.last_active)}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-mono text-[11.5px]">{row.ip || '—'}</p>
                        <p className="max-w-[200px] truncate text-[10.5px] text-[#71717a]">{place(row) || '—'}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <p>{ua.browser}</p>
                        <p className="text-[10.5px] text-[#71717a]">{ua.os} · {ua.device}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">{row.downloads}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[#71717a]">{formatWhen(row.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {selected ? <UserDetailDrawer userId={selected} onClose={() => open(null)} /> : null}
    </div>
  );
}
