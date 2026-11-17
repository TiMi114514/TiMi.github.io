'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ConnectionSettings } from '@/components/ConnectionSettings';
import { ConnectionTests } from '@/components/admin/ConnectionTests';
import { useAuth } from '@/components/AuthProvider';
import { logAdminAction } from '@/lib/admin-audit';
import { supabase } from '@/lib/supabase';

type AdminRow = { email: string; created_at: string };

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminRow[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const ragflowBase = process.env.NEXT_PUBLIC_RAGFLOW_BASE_URL || 'http://localhost:9380';
  const chatId = process.env.NEXT_PUBLIC_RAGFLOW_CHAT_ID || '';
  const datasetIds = (process.env.NEXT_PUBLIC_RAGFLOW_DATASET_ID || '')
    .split(',')
    .filter(Boolean);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('admins')
      .select('email, created_at')
      .order('created_at', { ascending: true });
    if (error) {
      setMessage(error.message);
      setAdmins([]);
      return;
    }
    setAdmins((data as AdminRow[] | null) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function addAdmin(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const candidate = email.trim().toLowerCase();
    if (!candidate || !candidate.includes('@')) {
      setMessage('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.from('admins').insert({ email: candidate });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setEmail('');
    setMessage(`${candidate} can now open the admin dashboard once signed in.`);
    void logAdminAction('add_admin', candidate);
    await load();
  }

  async function removeAdmin(row: AdminRow) {
    if (!supabase) return;
    if (!window.confirm(`Remove admin access for ${row.email}?`)) return;
    const { error } = await supabase.from('admins').delete().eq('email', row.email);
    if (error) setMessage(error.message);
    else {
      void logAdminAction('remove_admin', row.email);
      await load();
    }
  }

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] sm:text-[32px]">Settings</h1>
      <p className="mt-1 text-[13px] text-[#71717a]">
        Administrators and the connections this deployment uses.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ConnectionTests />
        <section className="rounded-xl border border-[#e4e4e7] bg-white">
          <h2 className="border-b border-[#e4e4e7] px-5 py-3.5 text-[14px] font-semibold">
            Administrators
          </h2>
          <form onSubmit={addAdmin} className="flex gap-2 px-5 py-4">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="new-admin@example.com"
              className="min-w-0 flex-1 rounded-lg border border-[#e4e4e7] px-3 py-2 text-[12.5px] outline-none focus:border-[#a1a1aa]"
            />
            <button
              type="submit"
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#18181b] px-3 py-2 text-[12px] font-medium text-white disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </form>

          <div className="divide-y divide-[#f0f0f1] border-t border-[#f0f0f1]">
            {admins === null ? (
              <p className="px-5 py-6 text-center text-[12px] text-[#a1a1aa]">Loading…</p>
            ) : admins.length === 0 ? (
              <p className="px-5 py-6 text-center text-[12px] text-[#a1a1aa]">No administrators.</p>
            ) : (
              admins.map((row) => (
                <div key={row.email} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium">{row.email}</p>
                    <p className="text-[10.5px] text-[#a1a1aa]">
                      {row.email === user?.email ? 'You' : 'Administrator'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeAdmin(row)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-[#b91c1c] hover:bg-[#fef2f2]"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              ))
            )}
          </div>

          {message ? (
            <p className="border-t border-[#f0f0f1] px-5 py-3 text-[11.5px] leading-relaxed text-[#52525b]">
              {message}
            </p>
          ) : null}
        </section>

        <section className="rounded-xl border border-[#e4e4e7] bg-white p-5">
          <h2 className="text-[14px] font-semibold">Deployment</h2>
          <dl className="mt-4 space-y-3 text-[12.5px]">
            <div className="flex items-start justify-between gap-4">
              <dt className="text-[#71717a]">Supabase</dt>
              <dd className="max-w-[240px] truncate text-right">{supabaseUrl || 'Not configured'}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-[#71717a]">RAGFlow API</dt>
              <dd className="max-w-[240px] truncate text-right">{ragflowBase}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-[#71717a]">Chat assistant</dt>
              <dd className="max-w-[240px] truncate text-right">{chatId || 'Not configured'}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-[#71717a]">Knowledge bases</dt>
              <dd className="text-right">{datasetIds.length}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-[#71717a]">Site</dt>
              <dd className="max-w-[240px] truncate text-right">GitHub Pages</dd>
            </div>
          </dl>

          <p className="mt-5 rounded-lg bg-[#f4f4f5] px-3.5 py-3 text-[11.5px] leading-relaxed text-[#52525b]">
            These values are compiled into the static build from GitHub Actions variables. Change
            them in the repository settings and redeploy. The RAGFlow API key is never rendered
            here.
          </p>

          <p className="mt-3 text-[11.5px] leading-relaxed text-[#a1a1aa]">
            Admin access is enforced in Postgres: <code className="rounded bg-[#f4f4f5] px-1">is_admin()</code>{' '}
            checks the signed-in JWT email against the <code className="rounded bg-[#f4f4f5] px-1">admins</code>{' '}
            table, and RLS blocks everything else.
          </p>
        </section>
      </div>

      <section className="mt-4">
        <h2 className="text-[14px] font-semibold">RAGFlow connection</h2>
        <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-[#71717a]">
          Admin-only override for this browser. Visitors always use the values compiled into the
          build, so the connection panel is no longer shown on the tutor page.
        </p>
        <div className="mt-3">
          <ConnectionSettings />
        </div>
      </section>
    </div>
  );
}
