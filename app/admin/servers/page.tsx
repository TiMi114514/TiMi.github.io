'use client';

import { useMemo, useState } from 'react';
import { Activity, Cpu, HardDrive, MemoryStick, Network, Plus, Server, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  PageHeader,
  Panel,
  RefreshButton,
  formatWhen,
  inputClass,
  timeAgo,
  useAdminData,
} from '@/components/admin/ui';
import { supabase } from '@/lib/supabase';

type Disk = { mount: string; total: number; used: number; free: number };
type Service = { name: string; ok: boolean; ms: number | null; detail: string };
type Sample = {
  at: string;
  cpu_pct: number | null;
  load1: number | null;
  mem_total: number | null;
  mem_used: number | null;
  mem_available: number | null;
  swap_total: number | null;
  swap_used: number | null;
  disk: Disk[] | null;
  net_rx_bps: number | null;
  net_tx_bps: number | null;
  connections: { established: number; listen: number; time_wait: number; total: number } | null;
  services: Service[] | null;
  uptime_s: number | null;
};
type Point = { at: string; cpu: number | null; mem: number | null; rx: number | null; tx: number | null; conn: number | null };
type Host = {
  id: string;
  name: string;
  role: string | null;
  info: { hostname?: string; platform?: string; cpus?: number; cpu_model?: string; node?: string };
  last_seen: string | null;
  online: boolean;
  latest: Sample | null;
  series: Point[];
};
type Result = { hosts: Host[]; bucket_seconds: number; generated_at: string };

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.code === '42501' ? 'Admin access required.' : error.message);
  return data as T;
}

const RANGES = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 360, label: '6 hours' },
  { minutes: 1440, label: '24 hours' },
  { minutes: 10080, label: '7 days' },
];

function bytes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = value;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

const rate = (bps: number | null | undefined) => (bps == null ? '—' : `${bytes(bps)}/s`);

function uptime(seconds: number | null | undefined): string {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

function tone(pct: number | null | undefined): 'green' | 'amber' | 'red' | 'gray' {
  if (pct == null) return 'gray';
  if (pct >= 90) return 'red';
  if (pct >= 75) return 'amber';
  return 'green';
}

const BAR: Record<string, string> = { green: 'bg-[#22c55e]', amber: 'bg-[#f59e0b]', red: 'bg-[#ef4444]', gray: 'bg-[#d4d4d8]' };

function Meter({ pct }: { pct: number | null | undefined }) {
  const value = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#f4f4f5]">
      <div className={`h-full rounded-full transition-[width] duration-500 ${BAR[tone(pct)]}`} style={{ width: `${value}%` }} />
    </div>
  );
}

