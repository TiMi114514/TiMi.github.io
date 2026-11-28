// Supabase Edge Function: send-mail
//
// Sends email through an SMTP server configured in the dashboard
// (public.service_configs, secrets in Vault). Supports:
//   - XOAUTH2 (Outlook.com / Microsoft 365): client_id + refresh_token
//     (+ client_secret for confidential apps); the access token is refreshed
//     automatically, and a rotated refresh token is saved back to Vault.
//   - LOGIN / PLAIN with username + password (for other providers).
//
// Callers:
//   - pg_cron alert watcher (header x-mail-key = vault secret "mail_hook_key")
//   - the admin dashboard "Send test" button (admin's JWT)
//   - OAuth setup: action=oauth_start / oauth_callback (admin JWT / Microsoft redirect)
//
// Body: { action?: "send" | "test" | "oauth_start", to?: string[], subject?, text?, html?, config_id? }

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const SITE_ORIGINS = ['https://timi114514.github.io', 'http://127.0.0.1:4173', 'http://localhost:3000'];
const FN_URL = `${SUPABASE_URL}/functions/v1/send-mail`;

function cors(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': SITE_ORIGINS.includes(origin) ? origin : SITE_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, content-type, x-mail-key, apikey',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    Vary: 'Origin',
  };
}

const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

type Config = { id: string; name: string; enabled: boolean; settings: Record<string, unknown> };

async function secret(id: string, field: string): Promise<string | null> {
  const { data } = await db.rpc('_svc_secret', { p_config: id, p_field: field });
  return (data as string | null) ?? null;
}

async function storeSecret(id: string, field: string, value: string) {
  // service role bypasses the admin guard via a direct vault call
  const name = `svc:${id}:${field}`;
  const { data: existing } = await db.schema('vault').from('secrets').select('id').eq('name', name).maybeSingle();
  if (existing?.id) await db.rpc('_svc_vault_update', { p_id: existing.id, p_value: value });
  else await db.rpc('_svc_vault_create', { p_name: name, p_value: value });
  const { data: row } = await db.from('service_configs').select('secret_fields').eq('id', id).single();
  const fields = { ...(row?.secret_fields ?? {}), [field]: { last4: value.slice(-4), updated_at: new Date().toISOString() } };
  await db.from('service_configs').update({ secret_fields: fields }).eq('id', id);
}

async function loadConfig(configId?: string): Promise<Config> {
  let q = db.from('service_configs').select('id, name, enabled, settings').eq('kind', 'smtp');
  q = configId ? q.eq('id', configId) : q.eq('is_default', true);
  const { data, error } = await q.maybeSingle();
  if (error || !data) throw new Error(configId ? 'SMTP config not found' : 'No default SMTP config');
  return data as Config;
}

// ---------------------------------------------------------------- OAuth (Microsoft identity platform)
function tokenUrl(s: Record<string, unknown>) {
  return `https://login.microsoftonline.com/${s.oauth_tenant || 'consumers'}/oauth2/v2.0/token`;
}

async function accessToken(cfg: Config): Promise<string> {
  const s = cfg.settings;
  const clientId = String(s.oauth_client_id || '');
  const refresh = await secret(cfg.id, 'refresh_token');
  if (!clientId || !refresh) throw new Error('OAuth not connected yet (missing client id or refresh token)');
  const form = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refresh,
    scope: String(s.oauth_scope || 'https://outlook.office.com/SMTP.Send offline_access'),
  });
  const clientSecret = await secret(cfg.id, 'client_secret');
  if (clientSecret) form.set('client_secret', clientSecret);
  const r = await fetch(tokenUrl(s), { method: 'POST', body: form });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`OAuth refresh failed: ${j.error_description || j.error || r.status}`);
  if (j.refresh_token && j.refresh_token !== refresh) await storeSecret(cfg.id, 'refresh_token', j.refresh_token);
  return j.access_token as string;
}

// ---------------------------------------------------------------- minimal SMTP client (STARTTLS / implicit TLS)
class Smtp {
  private conn!: Deno.TcpConn | Deno.TlsConn;
  private buf = '';
  private enc = new TextEncoder();
  private dec = new TextDecoder();
  log: string[] = [];

