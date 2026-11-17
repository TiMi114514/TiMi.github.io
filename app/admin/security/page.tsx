'use client';

import { useEffect, useState } from 'react';
import { LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';

type AdminRow = { email: string; created_at: string };
type AuditRow = {
  id: number;
  admin_email: string | null;
  action: string;
  target: string | null;
  details: unknown;
  created_at: string;
};

const checks = [
  'Row-level security is enabled on profiles, papers, downloads, page_views and admin tables.',
  'Only emails in the admins table can read the dashboard or call admin RPCs.',
  'The Supabase anon key is safe to ship; the service-role key must never reach the browser.',
  'RAGFlow API keys are exposed to the browser in this architecture — rotate them if they leak.',
  'Custom SMTP should be configured before relying on verification and reset emails.',
  'Keep the RAGFlow API behind HTTPS and a reverse proxy; do not expose port 9380 directly.',
];

export default function AdminSecurityPage() {
  const { user, signOut } = useAuth();
  const [admins, setAdmins] = useState<AdminRow[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    Promise.all([
      supabase.from('admins').select('email, created_at').order('created_at'),
      supabase
        .from('admin_audit_log')
        .select('id, admin_email, action, target, details, created_at')
        .order('created_at', { ascending: false })
        .limit(50),
    ]).then(([adminRows, auditRows]) => {
      if (!active) return;
      setAdmins((adminRows.data as AdminRow[] | null) ?? []);
      setAudit((auditRows.data as AuditRow[] | null) ?? []);
    });
    return () => {
      active = false;
    };
  }, []);

  async function signOutEverywhere() {
    if (!supabase) return;
    if (!window.confirm('Sign out of every device using this account?')) return;
    await supabase.auth.signOut({ scope: 'global' });
    await signOut();
    window.location.href = '/login';
  }

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] sm:text-[32px]">Security</h1>
      <p className="mt-1 text-[13px] text-[#71717a]">
        Administrator access, recent audit events and the checks that protect this deployment.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-xl border border-[#e4e4e7] bg-white">
          <div className="flex items-center gap-2 border-b border-[#e4e4e7] px-5 py-3.5">
            <UserRound className="h-4 w-4 text-[#71717a]" />
            <h2 className="text-[14px] font-semibold">Your admin session</h2>
          </div>
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
              <span>{user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : '—'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[#71717a]">Administrators</span>
              <span>{admins?.length ?? '—'}</span>
            </div>
            <button
              type="button"
              onClick={() => void signOutEverywhere()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[11.5px] text-[#b91c1c] hover:bg-[#fee2e2]"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out everywhere
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-[#e4e4e7] bg-white">
          <div className="flex items-center gap-2 border-b border-[#e4e4e7] px-5 py-3.5">
            <ShieldCheck className="h-4 w-4 text-[#71717a]" />
            <h2 className="text-[14px] font-semibold">Checks</h2>
          </div>
          <ul className="space-y-2 p-5 text-[11.5px] leading-relaxed text-[#52525b]">
            {checks.map((check) => (
              <li key={check} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#16a34a]" />
                <span>{check}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-4 overflow-hidden rounded-xl border border-[#e4e4e7] bg-white">
        <div className="flex items-center justify-between border-b border-[#e4e4e7] px-5 py-3.5">
          <h2 className="text-[14px] font-semibold">Audit log</h2>
          <span className="text-[11px] text-[#a1a1aa]">{audit?.length ?? 0} events</span>
        </div>
        {audit === null ? (
          <p className="px-5 py-8 text-center text-[12px] text-[#a1a1aa]">Loading…</p>
        ) : audit.length === 0 ? (
          <p className="px-5 py-8 text-center text-[12px] text-[#a1a1aa]">
            No admin actions recorded yet. Approvals, paper changes and admin edits appear here.
          </p>
        ) : (
          <div className="divide-y divide-[#f0f0f1]">
            {audit.map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium">
                    {event.action}
                    {event.target ? <span className="text-[#71717a]"> · {event.target}</span> : null}
                  </p>
                  <p className="truncate text-[10.5px] text-[#a1a1aa]">
                    {event.admin_email || 'Unknown admin'}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-[#a1a1aa]">
                  {new Date(event.created_at).toLocaleString('en-US', {
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
      </section>

      <section className="mt-4 rounded-xl border border-[#e4e4e7] bg-white">
        <h2 className="border-b border-[#e4e4e7] px-5 py-3.5 text-[14px] font-semibold">
          Administrators
        </h2>
        <div className="divide-y divide-[#f0f0f1]">
          {(admins ?? []).map((admin) => (
            <div key={admin.email} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <span className="truncate text-[12px]">{admin.email}</span>
              <span className="text-[10.5px] text-[#a1a1aa]">
                added {new Date(admin.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