/** Minimal dependency-free line chart. */
function Spark({ series, keys, max, format }: { series: Point[]; keys: { key: keyof Point; color: string; label: string }[]; max?: number; format: (v: number) => string }) {
  const w = 600;
  const h = 120;
  const values = series.flatMap((p) => keys.map((k) => Number(p[k.key] ?? 0)));
  const top = max ?? Math.max(1, ...values) * 1.15;
  const x = (i: number) => (series.length <= 1 ? w : (i / (series.length - 1)) * w);
  const y = (v: number) => h - (Math.min(v, top) / top) * h;
  const last = series[series.length - 1];

  if (series.length === 0) return <Empty>No samples in this range yet.</Empty>;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-[120px] w-full">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={w} y1={h * f} y2={h * f} stroke="#f0f0f1" strokeWidth={1} />
        ))}
        {keys.map((k) => {
          const pts = series.map((p, i) => `${x(i).toFixed(1)},${y(Number(p[k.key] ?? 0)).toFixed(1)}`).join(' ');
          return (
            <g key={String(k.key)}>
              <polyline points={`0,${h} ${pts} ${w},${h}`} fill={k.color} fillOpacity={0.08} stroke="none" />
              <polyline points={pts} fill="none" stroke={k.color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
      </svg>
      <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[10.5px] text-[#71717a]">
        <span>{formatWhen(series[0]?.at)}</span>
        <span className="flex gap-3">
          {keys.map((k) => (
            <span key={String(k.key)} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: k.color }} />
              {k.label} {last ? format(Number(last[k.key] ?? 0)) : '—'}
            </span>
          ))}
        </span>
        <span>{formatWhen(last?.at)}</span>
      </div>
    </div>
  );
}

function Metric({ icon, label, value, sub, pct }: { icon: React.ReactNode; label: string; value: string; sub?: string; pct?: number | null }) {
  return (
    <div className="rounded-xl border border-[#e4e4e7] bg-white px-4 py-3.5">
      <p className="flex items-center gap-1.5 text-[11.5px] text-[#71717a]">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 text-[22px] font-semibold tabular-nums leading-none">{value}</p>
      {sub ? <p className="mt-1.5 text-[11px] text-[#a1a1aa]">{sub}</p> : null}
      {pct !== undefined ? <div className="mt-2.5"><Meter pct={pct} /></div> : null}
    </div>
  );
}

function HostCard({ host }: { host: Host }) {
  const s = host.latest;
  const memPct = s?.mem_total ? (100 * (s.mem_used ?? 0)) / s.mem_total : null;
  const swapPct = s?.swap_total ? (100 * (s.swap_used ?? 0)) / s.swap_total : null;
  const disks = s?.disk ?? [];
  const services = s?.services ?? [];
  const down = services.filter((svc) => !svc.ok);
  const worstDisk = disks.reduce<number | null>((max, d) => {
    const pct = d.total ? (100 * d.used) / d.total : null;
    return pct != null && (max == null || pct > max) ? pct : max;
  }, null);

  const alerts = [
    !host.online ? 'Host has not reported for more than 2 minutes.' : null,
    s?.cpu_pct != null && s.cpu_pct >= 90 ? `CPU at ${s.cpu_pct.toFixed(0)}%.` : null,
    memPct != null && memPct >= 90 ? `Memory at ${memPct.toFixed(0)}% — RAGFlow may slow down or be killed.` : null,
    worstDisk != null && worstDisk >= 90 ? `A disk is ${worstDisk.toFixed(0)}% full.` : null,
    down.length ? `${down.length} service(s) down: ${down.map((d) => d.name.replace('docker:', '')).join(', ')}.` : null,
  ].filter(Boolean) as string[];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e4e4e7] bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg border border-[#e4e4e7] bg-[#fafafa]">
            <Server className="h-5 w-5 text-[#52525b]" />
          </span>
          <div>
            <h2 className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
              {host.name}
              <Badge tone={host.online ? 'green' : 'red'}>
                <span className={`h-1.5 w-1.5 rounded-full ${host.online ? 'animate-pulse bg-[#22c55e]' : 'bg-[#ef4444]'}`} />
                {host.online ? 'online' : 'offline'}
              </Badge>
              {host.role ? <Badge tone="gray">{host.role}</Badge> : null}
            </h2>
            <p className="text-[11.5px] text-[#71717a]">
              {[host.info.hostname, host.info.platform, host.info.cpus ? `${host.info.cpus} cores` : null, host.info.cpu_model].filter(Boolean).join(' · ') || host.id}
            </p>
          </div>
        </div>
        <div className="text-right text-[11.5px] text-[#71717a]">
          <p>last report {timeAgo(host.last_seen)}</p>
          <p>uptime {uptime(s?.uptime_s)}</p>
        </div>
      </div>

      {alerts.length ? (
        <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[12.5px] text-[#b91c1c]">
          {alerts.map((a) => (
            <p key={a}>• {a}</p>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric icon={<Cpu className="h-3.5 w-3.5" />} label="CPU" value={s?.cpu_pct != null ? `${s.cpu_pct.toFixed(1)}%` : '—'} sub={`load ${s?.load1 ?? '—'}`} pct={s?.cpu_pct} />
        <Metric
          icon={<MemoryStick className="h-3.5 w-3.5" />}
          label="Memory used"
          value={memPct != null ? `${memPct.toFixed(0)}%` : '—'}
          sub={`${bytes(s?.mem_used)} of ${bytes(s?.mem_total)}`}
          pct={memPct}
        />
        <Metric
          icon={<MemoryStick className="h-3.5 w-3.5" />}
          label="Memory free"
          value={bytes(s?.mem_available)}
          sub={s?.swap_total ? `swap ${bytes(s.swap_used)} / ${bytes(s.swap_total)}` : 'no swap'}
          pct={swapPct}
        />
        <Metric icon={<Network className="h-3.5 w-3.5" />} label="Network" value={`↓ ${rate(s?.net_rx_bps)}`} sub={`↑ ${rate(s?.net_tx_bps)}`} />
        <Metric
          icon={<Activity className="h-3.5 w-3.5" />}
          label="TCP connections"
          value={String(s?.connections?.established ?? '—')}
          sub={s?.connections ? `established · ${s.connections.listen} listening · ${s.connections.time_wait} time-wait` : undefined}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="CPU & memory (%)">
          <div className="p-4">
            <Spark
              series={host.series}
              max={100}
              keys={[
                { key: 'cpu', color: '#2563eb', label: 'CPU' },
                { key: 'mem', color: '#f97316', label: 'Memory' },
              ]}
              format={(v) => `${v.toFixed(0)}%`}
            />
          </div>
        </Panel>
        <Panel title="Network throughput">
          <div className="p-4">
            <Spark
              series={host.series}
              keys={[
                { key: 'rx', color: '#16a34a', label: '↓ in' },
                { key: 'tx', color: '#9333ea', label: '↑ out' },
              ]}
              format={(v) => rate(v)}
            />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title={<span className="flex items-center gap-2"><HardDrive className="h-4 w-4 text-[#71717a]" /> Disks</span>} right={`${disks.length}`}>
          {disks.length === 0 ? (
            <Empty>No disk data.</Empty>
          ) : (
            <div className="divide-y divide-[#f0f0f1]">
              {disks.map((d) => {
                const pct = d.total ? (100 * d.used) / d.total : null;
                return (
                  <div key={d.mount} className="px-5 py-3">
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-[12px]">
                      <span className="font-mono">{d.mount}</span>
                      <span className="text-[#52525b]">
                        <b className="font-semibold text-[#18181b]">{bytes(d.free)}</b> free of {bytes(d.total)} · {pct?.toFixed(0)}% used
                      </span>
                    </div>
                    <Meter pct={pct} />
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Services" right={`${services.length - down.length}/${services.length} healthy`}>
          {services.length === 0 ? (
            <Empty>No service checks reported.</Empty>
          ) : (
            <div className="divide-y divide-[#f0f0f1]">
              {services.map((svc) => (
                <div key={svc.name} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[12px]">
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${svc.ok ? 'bg-[#22c55e]' : 'bg-[#ef4444]'}`} />
                    <span className="font-mono text-[11.5px]">{svc.name.replace('docker:docker-', 'docker:')}</span>
                  </span>
                  <span className="truncate text-[11px] text-[#71717a]">
                    {svc.detail}
                    {svc.ms != null ? ` · ${svc.ms} ms` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}

function AddHost({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const result = await rpc<{ id: string; token: string }>('admin_monitor_host_create', { p_id: id.trim().toLowerCase(), p_name: name.trim(), p_role: role.trim() || null });
      setToken(result.token);
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed.');
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Add host
      </Button>
    );
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4" onClick={() => setOpen(false)}>
      <form onSubmit={create} onClick={(e) => e.stopPropagation()} className="w-full max-w-[480px] space-y-3 rounded-xl border border-[#e4e4e7] bg-white p-5 text-[12px] shadow-2xl">
        <h2 className="text-[15px] font-semibold">Add a monitored host</h2>
        {token ? (
          <>
            <p className="text-[#52525b]">Put these lines in the host&apos;s <span className="font-mono">gateway/.env</span> (or monitor agent config). The token is shown only once.</p>
            <pre className="overflow-x-auto rounded-lg bg-[#18181b] p-3 font-mono text-[11px] text-[#e4e4e7]">{`MONITOR_HOST_ID=${id.trim().toLowerCase()}\nMONITOR_TOKEN=${token}`}</pre>
            <div className="flex justify-end">
              <Button variant="dark" onClick={() => { setOpen(false); setToken(null); }}>Done</Button>
            </div>
          </>
        ) : (
          <>
            <label className="block space-y-1">
              <span className="text-[#71717a]">Id (lowercase)</span>
              <input required pattern="[a-z0-9][a-z0-9._\-]{0,40}" value={id} onChange={(e) => setId(e.target.value)} placeholder="tencent-hk" className={`${inputClass} font-mono`} />
            </label>
            <label className="block space-y-1">
              <span className="text-[#71717a]">Name</span>
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tencent Cloud HK" className={inputClass} />
            </label>
            <label className="block space-y-1">
              <span className="text-[#71717a]">Role</span>
              <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Nginx + site" className={inputClass} />
            </label>
            {error ? <p className="text-[#b91c1c]">{error}</p> : null}
            <p className="text-[11px] text-[#a1a1aa]">Re-creating an existing id rotates its token.</p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="dark">Create token</Button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

export default function AdminServersPage() {
  const [minutes, setMinutes] = useState(60);
  const { data, error, loading, reload } = useAdminData(() => rpc<Result>('admin_host_metrics', { p_minutes: minutes }), [minutes], 30_000);
  const hosts = useMemo(() => data?.hosts ?? [], [data]);

  async function remove(host: Host) {
    if (!window.confirm(`Stop monitoring "${host.name}" and delete its history?`)) return;
    try {
      await rpc('admin_monitor_host_delete', { p_id: host.id });
      await reload();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : 'Delete failed.');
    }
  }

  return (
    <div>
      <PageHeader
        title="Servers"
        description="Live health of the machines behind the site — CPU, memory, free memory, disks, network throughput, TCP connections and service checks. Hosts report every 30 seconds; the page refreshes every 30 seconds."
        actions={
          <>
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={`${inputClass} w-auto`} aria-label="Range">
              {RANGES.map((r) => (
                <option key={r.minutes} value={r.minutes}>
                  {r.label}
                </option>
              ))}
            </select>
            <AddHost onDone={() => void reload()} />
            <RefreshButton onClick={() => void reload()} loading={loading} />
          </>
        }
      />

      <ErrorBox message={error} />

      <div className="mt-5 space-y-8">
        {data === null && !error ? (
          <Panel><Empty>Loading…</Empty></Panel>
        ) : hosts.length === 0 ? (
          <Panel><Empty>No hosts yet. Add one and run the monitor agent on it.</Empty></Panel>
        ) : (
          hosts.map((host) => (
            <div key={host.id}>
              <HostCard host={host} />
              <div className="mt-2 text-right">
                <button type="button" onClick={() => void remove(host)} className="inline-flex items-center gap-1 text-[11px] text-[#a1a1aa] hover:text-[#b91c1c]">
                  <Trash2 className="h-3 w-3" /> stop monitoring
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