  async open(host: string, port: number, implicitTls: boolean) {
    this.conn = implicitTls ? await Deno.connectTls({ hostname: host, port }) : await Deno.connect({ hostname: host, port });
    await this.expect(220);
  }
  private async readReply(): Promise<{ code: number; text: string }> {
    const chunk = new Uint8Array(4096);
    for (;;) {
      const lines = this.buf.split('\r\n');
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i])) {
          const reply = lines.slice(0, i + 1).join('\n');
          this.buf = lines.slice(i + 1).join('\r\n');
          this.log.push('< ' + reply.slice(0, 200));
          return { code: Number(lines[i].slice(0, 3)), text: reply };
        }
      }
      const n = await this.conn.read(chunk);
      if (n === null) throw new Error('SMTP connection closed');
      this.buf += this.dec.decode(chunk.subarray(0, n));
    }
  }
  async expect(...codes: number[]) {
    const r = await this.readReply();
    if (!codes.includes(r.code)) throw new Error(`SMTP ${r.code}: ${r.text.slice(0, 200)}`);
    return r;
  }
  async cmd(line: string, codes: number[], redact = false) {
    this.log.push('> ' + (redact ? line.split(' ')[0] + ' ***' : line));
    await this.conn.write(this.enc.encode(line + '\r\n'));
    return this.expect(...codes);
  }
  async starttls(host: string) {
    await this.cmd('STARTTLS', [220]);
    this.conn = await Deno.startTls(this.conn as Deno.TcpConn, { hostname: host });
  }
  async data(message: string) {
    await this.cmd('DATA', [354]);
    const body = message.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
    await this.conn.write(this.enc.encode(body + '\r\n.\r\n'));
    await this.expect(250);
  }
  close() {
    try {
      this.conn.close();
    } catch {
      /* ignore */
    }
  }
}

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

function buildMessage(from: string, fromName: string, to: string[], subject: string, text: string, html?: string) {
  const boundary = 'b' + crypto.randomUUID().replace(/-/g, '');
  const headers = [
    `From: ${encodeHeader(fromName)} <${from}>`,
    `To: ${to.join(', ')}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@alevel-hub>`,
    'MIME-Version: 1.0',
  ];
  const textPart = b64(text).replace(/.{76}/g, '$&\r\n');
  if (!html) return [...headers, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', textPart].join('\r\n');
  const htmlPart = b64(html).replace(/.{76}/g, '$&\r\n');
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', textPart,
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', htmlPart,
    `--${boundary}--`,
  ].join('\r\n');
}

async function sendMail(cfg: Config, to: string[], subject: string, text: string, html?: string) {
  const s = cfg.settings;
  const host = String(s.host);
  const port = Number(s.port || 587);
  const security = String(s.security || 'starttls');
  const username = String(s.username || '');
  const from = String(s.from_email || username);
  const smtp = new Smtp();
  try {
    await smtp.open(host, port, security === 'tls');
    await smtp.cmd('EHLO alevel-hub', [250]);
    if (security === 'starttls') {
      await smtp.starttls(host);
      await smtp.cmd('EHLO alevel-hub', [250]);
    }
    if (String(s.auth || 'login') === 'xoauth2') {
      const token = await accessToken(cfg);
      await smtp.cmd(`AUTH XOAUTH2 ${b64(`user=${username}\x01auth=Bearer ${token}\x01\x01`)}`, [235], true);
    } else {
      const password = await secret(cfg.id, 'password');
      if (!password) throw new Error('SMTP password not set');
      await smtp.cmd('AUTH LOGIN', [334]);
      await smtp.cmd(b64(username), [334], true);
      await smtp.cmd(b64(password), [235], true);
    }
    await smtp.cmd(`MAIL FROM:<${from}>`, [250]);
    for (const rcpt of to) await smtp.cmd(`RCPT TO:<${rcpt}>`, [250, 251]);
    await smtp.data(buildMessage(from, String(s.from_name || 'A-Level Hub'), to, subject, text, html));
    await smtp.cmd('QUIT', [221]).catch(() => undefined);
    return { ok: true, log: smtp.log };
  } finally {
    smtp.close();
  }
}

// ---------------------------------------------------------------- auth helpers
async function isAdmin(req: Request): Promise<string | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  if (!email) return null;
  const { data: row } = await db.from('admins').select('email').ilike('email', email).maybeSingle();
  return row ? email : null;
}

async function hookKeyOk(req: Request) {
  const key = req.headers.get('x-mail-key');
  if (!key) return false;
  const { data } = await db.rpc('_svc_named_secret', { p_name: 'mail_hook_key' });
  return !!data && data === key;
}

