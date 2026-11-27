// RAGFlow security gateway for A-Level Hub.
//
// Sits between the public site and the local RAGFlow API. Only the handful of
// read / chat endpoints the site needs are allowed; everything else is 404.
// The RAGFlow API key stays here — browsers never see it.
//
//   browser ──https──▶ Tailscale Funnel / Nginx ──▶ this gateway (127.0.0.1:8787) ──▶ RAGFlow (127.0.0.1:9380)
//
// Zero dependencies: Node 20+. Config lives in gateway/.env (see .env.example).

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { startMonitor } from './monitor.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(DIR, '.env'));

// ---------------------------------------------------------------- config

const env = process.env;
const list = (value) => (value || '').split(',').map((s) => s.trim()).filter(Boolean);
const int = (value, fallback) => (Number.isFinite(Number(value)) && value !== '' && value != null ? Number(value) : fallback);

const CFG = {
  host: env.GATEWAY_HOST || '127.0.0.1',
  port: int(env.GATEWAY_PORT, 8787),
  upstream: (env.RAGFLOW_URL || 'http://127.0.0.1:9380').replace(/\/+$/, ''),
  apiKey: env.RAGFLOW_API_KEY || '',
  origins: list(env.ALLOWED_ORIGINS || 'https://timi114514.github.io,http://localhost:3000,http://127.0.0.1:4173,http://localhost:4173'),
  datasets: list(env.ALLOWED_DATASETS || '*'),
  chatPrefix: env.CHAT_PREFIX ?? 'DQ · ',
  issuer: `${(env.SUPABASE_URL || '').replace(/\/+$/, '')}/auth/v1`,
  jwks: parseJson(env.SUPABASE_JWKS, { keys: [] }),
  requireLoginForChat: env.REQUIRE_LOGIN_FOR_CHAT !== 'false',
  chatConcurrency: int(env.CHAT_CONCURRENCY, 3),
  limits: {
    // [requests, window seconds]
    ipAll: [int(env.LIMIT_IP_PER_MIN, 240), 60],
    ipRead: [int(env.LIMIT_READ_PER_MIN, 120), 60],
    ipDownload: [int(env.LIMIT_DOWNLOAD_PER_MIN, 20), 60],
    ipDownloadDay: [int(env.LIMIT_DOWNLOAD_PER_DAY, 400), 86_400],
    userChat: [int(env.LIMIT_CHAT_PER_MIN, 12), 60],
    userChatDay: [int(env.LIMIT_CHAT_PER_DAY, 300), 86_400],
    ipChat: [int(env.LIMIT_IP_CHAT_PER_MIN, 30), 60],
  },
  banAfterAuthFailures: int(env.BAN_AFTER_AUTH_FAILURES, 30),
  banMinutes: int(env.BAN_MINUTES, 30),
  logDir: path.join(DIR, 'logs'),
  logDays: int(env.LOG_RETENTION_DAYS, 14),
  killSwitch: path.join(DIR, 'DISABLED'),
};

if (!CFG.apiKey) fatal('RAGFLOW_API_KEY is missing in gateway/.env');
if (!CFG.issuer.startsWith('https://')) fatal('SUPABASE_URL is missing in gateway/.env');

const JWT_KEYS = new Map();
for (const jwk of CFG.jwks.keys ?? []) {
  try {
    JWT_KEYS.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' }));
  } catch (error) {
    console.warn(`skipping JWK ${jwk.kid}: ${error.message}`);
  }
}
if (JWT_KEYS.size === 0 && CFG.requireLoginForChat) fatal('SUPABASE_JWKS has no usable public keys');

