'use client';

import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Search } from 'lucide-react';
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  PageHeader,
  Panel,
  RefreshButton,
  downloadCsv,
  formatWhen,
  inputClass,
} from '@/components/admin/ui';
import { getLogs, type LogEvent, type LogKind } from '@/lib/admin-api';

const KINDS: { value: LogKind; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'page_view', label: 'Page views' },
  { value: 'download', label: 'Downloads' },
  { value: 'security', label: 'Security' },
  { value: 'admin', label: 'Admin actions' },
  { value: 'email', label: 'Emails' },
];

const KIND_TONE: Record<LogEvent['kind'], 'gray' | 'blue' | 'green' | 'amber' | 'red'> = {
  page_view: 'gray',
  download: 'blue',
  security: 'red',
  admin: 'amber',
  email: 'green',
};

export default function AdminLogsPage() {
  const [kind, setKind] = useState<LogKind>('all');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [items, setItems] = useState<LogEvent[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load(reset: boolean) {
    setLoading(true);
    try {
      const result = await getLogs({ kind, search: applied, limit: 100, before: reset ? null : nextBefore });
      setItems((prev) => (reset || !prev ? result.items : [...prev, ...result.items]));
      setNextBefore(result.items.length === 100 ? result.next_before : null);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load logs.');
      if (reset) setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, applied]);

  function exportCsv() {
    downloadCsv(
      `logs-${kind}-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Time', 'Kind', 'Actor', 'Subject', 'Detail'],
      (items ?? []).map((row) => [row.at, row.kind, row.actor, row.subject, JSON.stringify(row.detail ?? {})]),
    );
  }

  return (
    <div>
      <PageHeader
        title="Logs"
        description="One stream for page views, downloads (account and guest), security events, admin actions and email forwards — served by the admin_logs endpoint."
        actions={
          <>
            <Button onClick={exportCsv} disabled={!items?.length}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <RefreshButton onClick={() => void load(true)} loading={loading} />
          </>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-[#e4e4e7] bg-white p-0.5">
          {KINDS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setKind(item.value)}
              className={`rounded-md px-3 py-1.5 text-[12px] ${kind === item.value ? 'bg-[#18181b] text-white' : 'text-[#52525b] hover:bg-[#f4f4f5]'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <form
          className="relative min-w-[240px] flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            setApplied(search.trim());
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a1a1aa]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search path, file, email, IP, action… (Enter)"
            className={`${inputClass} pl-9`}
          />
        </form>
      </div>

      <ErrorBox message={error} />

      <Panel className="mt-4" title="Events" right={`${items?.length ?? 0} loaded`}>
        {items === null ? (
          <Empty>Loading…</Empty>
        ) : items.length === 0 ? (
          <Empty>No events match.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[12px]">
              <thead className="border-b border-[#e4e4e7] bg-[#fafafa] text-[11px] uppercase tracking-[0.04em] text-[#71717a]">
                <tr>
                  <th className="w-8 px-3 py-2.5" />
                  <th className="px-3 py-2.5 font-medium">Time</th>
                  <th className="px-3 py-2.5 font-medium">Kind</th>
                  <th className="px-3 py-2.5 font-medium">Subject</th>
                  <th className="px-3 py-2.5 font-medium">Actor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f1]">
                {items.map((row) => {
                  const open = expanded === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr className="cursor-pointer hover:bg-[#fafafa]" onClick={() => setExpanded(open ? null : row.id)}>
                        <td className="px-3 py-2 text-[#a1a1aa]">{open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-[#71717a]">{formatWhen(row.at)}</td>
                        <td className="px-3 py-2">
                          <Badge tone={KIND_TONE[row.kind]}>{row.kind.replace('_', ' ')}</Badge>
                        </td>
                        <td className="max-w-[420px] truncate px-3 py-2" title={row.subject ?? ''}>
                          {row.subject || '—'}
                        </td>
                        <td className="max-w-[240px] truncate px-3 py-2 font-mono text-[11px] text-[#52525b]" title={row.actor ?? ''}>
                          {row.actor || '—'}
                        </td>
                      </tr>
                      {open ? (
                        <tr className="bg-[#fafafa]">
                          <td />
                          <td colSpan={4} className="px-3 pb-3">
                            <pre className="overflow-x-auto rounded-lg border border-[#e4e4e7] bg-white p-3 font-mono text-[10.5px] leading-relaxed">
                              {JSON.stringify(row.detail ?? {}, null, 2)}
                            </pre>
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
        {nextBefore ? (
          <div className="border-t border-[#e4e4e7] px-5 py-3 text-center">
            <Button onClick={() => void load(false)} disabled={loading}>
              {loading ? 'Loading…' : 'Load older'}
            </Button>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
