'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ExternalLink, MapPin, X } from 'lucide-react';
import {
  Badge,
  Empty,
  ErrorBox,
  formatWhen,
  parseUserAgent,
  statusTone,
  timeAgo,
  useAdminData,
} from '@/components/admin/ui';
import { getUserDetail, lookupIp, revokeSession, type IpLocation } from '@/lib/admin-api';

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-[#e4e4e7] px-5 py-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[12.5px] font-semibold">{title}</h3>
        {right ? <span className="text-[11px] text-[#a1a1aa]">{right}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-3 py-1 text-[12px]">
      <span className="text-[#71717a]">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

/** Real-world place for an IP, resolved on demand (cached). */
function IpPlace({ ip }: { ip: string | null }) {
  const [loc, setLoc] = useState<IpLocation | null | undefined>(undefined);
  useEffect(() => {
    if (!ip) return;
    let alive = true;
    setLoc(undefined);
    lookupIp(ip).then((result) => alive && setLoc(result));
    return () => {
      alive = false;
    };
  }, [ip]);
  if (!ip) return <span className="text-[#a1a1aa]">—</span>;
  if (loc === undefined) return <span className="text-[#a1a1aa]">locating…</span>;
  if (loc === null) return <span className="text-[#a1a1aa]">unknown</span>;
  const place = Array.from(new Set([loc.country, loc.region, loc.city].filter(Boolean))).join(' · ');
  return (
    <span>
      {place || 'unknown'}
      {loc.isp ? <span className="block text-[10.5px] text-[#a1a1aa]">{loc.isp}{loc.asn ? ` · AS${loc.asn}` : ''}</span> : null}
    </span>
  );
}

export function UserDetailDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { data, error, reload } = useAdminData(() => getUserDetail(userId), [userId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const latest = data?.presence[0];
  const latestSession = data?.sessions[0];
  const ip = latest?.ip ?? latestSession?.ip ?? null;
  const ua = latest?.user_agent ?? latestSession?.user_agent ?? null;
  const parsed = parseUserAgent(ua);
  const lastActive = [latest?.last_seen, latestSession?.refreshed_at, latestSession?.updated_at, data?.user.last_sign_in_at]
    .filter(Boolean)
    .sort()
    .pop() as string | undefined;

  // Every distinct IP seen for this account, newest first.
  const ips = Array.from(
    new Set([...(data?.presence ?? []).map((p) => p.ip), ...(data?.sessions ?? []).map((s) => s.ip), ...(data?.security_events ?? []).map((e) => e.ip)].filter(Boolean) as string[]),
  );

  async function revoke(id: string) {
    if (!window.confirm('Revoke this session? The user is signed out when the access token expires (≤ 1 hour).')) return;
    try {
      await revokeSession(id);
      await reload();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : 'Revoke failed.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <aside
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full max-w-[620px] flex-col overflow-y-auto border-l border-[#e4e4e7] bg-white shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[#e4e4e7] bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
              {data?.user.display_name || data?.user.email || 'User'}
              {data?.user.is_admin ? <Badge tone="amber">admin</Badge> : null}
              {data ? <Badge tone={data.user.confirmed ? 'green' : 'amber'}>{data.user.confirmed ? 'verified' : 'unverified'}</Badge> : null}
              {latest ? <Badge tone={statusTone(latest.status)}>{latest.status}</Badge> : null}
            </h2>
            <p className="truncate text-[12px] text-[#71717a]">{data?.user.email}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-[#71717a] hover:bg-[#f4f4f5]" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error ? <div className="px-5"><ErrorBox message={error} /></div> : null}
        {data === null && !error ? <Empty>Loading…</Empty> : null}

        {data ? (
          <>
            <div className="grid grid-cols-3 gap-2 px-5 py-4">
              {[
                ['Downloads', data.download_count],
                ['Page views', data.page_view_count],
                ['Last active', timeAgo(lastActive)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-[#e4e4e7] px-3 py-2.5">
                  <p className="text-[10.5px] text-[#71717a]">{label}</p>
                  <p className="mt-0.5 text-[18px] font-semibold tabular-nums leading-tight">{value}</p>
                </div>
              ))}
            </div>

            <Section title="Account">
              <Row label="User id"><span className="font-mono text-[11px]">{data.user.id}</span></Row>
              <Row label="Sign-in method">{data.user.provider ?? '—'}</Row>
              <Row label="Joined">{formatWhen(data.user.created_at)}</Row>
              <Row label="Email verified">{formatWhen(data.user.email_confirmed_at)}</Row>
              <Row label="Last sign-in">{formatWhen(data.user.last_sign_in_at)}</Row>
              <Row label="Last active">{formatWhen(lastActive)} {latest?.path ? <span className="font-mono text-[11px] text-[#71717a]">on {latest.path}</span> : null}</Row>
              {data.teacher_application ? (
                <Row label="Teacher application">
                  <Badge tone={statusTone(data.teacher_application.status)}>{data.teacher_application.status}</Badge>{' '}
                  {data.teacher_application.subjects}
                </Row>
              ) : null}
            </Section>

            <Section title="Location & device">
              <Row label="IP address"><span className="font-mono text-[11.5px]">{ip ?? '—'}</span></Row>
              <Row label="Actual location">
                <span className="inline-flex items-start gap-1">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-[#a1a1aa]" />
                  <IpPlace ip={ip} />
                </span>
              </Row>
              {latest?.region || latest?.city ? (
                <Row label="Browser-reported">{[latest.country, latest.region, latest.city].filter(Boolean).join(' · ')}</Row>
              ) : null}
              <Row label="Browser / OS">{parsed.browser} · {parsed.os} · {parsed.device}</Row>
              <Row label="User agent"><span className="font-mono text-[10.5px] text-[#52525b]">{ua ?? '—'}</span></Row>
              <Row label="Fingerprint"><span className="font-mono text-[11px]">{latest?.fingerprint ?? '—'}</span></Row>
              <Row label="Language / screen">{[latest?.language, latest?.screen, latest?.timezone].filter(Boolean).join(' · ') || '—'}</Row>
            </Section>

            <Section title="IP history" right={`${ips.length}`}>
              {ips.length === 0 ? (
                <p className="text-[12px] text-[#a1a1aa]">No IP recorded yet.</p>
              ) : (
                <div className="divide-y divide-[#f0f0f1]">
                  {ips.slice(0, 12).map((item) => (
                    <div key={item} className="grid grid-cols-[150px_1fr] gap-3 py-1.5 text-[12px]">
                      <span className="font-mono text-[11.5px]">{item}</span>
                      <IpPlace ip={item} />
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Sessions" right={`${data.sessions.length}`}>
              {data.sessions.length === 0 ? (
                <p className="text-[12px] text-[#a1a1aa]">No active sessions.</p>
              ) : (
                <div className="divide-y divide-[#f0f0f1]">
                  {data.sessions.map((session) => {
                    const sua = parseUserAgent(session.user_agent);
                    return (
                      <div key={session.id} className="flex items-center justify-between gap-3 py-2 text-[12px]">
                        <div className="min-w-0">
                          <p>{sua.browser} · {sua.os} <span className="font-mono text-[11px] text-[#71717a]">{session.ip}</span></p>
                          <p className="text-[10.5px] text-[#a1a1aa]">signed in {formatWhen(session.created_at)} · refreshed {timeAgo(session.refreshed_at ?? session.updated_at)}</p>
                        </div>
                        <button type="button" onClick={() => void revoke(session.id)} className="shrink-0 rounded-md border border-[#fecaca] bg-[#fef2f2] px-2 py-1 text-[11px] text-[#b91c1c] hover:bg-[#fee2e2]">
                          Revoke
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            <Section title="Downloads" right={`${data.download_count}`}>
              {data.downloads.length === 0 ? (
                <p className="text-[12px] text-[#a1a1aa]">No downloads yet.</p>
              ) : (
                <div className="max-h-[260px] divide-y divide-[#f0f0f1] overflow-y-auto">
                  {data.downloads.map((item, index) => (
                    <div key={`${item.at}-${index}`} className="flex items-center justify-between gap-3 py-1.5 text-[12px]">
                      <span className="min-w-0 truncate" title={item.file ?? ''}>{item.file || 'Past paper'}</span>
                      <span className="shrink-0 text-[11px] text-[#a1a1aa]">{formatWhen(item.at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Recent pages" right={`${data.page_view_count} total`}>
              {data.page_views.length === 0 ? (
                <p className="text-[12px] text-[#a1a1aa]">No page views yet.</p>
              ) : (
                <div className="max-h-[220px] divide-y divide-[#f0f0f1] overflow-y-auto">
                  {data.page_views.map((view, index) => (
                    <div key={`${view.at}-${index}`} className="flex items-center justify-between gap-3 py-1.5 text-[12px]">
                      <span className="font-mono text-[11.5px]">{view.path}</span>
                      <span className="shrink-0 text-[11px] text-[#a1a1aa]">{formatWhen(view.at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Security events" right={`${data.security_events.length}`}>
              {data.security_events.length === 0 ? (
                <p className="text-[12px] text-[#a1a1aa]">None recorded.</p>
              ) : (
                <div className="divide-y divide-[#f0f0f1]">
                  {data.security_events.map((event, index) => (
                    <div key={`${event.at}-${index}`} className="flex items-center justify-between gap-3 py-1.5 text-[12px]">
                      <Badge tone={statusTone(event.kind)}>{event.kind.replace(/_/g, ' ')}</Badge>
                      <span className="font-mono text-[11px] text-[#71717a]">{event.ip}</span>
                      <span className="shrink-0 text-[11px] text-[#a1a1aa]">{formatWhen(event.at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {data.tutor_requests.length ? (
              <Section title="Human tutor requests" right={`${data.tutor_requests.length}`}>
                {data.tutor_requests.map((request, index) => (
                  <div key={index} className="flex items-center justify-between gap-3 py-1 text-[12px]">
                    <span>{request.subject}</span>
                    <Badge tone={statusTone(request.status)}>{request.status}</Badge>
                  </div>
                ))}
              </Section>
            ) : null}

            <div className="border-t border-[#e4e4e7] px-5 py-3 text-[11px] text-[#a1a1aa]">
              Actual location is resolved from the IP with ipwho.is when you open this panel.{' '}
              <a href={`https://ipwho.is/${ip ?? ''}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
                raw lookup <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
}