// ---------------------------------------------------------------- handler
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  const url = new URL(req.url);

  // Microsoft redirects the browser here after consent.
  if (req.method === 'GET' && url.searchParams.get('action') === 'oauth_callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state') || '';
    const back = 'https://timi114514.github.io/TiMi.github.io/admin/services/';
    try {
      if (!code) throw new Error(url.searchParams.get('error_description') || 'no code returned');
      const { data: st } = await db.rpc('_svc_named_secret', { p_name: `oauth_state:${state}` });
      if (!st) throw new Error('setup link expired, start again from the dashboard');
      const cfg = await loadConfig(String(st));
      const s = cfg.settings;
      const form = new URLSearchParams({
        client_id: String(s.oauth_client_id || ''),
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${FN_URL}?action=oauth_callback`,
        scope: String(s.oauth_scope || 'https://outlook.office.com/SMTP.Send offline_access'),
      });
      const cs = await secret(cfg.id, 'client_secret');
      if (cs) form.set('client_secret', cs);
      const r = await fetch(tokenUrl(s), { method: 'POST', body: form });
      const j = await r.json();
      if (!r.ok || !j.refresh_token) throw new Error(j.error_description || j.error || `token exchange failed (${r.status})`);
      await storeSecret(cfg.id, 'refresh_token', j.refresh_token);
      await db.rpc('_svc_named_secret_delete', { p_name: `oauth_state:${state}` });
      await db.rpc('service_record_test', { p_id: cfg.id, p_ok: true, p_message: 'OAuth connected' });
      return Response.redirect(`${back}?oauth=ok`, 302);
    } catch (e) {
      return Response.redirect(`${back}?oauth=error&message=${encodeURIComponent((e as Error).message)}`, 302);
    }
  }

  if (req.method !== 'POST') return json(req, 405, { error: 'POST only' });
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const action = String(body.action || 'send');

  try {
    if (action === 'oauth_start') {
      const admin = await isAdmin(req);
      if (!admin) return json(req, 403, { error: 'admin only' });
      const cfg = await loadConfig(body.config_id as string | undefined);
      const s = cfg.settings;
      if (!s.oauth_client_id) return json(req, 400, { error: 'Fill in the OAuth client ID first' });
      const state = crypto.randomUUID();
      await db.rpc('_svc_named_secret_set', { p_name: `oauth_state:${state}`, p_value: cfg.id });
      const auth = new URL(`https://login.microsoftonline.com/${s.oauth_tenant || 'consumers'}/oauth2/v2.0/authorize`);
      auth.search = new URLSearchParams({
        client_id: String(s.oauth_client_id),
        response_type: 'code',
        redirect_uri: `${FN_URL}?action=oauth_callback`,
        response_mode: 'query',
        scope: String(s.oauth_scope || 'https://outlook.office.com/SMTP.Send offline_access'),
        state,
        prompt: 'select_account',
        login_hint: String(s.username || ''),
      }).toString();
      return json(req, 200, { url: auth.toString(), redirect_uri: `${FN_URL}?action=oauth_callback` });
    }

    if (action === 'test') {
      const admin = await isAdmin(req);
      if (!admin) return json(req, 403, { error: 'admin only' });
      const cfg = await loadConfig(body.config_id as string | undefined);
      const to = Array.isArray(body.to) && body.to.length ? (body.to as string[]) : [admin];
      try {
        const r = await sendMail(cfg, to, '[A-Level Hub] SMTP 测试邮件', `这是一封来自 A-Level Hub 后台的测试邮件。\n\nSMTP 配置：${cfg.name}\n时间：${new Date().toISOString()}\n\n收到即表示发信正常。`);
        await db.rpc('service_record_test', { p_id: cfg.id, p_ok: true, p_message: `sent to ${to.join(', ')}` });
        return json(req, 200, { ok: true, log: r.log });
      } catch (e) {
        await db.rpc('service_record_test', { p_id: cfg.id, p_ok: false, p_message: (e as Error).message });
        return json(req, 200, { ok: false, error: (e as Error).message });
      }
    }

    // action === 'send' (alert watcher)
    if (!(await hookKeyOk(req)) && !(await isAdmin(req))) return json(req, 403, { error: 'forbidden' });
    const to = (body.to as string[]) ?? [];
    if (!to.length || !body.subject) return json(req, 400, { error: 'to and subject are required' });
    const cfg = await loadConfig(body.config_id as string | undefined);
    if (!cfg.enabled) return json(req, 409, { error: 'SMTP config is disabled' });
    await sendMail(cfg, to.slice(0, 20), String(body.subject).slice(0, 200), String(body.text || ''), body.html as string | undefined);
    return json(req, 200, { ok: true });
  } catch (e) {
    return json(req, 500, { ok: false, error: (e as Error).message });
  }
});
