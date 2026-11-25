'use client';

import { useMemo, useState } from 'react';
import { Check, Download, EyeOff, ImageUp, RotateCcw, Search, X } from 'lucide-react';
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
  useAdminData,
} from '@/components/admin/ui';
import { supabase } from '@/lib/supabase';
import { formatMoney, qrUrl, type Currency } from '@/lib/donations';

type AdminDonation = {
  id: number;
  public_id: string;
  kind: 'donation' | 'message';
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  anonymous: boolean;
  amount: number | null;
  currency: Currency | null;
  method: string | null;
  message: string | null;
  reference: string | null;
  status: 'pending' | 'confirmed' | 'rejected' | 'hidden';
  ip: string | null;
  user_agent: string | null;
  visitor_id: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

type Result = { items: AdminDonation[]; total: number; pending: number };

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.code === '42501' ? 'Admin access required.' : error.message);
  return data as T;
}

function QrUploader({ method, label }: { method: 'wechat' | 'alipay'; label: string }) {
  const [version, setVersion] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !supabase) return;
    if (file.size > 2 * 1024 * 1024) return setError('Max 2 MB.');
    setBusy(true);
    setError(null);
    const { error: uploadError } = await supabase.storage
      .from('site-assets')
      .upload(`donate/${method}.png`, file, { upsert: true, contentType: file.type, cacheControl: '60' });
    setBusy(false);
    if (uploadError) return setError(uploadError.message);
    setMissing(false);
    setVersion(Date.now());
  }

  const src = qrUrl(method, version);
  return (
    <div className="flex items-center gap-4">
      <div className="grid h-[104px] w-[104px] shrink-0 place-items-center overflow-hidden rounded-lg border border-[#e4e4e7] bg-[#fafafa]">
        {src && !missing ? (
          <img key={version} src={src} alt={label} className="h-full w-full object-contain" onError={() => setMissing(true)} />
        ) : (
          <span className="text-[10.5px] text-[#a1a1aa]">not uploaded</span>
        )}
      </div>
      <div className="space-y-1.5 text-[12px]">
        <p className="font-medium">{label}</p>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#e4e4e7] bg-white px-3 py-1.5 text-[12px] text-[#3f3f46] hover:bg-[#fafafa]">
          <ImageUp className="h-3.5 w-3.5" /> {busy ? 'Uploading…' : missing ? 'Upload QR' : 'Replace QR'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void upload(e)} disabled={busy} />
        </label>
        {error ? <p className="text-[11px] text-[#b91c1c]">{error}</p> : <p className="text-[10.5px] text-[#a1a1aa]">PNG / JPG / WebP, ≤ 2 MB. Shown on /donate.</p>}
      </div>
    </div>
  );
}

