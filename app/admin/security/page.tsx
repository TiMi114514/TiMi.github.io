'use client';

import { LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  PageHeader,
  Panel,
  RefreshButton,
  StatCard,
  formatWhen,
  parseUserAgent,
  statusTone,
  timeAgo,
  useAdminData,
} from '@/components/admin/ui';
import { getSecurityOverview, revokeSession } from '@/lib/admin-api';
import { supabase } from '@/lib/supabase';

const checks = [
  'Row-level security is enabled on every public table; admin data is only reachable through admin_* RPCs that check is_admin().',
  'Only emails in the admins table can read the dashboard or call admin RPCs.',
  'The Supabase anon key is safe to ship; the service-role key must never reach the browser.',
  'RAGFlow API keys are exposed to the browser in this architecture — rotate them if they leak.',
  'Custom SMTP should be configured before relying on verification and reset emails.',
  'Keep the RAGFlow API behind HTTPS and a reverse proxy; do not expose port 9380 directly.',
];

export default function AdminSecurityPage() {
  const { user, signOut } = useAuth();
  const { data, error, loading, reload } = useAdminData(getSecurityOverview, [], 60_000);

  async function signOutEverywhere() {
    if (!supabase) return;
    if (!window.confirm('Sign out of every device using this account?')) return;
    await supabase.auth.signOut({ scope: 'global' });
    await signOut();
    window.location.href = '/login';
  }

  async function revoke(id: string, email: string | null) {
    if (!window.confirm(`Revoke this session${email ? ` for ${email}` : ''}? The user is signed out when their access token expires (≤ 1 hour).`)) return;
    try {
      await revokeSession(id);
      await reload();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : 'Revoke failed.');
    }
  }

  const sessions = data?.sessions ?? [];
  const events = data?.events ?? [];

  return (
    <div>
      <PageHeader
        title="Security"
        description="Active sign-in sessions, sign-in attempts with IP and user agent, administrators and the checks that protect this deployment."
        actions={<RefreshButton onClick={() => void reload()} loading={loading} />}
      />

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active sessions" value={data ? sessions.length : '—'} tone="green" />
        <StatCard label="Sign-ins (24 h)" value={data?.signins_24h ?? '—'} />
        <StatCard label="Failed sign-ins (24 h)" value={data?.failed_24h ?? '—'} tone={data?.failed_24h ? 'red' : 'default'} />
        <StatCard label="Unverified accounts" value={data?.unconfirmed_users ?? '—'} tone={data?.unconfirmed_users ? 'amber' : 'default'} />
      </div>

      <ErrorBox message={error} />

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel title={<span className="flex items-center gap-2"><UserRound className="h-4 w-4 text-[#71717a]" /> Your admin session</span>}>
          <div className="space-y-2.5 p-5 text-[12px]">
            <div className="flex justify-between gap-3">
              <span className="text-[#71717a]">Email</span>
              <span className="truncate font-medium">{user?.email ?? '—'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[#71717a]">User id</span>
              <span className="truncate font-mono text-[10.5px]">{user?.id ?? '—'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[#71717a]">Last sign-in</span>
              <span>{formatWhen(user?.last_sign_in_at)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[#71717a]">Administrators</span>
              <span>{data?.admins.length ?? '—'}</span>
            </div>
            <Button variant="danger" onClick={() => void signOutEverywhere()}>
              <LogOut className="h-3.5 w-3.5" /> Sign out everywhere
            </Button>
          </div>
        </Panel>

        <Panel title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#71717a]" /> Checks</span>}>
          <ul className="space-y-2 p-5 text-[11.5px] leading-relaxed text-[#52525b]">
            {checks.map((check) => (
              <li key={check} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#16a34a]" />
                <span>{check}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel className="mt-4" title="Active sessions" right={`${sessions.length}`}>
        {data === null ? (
          <Empty>Loading…</Empty>
        ) : sessions.length === 0 ? (
          <Empty>No active sessions.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[12px]">
              <thead className="border-b border-[#e4e4e7] bg-[#fafafa] text-[11px] uppercase tracking-[0.04em] text-[#71717a]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">User</th>
                  <th className="px-4 py-2.5 font-medium">IP</th>
                  <th className="px-4 py-2.5 font-medium">Browser / OS</th>
                  <th className="px-4 py-2.5 font-medium">Signed in</th>
                  <th className="px-4 py-2.5 font-medium">Last refresh</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f1]">
                {sessions.map((session) => {
                  const ua = parseUserAgent(session.user_agent);
                  return (
                    <tr key={session.id} className="hover:bg-[#fafafa]">
                      <td className="max-w-[240px] px-4 py-2.5">
                        <p className="truncate font-medium">{session.email}</p>
                        <p className="flex gap-1.5 text-[10.5px] text-[#a1a1aa]">
                          {session.is_admin ? <Badge tone="amber">admin</Badge> : null}
                          <span className="font-mono">{session.aal}</span>
                        </p>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11.5px]">{session.ip || '—'}</td>
                      <td className="px-4 py-2.5" title={session.user_agent ?? ''}>
                        <p>{ua.browser}</p>
                        <p className="text-[10.5px] text-[#71717a]">
                          {ua.os} · {ua.device}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[#71717a]">{formatWhen(session.created_at)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[#71717a]">{timeAgo(session.refreshed_at ?? session.updated_at)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button variant="danger" onClick={() => void revoke(session.id, session.email)}>
                          Revoke
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="mt-4" title="Security events" right={`${events.length} latest`}>
        {data === null ? (
          <Empty>Loading…</Empty>
        ) : events.length === 0 ? (
          <Empty>No events yet. Sign-ins, failed attempts, sign-ups and password resets appear here.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[12px]">
              <thead className="border-b border-[#e4e4e7] bg-[#fafafa] text-[11px] uppercase tracking-[0.04em] text-[#71717a]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Time</th>
                  <th className="px-4 py-2.5 font-medium">Event</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">IP</th>
                  <th className="px-4 py-2.5 font-medium">Browser / OS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f1]">
                {events.map((event) => {
                  const ua = parseUserAgent(event.user_agent);
                  return (
                    <tr key={event.id} className="hover:bg-[#fafafa]">
                      <td className="whitespace-nowrap px-4 py-2.5 text-[#71717a]">{formatWhen(event.created_at)}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={statusTone(event.kind)}>{event.kind.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-2.5">{event.email || '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-[11.5px]">{event.ip || '—'}</td>
                      <td className="px-4 py-2.5" title={event.user_agent ?? ''}>
                        {ua.browser} · {ua.os}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="mt-4" title="Administrators">
        <div className="divide-y divide-[#f0f0f1]">
          {(data?.admins ?? []).map((admin) => (
            <div key={admin.email} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <span className="truncate text-[12px]">{admin.email}</span>
              <span className="text-[10.5px] text-[#a1a1aa]">added {formatWhen(admin.created_at)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