// ---------------------------------------------------------------- helpers

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseJson(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

function fatal(message) {
  console.error(`[gateway] ${message}`);
  process.exit(1);
}

const HEX32 = /^[a-f0-9]{32}$/;

// ---------------------------------------------------------------- rate limiting

const buckets = new Map(); // key -> { count, reset }
const bans = new Map(); // ip -> until
const authFailures = new Map(); // ip -> { count, reset }

function hit(key, [max, seconds]) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.reset <= now) {
    buckets.set(key, { count: 1, reset: now + seconds * 1000 });
    return { ok: true };
  }
  entry.count += 1;
  if (entry.count > max) return { ok: false, retry: Math.ceil((entry.reset - now) / 1000) };
  return { ok: true };
}

function noteAuthFailure(ip) {
  const now = Date.now();
  const entry = authFailures.get(ip);
  if (!entry || entry.reset <= now) {
    authFailures.set(ip, { count: 1, reset: now + 10 * 60_000 });
    return;
  }
  entry.count += 1;
  if (entry.count >= CFG.banAfterAuthFailures) {
    bans.set(ip, now + CFG.banMinutes * 60_000);
    log({ event: 'ban', ip, minutes: CFG.banMinutes });
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
  for (const [k, v] of authFailures) if (v.reset <= now) authFailures.delete(k);
  for (const [k, until] of bans) if (until <= now) bans.delete(k);
}, 60_000).unref();

let activeChats = 0;

// ---------------------------------------------------------------- JWT (Supabase, ES256)

function verifyJwt(token) {
  try {
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return null;
    const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
    if (header.alg !== 'ES256') return null;
    const key = JWT_KEYS.get(header.kid);
    if (!key) return null;
    const ok = crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
    if (!ok) return null;
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== 'number' || claims.exp < now) return null;
    if (claims.nbf && claims.nbf > now + 60) return null;
    if (claims.iss !== CFG.issuer) return null;
    if (claims.role !== 'authenticated' || claims.is_anonymous === true) return null;
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes('authenticated')) return null;
    return claims;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- upstream catalogue (allowed chats / datasets)

const catalogue = { chats: new Map(), datasets: new Map(), loadedAt: 0, error: null };

