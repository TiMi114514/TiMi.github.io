'use client';

import { useState } from 'react';
import { BellRing, Mail, Send } from 'lucide-react';
import { Badge, Button, Empty, ErrorBox, PageHeader, Panel, RefreshButton, formatWhen, inputClass, timeAgo, useAdminData } from '@/components/admin/ui';
import { supabase } from '@/lib/supabase';

type AlertState = { key: string; status: string; summary: string | null; opened_at: string | null; last_failed_at: string | null; fail_count: number };
type AlertEvent = { id: number; key: string; kind: 'opened' | 'reminder' | 'resolved' | 'test'; summary: string | null; email_status: string | null; created_at: string };
type Overview = {
  config: { enabled: boolean; recipients: string[]; from: string; public_url: string; host_stale_minutes: number; confirm_checks: number; reminder_hours: number; resource_pct: number };
  email_configured: boolean;
  watcher_scheduled: boolean;
  open: AlertState[];
  pending: AlertState[];
  events: AlertEvent[];
  generated_at: string;
};

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.code === '42501' ? 'Admin access required.' : error.message);
  return data as T;
}

const KIND_TONE: Record<AlertEvent['kind'], 'red' | 'amber' | 'green' | 'blue'> = { opened: 'red', reminder: 'amber', resolved: 'green', test: 'blue' };

export default function AdminAlertsPage() {
  const { data, error, loading, reload } = useAdminData(() => rpc<Overview>('admin_alerts'), [], 30_000);
  const [recipients, setRecipients] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveRecipients() {
    const list = (recipients ?? '').split(/[,\s;]+/).map((s) => s.trim()).filter(Boolean);
    setBusy(true);
    setNote(null);
    try {
      await rpc('admin_alert_config', { p_value: { recipients: list } });
      setRecipients(null);
      setNote('Recipients saved.');
      await reload();
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(enabled: boolean) {
    await rpc('admin_alert_config', { p_value: { enabled } }).catch(() => undefined);
    await reload();
  }

  async function test() {
    setBusy(true);
    setNote(null);
    try {
      await rpc('admin_alert_test');
      setNote(data?.email_configured ? 'Test email queued — it should arrive within a minute (check spam the first time).' : 'Test recorded, but no email provider key is set yet.');
      await reload();
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : 'Test failed.');
    } finally {
      setBusy(false);
    }
  }

  const cfg = data?.config;

  return (
    <div>
      <PageHeader
        title="Alerts"
        description="Outage alerts run inside Supabase every minute, so they still fire when the home PC is off or offline. An alert opens after 2 failed checks in a row, emails the admins once, reminds every 6 hours while it lasts, and sends one email when it recovers."
        actions={<RefreshButton onClick={() => void reload()} loading={loading} />}
      />
      <ErrorBox message={error} />

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {[
          ['Watcher', data ? (data.watcher_scheduled ? 'running every minute' : 'NOT scheduled') : '—', data?.watcher_scheduled ? 'green' : 'red'],
          ['Email provider', data ? (data.email_configured ? ((data as { email_provider?: string }).email_provider ?? 'SMTP') + ' connected' : 'not connected') : '—', data?.email_configured ? 'green' : 'amber'],
          ['Open alerts', data ? String(data.open.length) : '—', data?.open.length ? 'red' : 'green'],
          ['Alerts', cfg ? (cfg.enabled ? 'enabled' : 'paused') : '—', cfg?.enabled ? 'green' : 'amber'],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-xl border border-[#e4e4e7] bg-white px-4 py-3.5">
            <p className="text-[11.5px] text-[#71717a]">{label}</p>
            <p className="mt-1.5"><Badge tone={tone as 'green' | 'red' | 'amber'}>{value}</Badge></p>
          </div>
        ))}
      </div>

      {data && !data.email_configured ? (
        <div className="mt-4 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[12.5px] leading-relaxed text-[#92400e]">
          Alerts are being recorded below but no email is sent yet. Set up the default SMTP server (Outlook.com) under Admin &gt; 服务配置 and connect it — alert emails are then sent from the cloud.
        </div>
      ) : null}

      <Panel className="mt-4" title={<span className="flex items-center gap-2"><BellRing className="h-4 w-4 text-[#71717a]" /> Open alerts</span>} right={`${data?.open.length ?? 0}`}>
        {!data ? <Empty>Loading…</Empty> : data.open.length === 0 ? (
          <Empty>Everything is up. {data.pending.length ? `${data.pending.length} check(s) failed once and are being re-checked.` : ''}</Empty>
        ) : (
          <div className="divide-y divide-[#f0f0f1]">
            {data.open.map((a) => (
              <div key={a.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[12.5px]">
                <div className="min-w-0">
                  <p className="font-medium text-[#b91c1c]">{a.summary}</p>
                  <p className="font-mono text-[10.5px] text-[#a1a1aa]">{a.key}</p>
                </div>
                <span className="text-[11px] text-[#71717a]">down since {formatWhen(a.opened_at)} ({timeAgo(a.opened_at)})</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Panel title={<span className="flex items-center gap-2"><Mail className="h-4 w-4 text-[#71717a]" /> Delivery</span>}>
          <div className="space-y-3 p-5 text-[12px]">
            <label className="block space-y-1">
              <span className="text-[#71717a]">Recipients (comma separated)</span>
              <input
                value={recipients ?? cfg?.recipients.join(', ') ?? ''}
                onChange={(e) => setRecipients(e.target.value)}
                className={inputClass}
              />
            </label>
            <p className="text-[11px] text-[#a1a1aa]">Sent through the default SMTP server configured in 服务配置.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="dark" onClick={() => void saveRecipients()} disabled={busy || recipients === null}>Save recipients</Button>
              <Button onClick={() => void test()} disabled={busy}><Send className="h-3.5 w-3.5" /> Send test email</Button>
              {cfg ? <Button onClick={() => void toggle(!cfg.enabled)}>{cfg.enabled ? 'Pause alerts' : 'Resume alerts'}</Button> : null}
            </div>
            {note ? <p className="text-[11.5px] text-[#52525b]">{note}</p> : null}
            <dl className="grid grid-cols-[150px_1fr] gap-y-1 border-t border-[#f0f0f1] pt-3 text-[11.5px]">
              <dt className="text-[#71717a]">Host silent after</dt><dd>{cfg?.host_stale_minutes} min</dd>
              <dt className="text-[#71717a]">Confirm with</dt><dd>{cfg?.confirm_checks} failed checks in a row</dd>
              <dt className="text-[#71717a]">Reminder every</dt><dd>{cfg?.reminder_hours} h</dd>
              <dt className="text-[#71717a]">CPU / memory / disk</dt><dd>≥ {cfg?.resource_pct}%</dd>
              <dt className="text-[#71717a]">Public probe</dt><dd className="break-all font-mono text-[10.5px]">{cfg?.public_url}</dd>
            </dl>
          </div>
        </Panel>

        <Panel title="History" right={`${data?.events.length ?? 0} latest`}>
          {!data ? <Empty>Loading…</Empty> : data.events.length === 0 ? <Empty>No alerts yet.</Empty> : (
            <div className="max-h-[420px] divide-y divide-[#f0f0f1] overflow-y-auto">
              {data.events.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-3 px-5 py-2.5 text-[12px]">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2"><Badge tone={KIND_TONE[e.kind]}>{e.kind}</Badge><span className="truncate">{e.summary}</span></p>
                    <p className="mt-0.5 font-mono text-[10.5px] text-[#a1a1aa]">{e.key} · email {e.email_status ?? '—'}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-[#71717a]">{formatWhen(e.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
