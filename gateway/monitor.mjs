// Host monitor: pushes CPU / memory / swap / disk / network / connections /
// service health to the admin dashboard every MONITOR_INTERVAL_S seconds.
// Linux only (reads /proc). Started by server.mjs when MONITOR_TOKEN is set.

import fs from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';

const read = (file) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};

function cpuTimes() {
  const line = read('/proc/stat').split('\n').find((l) => l.startsWith('cpu '));
  if (!line) return null;
  const v = line.trim().split(/\s+/).slice(1).map(Number);
  const idle = v[3] + (v[4] || 0);
  const total = v.reduce((a, b) => a + b, 0);
  return { idle, total };
}

function memory() {
  const info = {};
  for (const line of read('/proc/meminfo').split('\n')) {
    const m = /^(\w+):\s+(\d+)/.exec(line);
    if (m) info[m[1]] = Number(m[2]) * 1024;
  }
  const total = info.MemTotal ?? os.totalmem();
  const available = info.MemAvailable ?? os.freemem();
  return {
    mem_total: total,
    mem_available: available,
    mem_used: total - available,
    swap_total: info.SwapTotal ?? 0,
    swap_used: (info.SwapTotal ?? 0) - (info.SwapFree ?? 0),
  };
}

function netBytes() {
  let rx = 0;
  let tx = 0;
  for (const line of read('/proc/net/dev').split('\n').slice(2)) {
    const [name, rest] = line.split(':');
    if (!rest) continue;
    const iface = name.trim();
    if (iface === 'lo' || iface.startsWith('veth') || iface.startsWith('docker') || iface.startsWith('br-')) continue;
    const v = rest.trim().split(/\s+/).map(Number);
    rx += v[0];
    tx += v[8];
  }
  return { rx, tx };
}

function connections() {
  // TCP states: 01 ESTABLISHED, 06 TIME_WAIT, 0A LISTEN
  const counts = { established: 0, listen: 0, time_wait: 0, total: 0 };
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    for (const line of read(file).split('\n').slice(1)) {
      const state = line.trim().split(/\s+/)[3];
      if (!state) continue;
      counts.total += 1;
      if (state === '01') counts.established += 1;
      else if (state === '0A') counts.listen += 1;
      else if (state === '06') counts.time_wait += 1;
    }
  }
  return counts;
}

function run(cmd, args, timeout = 8000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (error, stdout) => resolve(error ? '' : stdout));
  });
}

async function disks(mounts) {
  const out = await run('df', ['-B1', '--output=target,size,used,avail', ...mounts]);
  return out
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((cols) => cols.length === 4 && cols[1] !== '-')
    .map(([mount, total, used, free]) => ({ mount, total: Number(total), used: Number(used), free: Number(free) }));
}

async function probe(name, url, init = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
    return { name, ok: res.status < 500, ms: Date.now() - started, detail: `HTTP ${res.status}` };
  } catch (error) {
    return { name, ok: false, ms: Date.now() - started, detail: error.name === 'TimeoutError' ? 'timeout' : 'unreachable' };
  }
}

async function dockerServices() {
  const out = await run('docker', ['ps', '-a', '--format', '{{.Names}}|{{.State}}|{{.Status}}']);
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, state, status] = line.split('|');
      return { name: `docker:${name}`, ok: state === 'running' && !/unhealthy/.test(status), ms: null, detail: status };
    });
}

export function startMonitor({ supabaseUrl, anonKey, hostId, token, intervalS = 30, gatewayPort, ragflowUrl, ragflowKey, log }) {
  if (!hostId || !token || !anonKey) return;
  let lastCpu = cpuTimes();
  let lastNet = netBytes();
  let lastAt = Date.now();
  const mounts = ['/', ...['/mnt/c', '/mnt/d', '/mnt/e'].filter((m) => fs.existsSync(m))];

  async function tick() {
    const now = Date.now();
    const seconds = Math.max(1, (now - lastAt) / 1000);
    const cpu = cpuTimes();
    const net = netBytes();
    const cpuPct = cpu && lastCpu && cpu.total > lastCpu.total
      ? 100 * (1 - (cpu.idle - lastCpu.idle) / (cpu.total - lastCpu.total))
      : null;
    const sample = {
      cpu_pct: cpuPct === null ? null : Math.round(cpuPct * 10) / 10,
      load1: Math.round(os.loadavg()[0] * 100) / 100,
      ...memory(),
      disk: await disks(mounts),
      net_rx_bps: Math.max(0, Math.round((net.rx - lastNet.rx) / seconds)),
      net_tx_bps: Math.max(0, Math.round((net.tx - lastNet.tx) / seconds)),
      connections: connections(),
      uptime_s: Math.round(os.uptime()),
      services: [
        await probe('gateway', `http://127.0.0.1:${gatewayPort}/healthz`),
        await probe('ragflow-api', `${ragflowUrl}/api/v1/chats?page=1&page_size=1`, { headers: { Authorization: `Bearer ${ragflowKey}` } }),
        ...(await dockerServices()),
      ],
      info: {
        hostname: os.hostname(),
        platform: `${os.type()} ${os.release()}`,
        cpus: os.cpus().length,
        cpu_model: os.cpus()[0]?.model ?? '',
        node: process.version,
      },
    };
    lastCpu = cpu;
    lastNet = net;
    lastAt = now;

    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/rpc/ingest_host_metrics`, {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_host: hostId, p_token: token, p_sample: sample }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) log({ event: 'monitor_push_failed', status: res.status, body: (await res.text()).slice(0, 200) });
    } catch (error) {
      log({ event: 'monitor_push_failed', message: error.message });
    }
  }

  setTimeout(() => void tick(), 5_000);
  setInterval(() => void tick(), Math.max(15, intervalS) * 1000).unref();
}