async function upstreamJson(pathname) {
  const res = await fetch(`${CFG.upstream}${pathname}`, {
    headers: { Authorization: `Bearer ${CFG.apiKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json();
  if (json?.code !== 0) throw new Error(`upstream ${pathname}: ${json?.message ?? res.status}`);
  return json.data;
}

async function refreshCatalogue() {
  try {
    const [chatData, datasetData] = await Promise.all([
      upstreamJson('/api/v1/chats?page=1&page_size=100'),
      upstreamJson('/api/v1/datasets?page=1&page_size=100'),
    ]);
    const chats = new Map();
    for (const chat of chatData?.chats ?? []) {
      if (!chat?.id || typeof chat.name !== 'string') continue;
      if (CFG.chatPrefix && !chat.name.startsWith(CFG.chatPrefix)) continue;
      chats.set(chat.id, chat);
    }
    const datasets = new Map();
    for (const ds of Array.isArray(datasetData) ? datasetData : []) {
      if (!ds?.id) continue;
      if (CFG.datasets[0] !== '*' && !CFG.datasets.includes(ds.id)) continue;
      datasets.set(ds.id, ds);
    }
    catalogue.chats = chats;
    catalogue.datasets = datasets;
    catalogue.loadedAt = Date.now();
    catalogue.error = null;
  } catch (error) {
    catalogue.error = error.message;
    log({ event: 'catalogue_error', message: error.message });
  }
}

async function ensureCatalogue() {
  const maxAge = catalogue.error || catalogue.datasets.size === 0 ? 15_000 : 5 * 60_000;
  if (Date.now() - catalogue.loadedAt > maxAge) await refreshCatalogue();
}

// ---------------------------------------------------------------- filename index (fast search)
//
// RAGFlow has no cross-dataset filename search, so the browser used to fan out
// dozens of paged requests over the internet. The gateway keeps every document
// name in memory (≈5k rows, <1 MB) and answers searches in a single round trip.

const PAPER_RE = /(\d{4})[_\-\s]?([smw])(\d{2})[_\-\s]?([a-z]{2,3})(?:[_\-\s]?(\d{1,2}))?/i;
const SEASON_ORDER = { m: 1, s: 2, w: 3 };
const index = { docs: [], builtAt: 0, building: null, error: null };

function parseName(name) {
  const base = (name.split('/').pop() || name).toLowerCase();
  const m = PAPER_RE.exec(base);
  if (!m) return { base, year: null, season: null, type: null, code: null };
  return { base, code: m[1], season: m[2].toLowerCase(), year: 2000 + Number(m[3]), type: m[4].toLowerCase() };
}

async function buildIndex() {
  await ensureCatalogue();
  // Never publish an empty or partial index: RAGFlow may still be booting.
  if (catalogue.error || catalogue.datasets.size === 0) throw new Error(catalogue.error || 'no datasets yet');
  const docs = [];
  await Promise.all(
    [...catalogue.datasets.values()].map(async (ds) => {
      const pages = Math.max(1, Math.ceil((ds.document_count || 0) / 100));
      const results = await Promise.all(
        Array.from({ length: Math.min(pages, 200) }, (_, i) =>
          upstreamJson(`/api/v1/datasets/${ds.id}/documents?page=${i + 1}&page_size=100`),
        ),
      );
      const seen = new Set();
      for (const data of results) {
        for (const doc of data?.docs ?? []) {
          if (!doc?.id || seen.has(doc.id)) continue;
          seen.add(doc.id);
          docs.push({ id: doc.id, name: doc.name, size: doc.size, dataset_id: ds.id, dataset_name: ds.name, create_time: doc.create_time, ...parseName(doc.name) });
        }
      }
    }),
  );
  index.docs = docs;
  index.builtAt = Date.now();
  index.error = null;
  log({ event: 'index_built', docs: docs.length });
}

async function ensureIndex() {
  const stale = Date.now() - index.builtAt > 10 * 60_000;
  if (!stale) return;
  if (!index.building) {
    index.building = buildIndex()
      .catch((error) => {
        index.error = error.message;
        log({ event: 'index_error', message: error.message });
      })
      .finally(() => (index.building = null));
  }
  // First build: wait for it. Later refreshes: serve the old index meanwhile.
  if (index.builtAt === 0) await index.building;
}

function searchIndex(params) {
  const q = (params.get('q') || '').trim().toLowerCase().slice(0, 80);
  const dataset = params.get('dataset') || '';
  const year = int(params.get('year'), 0);
  const season = (params.get('season') || '').toLowerCase();
  const type = (params.get('type') || '').toLowerCase();
  const limit = Math.min(Math.max(int(params.get('limit'), 1000), 1), 1000);
  let docs = index.docs;

  let series = null;
  if (params.get('series') === 'latest') {
    // Most recent exam series present in the archive, e.g. 2026 June (s26).
    let best = 0;
    for (const d of docs) {
      if (!d.year || !d.season) continue;
      const rank = d.year * 10 + SEASON_ORDER[d.season];
      if (rank > best) best = rank;
    }
    if (best) {
      const y = Math.floor(best / 10);
      const s = Object.keys(SEASON_ORDER).find((k) => SEASON_ORDER[k] === best % 10);
      series = { year: y, season: s };
      docs = docs.filter((d) => d.year === y && d.season === s);
    }
  }

  docs = docs.filter(
    (d) =>
      (!dataset || d.dataset_id === dataset) &&
      (!year || d.year === year) &&
      (!season || d.season === season) &&
      (!type || d.type === type) &&
      (!q || d.base.includes(q)),
  );
  const total = docs.length;
  const sorted =
    params.get('sort') === 'recent'
      ? [...docs].sort((a, b) => (b.create_time || 0) - (a.create_time || 0))
      : [...docs].sort((a, b) => a.dataset_name.localeCompare(b.dataset_name) || a.base.localeCompare(b.base, undefined, { numeric: true }));
  return {
    total,
    series,
    index_age_s: Math.round((Date.now() - index.builtAt) / 1000),
    docs: sorted.slice(0, limit).map((d) => ({ id: d.id, name: d.name, size: d.size, dataset_id: d.dataset_id, dataset_name: d.dataset_name })),
  };
}

// ---------------------------------------------------------------- logging

fs.mkdirSync(CFG.logDir, { recursive: true });

function log(entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  const file = path.join(CFG.logDir, `gateway-${new Date().toISOString().slice(0, 10)}.log`);
  fs.appendFile(file, `${line}\n`, () => undefined);
}

function pruneLogs() {
  const cutoff = Date.now() - CFG.logDays * 86_400_000;
  for (const name of fs.readdirSync(CFG.logDir)) {
    const file = path.join(CFG.logDir, name);
    try {
      if (fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
}
pruneLogs();
setInterval(pruneLogs, 86_400_000).unref();

// ---------------------------------------------------------------- HTTP plumbing

function clientIp(req) {
  const remote = req.socket.remoteAddress || '';
  const loopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  // Only trust forwarding headers when the request comes from the local proxy (Funnel / Nginx).
  if (loopback) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded.slice(0, 64);
    const real = String(req.headers['x-real-ip'] || '').trim();
    if (real) return real.slice(0, 64);
  }
  return remote.replace(/^::ffff:/, '');
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  const headers = {
    Vary: 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  };
  if (origin && CFG.origins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Expose-Headers'] = 'Content-Disposition, Retry-After, X-Quota-Used, X-Quota-Limit, X-Plan';
    headers['Access-Control-Max-Age'] = '600';
  }
  return headers;
}

function send(res, ctx, status, body, extra = {}) {
  if (res.headersSent) return res.end();
  ctx.status = status;
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { ...ctx.cors, 'Content-Type': 'application/json; charset=utf-8', ...extra });
  res.end(payload);
}

const fail = (res, ctx, status, message, extra) => send(res, ctx, status, { code: status, message }, extra);

async function readJsonBody(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Request body too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Invalid JSON body.'), { status: 400 });
  }
}

async function forward(req, res, ctx, { method = 'GET', upstreamPath, body, timeoutMs = 30_000, transform }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  res.on('close', () => controller.abort());
  let upstream;
  try {
    upstream = await fetch(`${CFG.upstream}${upstreamPath}`, {
      method,
      headers: { Authorization: `Bearer ${CFG.apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    return fail(res, ctx, 502, error.name === 'AbortError' ? 'RAGFlow timed out.' : 'RAGFlow is unreachable.');
  }

  const type = upstream.headers.get('content-type') || 'application/octet-stream';
  try {
    if (transform && type.includes('application/json')) {
      const json = await upstream.json();
      clearTimeout(timer);
      return send(res, ctx, upstream.status, json?.code === 0 ? transform(json) : sanitizeError(json));
    }
    const headers = { ...ctx.cors, 'Content-Type': type };
    const disposition = upstream.headers.get('content-disposition');
    if (disposition) headers['Content-Disposition'] = disposition;
    const length = upstream.headers.get('content-length');
    if (length) headers['Content-Length'] = length;
    if (type.includes('event-stream')) headers['X-Accel-Buffering'] = 'no';
    ctx.status = upstream.status;
    res.writeHead(upstream.status, headers);
    if (!upstream.body) return res.end();
    const stream = Readable.fromWeb(upstream.body);
    stream.on('data', (chunk) => (ctx.bytes += chunk.length));
    stream.on('error', () => res.destroy());
    stream.on('end', () => clearTimeout(timer));
    stream.pipe(res);
  } catch {
    clearTimeout(timer);
    if (!res.headersSent) fail(res, ctx, 502, 'Bad response from RAGFlow.');
    else res.destroy();
  }
}

function sanitizeError(json) {
  // Never leak upstream internals (stack traces, tenant ids) to the public.
  const message = typeof json?.message === 'string' ? json.message.slice(0, 160) : 'RAGFlow error.';
  return { code: json?.code ?? 500, message };
}

// ---------------------------------------------------------------- response filters

const pickChat = (chat) => ({
  id: chat.id,
  name: chat.name,
  dataset_ids: (chat.dataset_ids ?? []).filter((id) => catalogue.datasets.has(id)),
  kb_names: chat.kb_names ?? [],
  llm_id: chat.llm_id,
});

const pickDataset = (ds) => ({
  id: ds.id,
  name: ds.name,
  document_count: ds.document_count,
  chunk_count: ds.chunk_count,
});

const pickDocument = (doc) => ({
  id: doc.id,
  name: doc.name,
  size: doc.size,
  type: doc.type,
  run: doc.run,
  chunk_count: doc.chunk_count,
  create_time: doc.create_time,
});

const pickChunk = (chunk) => ({
  document_id: chunk.document_id,
  document_keyword: chunk.document_keyword,
  document_name: chunk.document_name,
  similarity: chunk.similarity,
});

// ---------------------------------------------------------------- auth / limits per route

function requireUser(req, res, ctx) {
  if (!CFG.requireLoginForChat) return { sub: 'anonymous' };
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const claims = token ? verifyJwt(token) : null;
  if (!claims) {
    noteAuthFailure(ctx.ip);
    fail(res, ctx, 401, 'Sign in with a verified account to use the AI tutor.');
    return null;
  }
  ctx.uid = String(claims.sub).slice(0, 8);
  return claims;
}

function limit(res, ctx, key, rule) {
  const result = hit(key, rule);
  if (result.ok) return true;
  fail(res, ctx, 429, 'Too many requests. Please slow down.', { 'Retry-After': String(result.retry) });
  return false;
}

// Membership quota: count one AI question against the user's daily plan allowance.
// Uses the student's own Supabase token, so the database decides (no service key here).
// If Supabase is unreachable the question is allowed (fail open) and logged.
async function consumeAiQuota(req, res, ctx) {
  const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return true;
  const token = String(req.headers.authorization || '').slice(7).trim();
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/rpc/record_ai_usage`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      log({ event: 'quota_check_failed', status: r.status });
      return true;
    }
    const q = await r.json();
    ctx.quota = `${q.used}/${q.limit}`;
    if (q.allowed) return true;
    fail(res, ctx, 429, q.plan === 'pro'
      ? `今日 AI 提问额度（${q.limit} 次）已用完，明天 0 点（北京时间）恢复。`
      : `今日免费 AI 提问额度（${q.limit} 次）已用完。兑换会员可获得更多每日提问次数，明天 0 点（北京时间）恢复。`,
      { 'Retry-After': '3600', 'X-Quota-Used': String(q.used), 'X-Quota-Limit': String(q.limit), 'X-Plan': String(q.plan) });
    return false;
  } catch (error) {
    log({ event: 'quota_check_failed', message: error.message });
    return true;
  }
}

// ---------------------------------------------------------------- routes

async function handle(req, res, ctx) {
  const url = new URL(req.url, 'http://gateway.local');
  const p = url.pathname.replace(/\/+$/, '') || '/';
  let m;

  if (p === '/healthz' && req.method === 'GET') {
    ctx.route = 'health';
    await ensureCatalogue();
    return send(res, ctx, 200, {
      ok: !catalogue.error,
      assistants: catalogue.chats.size,
      datasets: catalogue.datasets.size,
      activeChats,
    });
  }

  if (fs.existsSync(CFG.killSwitch)) {
    ctx.route = 'disabled';
    return fail(res, ctx, 503, 'The AI service is temporarily offline for maintenance.', { 'Retry-After': '600' });
  }

  // GET /api/v1/chats
  if (req.method === 'GET' && p === '/api/v1/chats') {
    ctx.route = 'chats.list';
    if (!limit(res, ctx, `read:${ctx.ip}`, CFG.limits.ipRead)) return;
    await ensureCatalogue();
    if (catalogue.error && catalogue.chats.size === 0) return fail(res, ctx, 502, 'RAGFlow is unreachable.');
    return send(res, ctx, 200, { code: 0, data: { chats: [...catalogue.chats.values()].map(pickChat) } });
  }

  // GET /api/v1/datasets
  if (req.method === 'GET' && p === '/api/v1/datasets') {
    ctx.route = 'datasets.list';
    if (!limit(res, ctx, `read:${ctx.ip}`, CFG.limits.ipRead)) return;
    await ensureCatalogue();
    if (catalogue.error && catalogue.datasets.size === 0) return fail(res, ctx, 502, 'RAGFlow is unreachable.');
    return send(res, ctx, 200, { code: 0, data: [...catalogue.datasets.values()].map(pickDataset) });
  }

  // GET /api/v1/search — one-shot filename search over every allowed dataset
  if (req.method === 'GET' && p === '/api/v1/search') {
    ctx.route = 'search';
    if (!limit(res, ctx, `read:${ctx.ip}`, CFG.limits.ipRead)) return;
    await ensureIndex();
    if (index.builtAt === 0) return fail(res, ctx, 502, 'Search index is not ready.');
    return send(res, ctx, 200, { code: 0, data: searchIndex(url.searchParams) }, { 'Cache-Control': 'public, max-age=60' });
  }

  // GET /api/v1/datasets/:ds/documents
  if (req.method === 'GET' && (m = /^\/api\/v1\/datasets\/([a-f0-9]{32})\/documents$/.exec(p))) {
    ctx.route = 'documents.list';
    if (!limit(res, ctx, `read:${ctx.ip}`, CFG.limits.ipRead)) return;
    await ensureCatalogue();
    if (!catalogue.datasets.has(m[1])) return fail(res, ctx, 404, 'Not found.');
    const q = new URLSearchParams();
    q.set('page', String(Math.min(Math.max(int(url.searchParams.get('page'), 1), 1), 200)));
    q.set('page_size', String(Math.min(Math.max(int(url.searchParams.get('page_size'), 30), 1), 100)));
    const keywords = (url.searchParams.get('keywords') || '').slice(0, 80);
    if (keywords) q.set('keywords', keywords);
    return forward(req, res, ctx, {
      upstreamPath: `/api/v1/datasets/${m[1]}/documents?${q}`,
      transform: (json) => ({ code: 0, data: { total: json.data?.total ?? 0, docs: (json.data?.docs ?? []).map(pickDocument) } }),
    });
  }

  // GET /api/v1/datasets/:ds/documents/:doc  (download)
  if (req.method === 'GET' && (m = /^\/api\/v1\/datasets\/([a-f0-9]{32})\/documents\/([a-f0-9]{32})$/.exec(p))) {
    ctx.route = 'documents.download';
    if (!limit(res, ctx, `dl:${ctx.ip}`, CFG.limits.ipDownload)) return;
    if (!limit(res, ctx, `dlday:${ctx.ip}`, CFG.limits.ipDownloadDay)) return;
    await ensureCatalogue();
    if (!catalogue.datasets.has(m[1])) return fail(res, ctx, 404, 'Not found.');
    return forward(req, res, ctx, { upstreamPath: `/api/v1/datasets/${m[1]}/documents/${m[2]}`, timeoutMs: 120_000 });
  }

  const nativeChat = /^\/api\/v1\/chats\/([a-f0-9]{32})\/completions$/.exec(p);
  const openaiChat = /^\/api\/v1\/chats_openai\/([a-f0-9]{32})\/chat\/completions$/.exec(p);

  // POST chat completions (native or OpenAI-compatible)
  if (req.method === 'POST' && (nativeChat || openaiChat)) {
    ctx.route = nativeChat ? 'chat.native' : 'chat.openai';
    const claims = requireUser(req, res, ctx);
    if (!claims) return;
    if (!limit(res, ctx, `chat:${claims.sub}`, CFG.limits.userChat)) return;
    if (!limit(res, ctx, `chatday:${claims.sub}`, CFG.limits.userChatDay)) return;
    if (!limit(res, ctx, `ipchat:${ctx.ip}`, CFG.limits.ipChat)) return;
    await ensureCatalogue();
    const chatId = (nativeChat || openaiChat)[1];
    if (!catalogue.chats.has(chatId)) return fail(res, ctx, 404, 'Not found.');
    if (!(await consumeAiQuota(req, res, ctx))) return;

    const body = await readJsonBody(req, 64 * 1024);
    let upstreamBody;
    if (nativeChat) {
      const question = typeof body.question === 'string' ? body.question.trim() : '';
      if (!question || question.length > 2000) return fail(res, ctx, 400, 'Questions must be 1–2000 characters.');
      // session_id is intentionally dropped: sessions are not bound to a user.
      upstreamBody = { question, stream: body.stream !== false };
    } else {
      const messages = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
      const clean = messages
        .filter((msg) => msg && ['user', 'assistant'].includes(msg.role) && typeof msg.content === 'string')
        .map((msg) => ({ role: msg.role, content: msg.content.slice(0, 4000) }));
      const total = clean.reduce((sum, msg) => sum + msg.content.length, 0);
      if (!clean.length || clean[clean.length - 1].role !== 'user') return fail(res, ctx, 400, 'The last message must be a question.');
      if (total > 24_000) return fail(res, ctx, 400, 'Conversation is too long. Start a new one.');
      upstreamBody = {
        model: typeof body.model === 'string' ? body.model.slice(0, 128) : catalogue.chats.get(chatId)?.llm_id,
        messages: clean,
        stream: body.stream !== false,
        temperature: Math.min(Math.max(Number(body.temperature ?? 0.2) || 0.2, 0), 1),
      };
    }

    if (activeChats >= CFG.chatConcurrency) {
      return fail(res, ctx, 503, 'The tutor is busy right now. Please try again in a moment.', { 'Retry-After': '10' });
    }
    activeChats += 1;
    res.on('close', () => (activeChats -= 1));
    return forward(req, res, ctx, {
      method: 'POST',
      upstreamPath: nativeChat ? `/api/v1/chats/${chatId}/completions` : `/api/v1/chats_openai/${chatId}/chat/completions`,
      body: upstreamBody,
      timeoutMs: 180_000,
    });
  }

  // POST /api/v1/retrieval (citations)
  if (req.method === 'POST' && p === '/api/v1/retrieval') {
    ctx.route = 'retrieval';
    const claims = requireUser(req, res, ctx);
    if (!claims) return;
    if (!limit(res, ctx, `chat:${claims.sub}`, CFG.limits.userChat)) return;
    await ensureCatalogue();
    const body = await readJsonBody(req, 16 * 1024);
    const question = typeof body.question === 'string' ? body.question.trim().slice(0, 2000) : '';
    const datasetIds = (Array.isArray(body.dataset_ids) ? body.dataset_ids : []).filter(
      (id) => typeof id === 'string' && HEX32.test(id) && catalogue.datasets.has(id),
    );
    if (!question || datasetIds.length === 0) return fail(res, ctx, 400, 'Nothing to search.');
    return forward(req, res, ctx, {
      method: 'POST',
      upstreamPath: '/api/v1/retrieval',
      body: {
        question,
        dataset_ids: datasetIds.slice(0, 12),
        page_size: Math.min(int(body.page_size, 6), 10),
        similarity_threshold: Math.min(Math.max(Number(body.similarity_threshold ?? 0.2) || 0.2, 0), 1),
        vector_similarity_weight: Math.min(Math.max(Number(body.vector_similarity_weight ?? 0.3) || 0.3, 0), 1),
        keyword: false,
      },
      transform: (json) => ({ code: 0, data: { chunks: (json.data?.chunks ?? []).map(pickChunk) } }),
    });
  }

  ctx.route = 'blocked';
  return fail(res, ctx, 404, 'Not found.');
}

// ---------------------------------------------------------------- server

const server = http.createServer(async (req, res) => {
  const ctx = { ip: clientIp(req), uid: null, route: '-', status: 0, bytes: 0, start: Date.now(), cors: corsHeaders(req) };
  res.on('finish', () => {
    log({ ip: ctx.ip, uid: ctx.uid, m: req.method, route: ctx.route, path: req.url.split('?')[0].slice(0, 120), status: ctx.status || res.statusCode, ms: Date.now() - ctx.start, bytes: ctx.bytes, funnel: req.headers['tailscale-funnel-request'] ? 1 : 0 });
  });

  try {
    const banned = bans.get(ctx.ip);
    if (banned && banned > Date.now()) {
      ctx.route = 'banned';
      return fail(res, ctx, 429, 'Too many failed requests. Try again later.', { 'Retry-After': String(Math.ceil((banned - Date.now()) / 1000)) });
    }

    // Browsers on other websites may not use this gateway.
    const origin = req.headers.origin;
    if (origin && !CFG.origins.includes(origin)) {
      ctx.route = 'bad-origin';
      return fail(res, ctx, 403, 'Origin not allowed.');
    }

    if (req.method === 'OPTIONS') {
      ctx.route = 'preflight';
      ctx.status = 204;
      res.writeHead(204, ctx.cors);
      return res.end();
    }

    if (!['GET', 'POST'].includes(req.method)) {
      ctx.route = 'blocked';
      return fail(res, ctx, 405, 'Method not allowed.');
    }

    if (!limit(res, ctx, `all:${ctx.ip}`, CFG.limits.ipAll)) return;
    await handle(req, res, ctx);
  } catch (error) {
    if (!res.headersSent) fail(res, ctx, error.status || 500, error.status ? error.message : 'Gateway error.');
    else res.destroy();
    if (!error.status) log({ event: 'error', message: String(error?.stack || error).slice(0, 500) });
  }
});

server.headersTimeout = 20_000;
server.requestTimeout = 200_000;
server.keepAliveTimeout = 5_000;

server.listen(CFG.port, CFG.host, async () => {
  await refreshCatalogue();
  // RAGFlow takes ~3 minutes to boot after a restart; keep retrying instead of
  // serving an empty catalogue for 5 minutes.
  const retry = setInterval(async () => {
    if (!catalogue.error && catalogue.datasets.size > 0) {
      clearInterval(retry);
      void ensureIndex();
      return;
    }
    await refreshCatalogue();
  }, 15_000);
  if (!catalogue.error) void ensureIndex();
  console.log(
    `[gateway] listening on http://${CFG.host}:${CFG.port} → ${CFG.upstream} | assistants=${catalogue.chats.size} datasets=${catalogue.datasets.size}${catalogue.error ? ` | upstream error: ${catalogue.error}` : ''}`,
  );
  if (env.MONITOR_TOKEN) {
    startMonitor({
      supabaseUrl: (env.SUPABASE_URL || '').replace(/\/+$/, ''),
      anonKey: env.SUPABASE_ANON_KEY,
      hostId: env.MONITOR_HOST_ID,
      token: env.MONITOR_TOKEN,
      intervalS: int(env.MONITOR_INTERVAL_S, 30),
      gatewayPort: CFG.port,
      ragflowUrl: CFG.upstream,
      ragflowKey: CFG.apiKey,
      log,
    });
    console.log(`[gateway] host monitor → ${env.MONITOR_HOST_ID}`);
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