export default function AdminDonationsPage() {
  const [status, setStatus] = useState<'all' | AdminDonation['status']>('pending');
  const [kind, setKind] = useState<'all' | 'donation' | 'message'>('all');
  const [query, setQuery] = useState('');
  const { data, error, loading, reload } = useAdminData(
    () => rpc<Result>('admin_donations', { p_status: status === 'all' ? null : status, p_limit: 500 }),
    [status],
    30_000,
  );

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.items ?? []).filter((row) => {
      if (kind !== 'all' && row.kind !== kind) return false;
      if (!needle) return true;
      return [row.public_id, row.display_name, row.email, row.message, row.reference, row.ip]
        .some((value) => (value ?? '').toLowerCase().includes(needle));
    });
  }, [data, kind, query]);

  const confirmed = items.filter((row) => row.kind === 'donation' && row.status === 'confirmed');
  const sum = (cur: Currency) => confirmed.filter((row) => row.currency === cur).reduce((s, row) => s + Number(row.amount ?? 0), 0);

  async function review(row: AdminDonation, next: AdminDonation['status']) {
    try {
      await rpc('admin_donation_review', { p_id: row.id, p_status: next });
      await reload();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : 'Update failed.');
    }
  }

  function exportCsv() {
    downloadCsv(
      `donations-${new Date().toISOString().slice(0, 10)}.csv`,
      ['ID', 'Type', 'Status', 'Name', 'Anonymous', 'Email', 'Amount', 'Currency', 'Method', 'Reference', 'Message', 'IP', 'Submitted', 'Reviewed by'],
      items.map((row) => [row.public_id, row.kind, row.status, row.display_name, row.anonymous ? 'yes' : 'no', row.email, row.amount, row.currency, row.method, row.reference, row.message, row.ip, row.created_at, row.reviewed_by]),
    );
  }

  return (
    <div>
      <PageHeader
        title="Donations"
        description="Donors pay with the QR codes on /donate and then submit the form. Check the payment in WeChat / Alipay, then confirm it here — only confirmed gifts are shown publicly and counted in the top 3. Messages are published immediately; hide any you don't want on the wall."
        actions={
          <>
            <Button onClick={exportCsv} disabled={items.length === 0}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <RefreshButton onClick={() => void reload()} loading={loading} />
          </>
        }
      />

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Waiting for review" value={data?.pending ?? '—'} tone={data?.pending ? 'amber' : 'default'} />
        <StatCard label="Shown" value={data ? items.length : '—'} hint={status === 'all' ? 'all statuses' : status} />
        <StatCard label="Confirmed CNY (shown)" value={data ? formatMoney(sum('CNY'), 'CNY', 'en-US') : '—'} tone="green" />
        <StatCard label="Confirmed USD (shown)" value={data ? formatMoney(sum('USD'), 'USD', 'en-US') : '—'} tone="green" />
      </div>

      <Panel className="mt-4" title="Payment QR codes">
        <div className="grid gap-5 p-5 md:grid-cols-2">
          <QrUploader method="wechat" label="WeChat Pay" />
          <QrUploader method="alipay" label="Alipay" />
        </div>
      </Panel>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-[#e4e4e7] bg-white p-0.5">
          {(['pending', 'confirmed', 'rejected', 'hidden', 'all'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={`rounded-md px-3 py-1.5 text-[12px] capitalize ${status === value ? 'bg-[#18181b] text-white' : 'text-[#52525b] hover:bg-[#f4f4f5]'}`}
            >
              {value}
            </button>
          ))}
        </div>
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={`${inputClass} w-auto`}>
          <option value="all">Donations and messages</option>
          <option value="donation">Donations</option>
          <option value="message">Messages only</option>
        </select>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a1a1aa]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search id, name, email, reference, message, IP" className={`${inputClass} pl-9`} />
        </div>
      </div>

      <ErrorBox message={error} />

      <Panel className="mt-4">
        {data === null ? (
          <Empty>Loading…</Empty>
        ) : items.length === 0 ? (
          <Empty>Nothing here.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-[12px]">
              <thead className="border-b border-[#e4e4e7] bg-[#fafafa] text-[11px] uppercase tracking-[0.04em] text-[#71717a]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">ID / status</th>
                  <th className="px-4 py-2.5 font-medium">From</th>
                  <th className="px-4 py-2.5 font-medium">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Reference</th>
                  <th className="px-4 py-2.5 font-medium">Message</th>
                  <th className="px-4 py-2.5 font-medium">IP / device</th>
                  <th className="px-4 py-2.5 font-medium">Submitted</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f1]">
                {items.map((row) => {
                  const ua = parseUserAgent(row.user_agent);
                  return (
                    <tr key={row.id} className="align-top hover:bg-[#fafafa]">
                      <td className="px-4 py-2.5">
                        <p className="font-mono text-[11.5px] font-medium">#{row.public_id}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge tone={statusTone(row.status === 'confirmed' ? 'active' : row.status === 'hidden' ? 'disabled' : row.status)}>{row.status}</Badge>
                          {row.kind === 'message' ? <Badge tone="blue">message</Badge> : null}
                        </div>
                      </td>
                      <td className="max-w-[200px] px-4 py-2.5">
                        <p className="truncate font-medium">{row.display_name || '—'}</p>
                        <p className="truncate text-[10.5px] text-[#71717a]">{row.email || 'guest'}</p>
                        {row.anonymous ? <Badge tone="gray">anonymous</Badge> : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {row.amount && row.currency ? (
                          <>
                            <p className="font-semibold tabular-nums">{formatMoney(Number(row.amount), row.currency, 'en-US')}</p>
                            <p className="text-[10.5px] text-[#71717a]">{row.method}</p>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px]">{row.reference || '—'}</td>
                      <td className="max-w-[280px] px-4 py-2.5">
                        <p className="line-clamp-3 whitespace-pre-wrap break-words text-[11.5px]" title={row.message ?? ''}>
                          {row.message || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-mono text-[11px]">{row.ip || '—'}</p>
                        <p className="text-[10.5px] text-[#71717a]">{ua.browser} · {ua.os}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[#71717a]">
                        {formatWhen(row.created_at)}
                        {row.reviewed_by ? <p className="text-[10.5px] text-[#a1a1aa]">by {row.reviewed_by}</p> : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <div className="inline-flex gap-1">
                          {row.status !== 'confirmed' ? (
                            <Button onClick={() => void review(row, 'confirmed')} title={row.kind === 'message' ? 'Show on wall' : 'Payment received'}>
                              <Check className="h-3.5 w-3.5 text-[#15803d]" /> {row.kind === 'message' ? 'Show' : 'Confirm'}
                            </Button>
                          ) : null}
                          {row.kind === 'donation' && row.status === 'pending' ? (
                            <Button variant="danger" onClick={() => void review(row, 'rejected')} title="Payment not found">
                              <X className="h-3.5 w-3.5" /> Reject
                            </Button>
                          ) : null}
                          {row.status === 'confirmed' ? (
                            <Button onClick={() => void review(row, 'hidden')} title="Remove from the public wall">
                              <EyeOff className="h-3.5 w-3.5" /> Hide
                            </Button>
                          ) : null}
                          {row.status === 'rejected' || row.status === 'hidden' ? (
                            <Button onClick={() => void review(row, 'pending')} title="Back to pending">
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
