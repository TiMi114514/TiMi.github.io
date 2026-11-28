'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, Mail, Plug, Plus, Send, Trash2, XCircle } from 'lucide-react';
import { Badge, Button, Empty, ErrorBox, PageHeader, Panel, RefreshButton, formatWhen, inputClass, useAdminData } from '@/components/admin/ui';
import { supabase } from '@/lib/supabase';

type SecretMeta = Record<string, { last4: string; updated_at: string }>;
type ServiceConfig = {
  id: string;
  kind: 'smtp' | 'api';
  name: string;
  purpose: string;
  enabled: boolean;
  is_default: boolean;
  settings: Record<string, string | number | boolean>;
  secret_fields: SecretMeta;
  last_test: { at: string; ok: boolean; message: string } | null;
  updated_at: string;
  updated_by: string | null;
};

type Field = { key: string; label: string; placeholder?: string; type?: 'text' | 'number' | 'select'; options?: string[]; help?: string };

const SMTP_FIELDS: Field[] = [
  { key: 'host', label: '服务器', placeholder: 'smtp-mail.outlook.com' },
  { key: 'port', label: '端口', placeholder: '587', type: 'number' },
  { key: 'security', label: '加密', type: 'select', options: ['starttls', 'tls', 'none'], help: '587 端口用 starttls，465 用 tls' },
  { key: 'auth', label: '登录方式', type: 'select', options: ['xoauth2', 'login'], help: 'Outlook.com 必须用 xoauth2（OAuth2）' },
  { key: 'username', label: '登录账号', placeholder: 'you@outlook.com' },
  { key: 'from_email', label: '发件地址', placeholder: '通常与登录账号相同' },
  { key: 'from_name', label: '发件人名称', placeholder: 'A-Level Hub' },
  { key: 'oauth_client_id', label: 'OAuth 应用 ID（Client ID）', placeholder: 'Azure 应用注册里的 Application (client) ID', help: '仅 xoauth2 需要' },
  { key: 'oauth_tenant', label: 'OAuth 租户', placeholder: 'consumers', help: '个人 Outlook.com 填 consumers' },
  { key: 'oauth_scope', label: 'OAuth 权限', placeholder: 'https://outlook.office.com/SMTP.Send offline_access' },
];
const SMTP_SECRETS = [
  { key: 'client_secret', label: 'OAuth 客户端密钥（可选）', help: '公共客户端可不填' },
  { key: 'refresh_token', label: 'OAuth 刷新令牌', help: '点「连接 Outlook」自动获取，无需手填' },
  { key: 'password', label: '密码 / 应用密码', help: '仅「login」方式使用' },
];
const API_FIELDS: Field[] = [
  { key: 'provider', label: '服务商', placeholder: 'Resend / DeepSeek / Kimi / 自定义' },
  { key: 'base_url', label: 'API 地址（Base URL）', placeholder: 'https://api.example.com/v1' },
  { key: 'model', label: '默认模型（可选）', placeholder: 'deepseek-chat' },
  { key: 'notes', label: '备注', placeholder: '用途、额度、负责人…' },
];
const API_SECRETS = [{ key: 'api_key', label: 'API Key', help: '只保存加密值，保存后不再显示' }];

const PURPOSES: Record<string, string> = { alerts: '故障告警', auth_email: '注册验证邮件', ai: 'AI 服务', general: '通用' };

const FN_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-mail`;

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Supabase 未配置');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.code === '42501' ? '需要管理员权限' : error.message);
  return data as T;
}

async function callFunction(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase 未配置');
  const { data } = await supabase.auth.getSession();
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

function emptyConfig(kind: 'smtp' | 'api'): ServiceConfig {
  return {
    id: '',
    kind,
    name: '',
    purpose: kind === 'smtp' ? 'alerts' : 'general',
    enabled: true,
    is_default: false,
    settings: kind === 'smtp' ? { port: 587, security: 'starttls', auth: 'login' } : {},
    secret_fields: {},
    last_test: null,
    updated_at: '',
    updated_by: null,
  };
}

function Editor({ initial, onDone }: { initial: ServiceConfig; onDone: (msg?: string) => void }) {
  const [cfg, setCfg] = useState<ServiceConfig>(initial);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = cfg.kind === 'smtp' ? SMTP_FIELDS : API_FIELDS;
  const secretDefs = cfg.kind === 'smtp' ? SMTP_SECRETS : API_SECRETS;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const settings = Object.fromEntries(
        Object.entries(cfg.settings).filter(([, v]) => v !== '' && v !== null && v !== undefined).map(([k, v]) => [k, k === 'port' ? Number(v) : v]),
      );
      const saved = await rpc<ServiceConfig>('admin_service_upsert', {
        p_id: cfg.id || null,
        p_kind: cfg.kind,
        p_name: cfg.name,
        p_purpose: cfg.purpose,
        p_enabled: cfg.enabled,
        p_is_default: cfg.is_default,
        p_settings: settings,
      });
      for (const [field, value] of Object.entries(secrets)) {
        if (value.trim()) await rpc('admin_service_secret_set', { p_id: saved.id, p_field: field, p_value: value.trim() });
      }
      onDone('已保存');
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  async function clearSecret(field: string) {
    if (!cfg.id || !window.confirm(`清除已保存的「${field}」？`)) return;
    await rpc('admin_service_secret_set', { p_id: cfg.id, p_field: field, p_value: null }).catch((e) => setError(String(e.message)));
    const next = { ...cfg.secret_fields };
    delete next[field];
    setCfg({ ...cfg, secret_fields: next });
  }

  const set = (k: string, v: string) => setCfg({ ...cfg, settings: { ...cfg.settings, [k]: v } });

  return (
    <div className="space-y-4 p-5 text-[12.5px]">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-[#71717a]">名称</span>
          <input value={cfg.name} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} className={inputClass} placeholder={cfg.kind === 'smtp' ? 'Outlook.com' : 'Resend'} />
        </label>
        <label className="block space-y-1">
          <span className="text-[#71717a]">用途</span>
          <select value={cfg.purpose} onChange={(e) => setCfg({ ...cfg, purpose: e.target.value })} className={inputClass}>
            {Object.entries(PURPOSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-4 pb-2">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />启用</label>
          {cfg.kind === 'smtp' ? (
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={cfg.is_default} onChange={(e) => setCfg({ ...cfg, is_default: e.target.checked })} />设为默认发信</label>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className="block space-y-1">
            <span className="text-[#71717a]">{f.label}</span>
            {f.type === 'select' ? (
              <select value={String(cfg.settings[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} className={inputClass}>
                {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input type={f.type === 'number' ? 'number' : 'text'} value={String(cfg.settings[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} className={inputClass} />
            )}
            {f.help ? <span className="block text-[11px] text-[#a1a1aa]">{f.help}</span> : null}
          </label>
        ))}
      </div>

      <div className="rounded-lg border border-[#e4e4e7] bg-[#fafafa] p-3">
        <p className="mb-2 flex items-center gap-1.5 font-medium"><KeyRound className="h-3.5 w-3.5" /> 机密字段（加密保存，保存后只显示末 4 位）</p>
        <div className="grid gap-3 md:grid-cols-2">
          {secretDefs.map((s) => {
            const meta = cfg.secret_fields[s.key];
            return (
              <label key={s.key} className="block space-y-1">
                <span className="flex items-center justify-between text-[#71717a]">
                  {s.label}
                  {meta ? (
                    <span className="flex items-center gap-2 text-[11px]">
                      <Badge tone="green">已设置 ····{meta.last4}</Badge>
                      <button type="button" onClick={() => void clearSecret(s.key)} className="text-[#b91c1c] hover:underline">清除</button>
                    </span>
                  ) : <Badge tone="gray">未设置</Badge>}
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={secrets[s.key] ?? ''}
                  onChange={(e) => setSecrets({ ...secrets, [s.key]: e.target.value })}
                  placeholder={meta ? '留空表示不修改' : ''}
                  className={inputClass}
                />
                <span className="block text-[11px] text-[#a1a1aa]">{s.help}</span>
              </label>
            );
          })}
        </div>
      </div>

      {error ? <p className="text-[12px] text-[#b91c1c]">{error}</p> : null}
      <div className="flex gap-2">
        <Button variant="dark" onClick={() => void save()} disabled={busy || !cfg.name.trim()}>{busy ? '保存中…' : '保存'}</Button>
        <Button onClick={() => onDone()}>取消</Button>
      </div>
    </div>
  );
}

export default function AdminServicesPage() {
  const { data, error, loading, reload } = useAdminData(() => rpc<{ items: ServiceConfig[] }>('admin_service_list'), []);
  const [editing, setEditing] = useState<ServiceConfig | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('oauth') === 'ok') setNote({ ok: true, text: 'Outlook 已连接（刷新令牌已加密保存）。现在可以点「发送测试邮件」。' });
    if (p.get('oauth') === 'error') setNote({ ok: false, text: `Outlook 连接失败：${p.get('message') ?? '未知错误'}` });
    if (p.get('oauth')) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const items = data?.items ?? [];
  const smtp = useMemo(() => items.filter((i) => i.kind === 'smtp'), [items]);
  const apis = useMemo(() => items.filter((i) => i.kind === 'api'), [items]);

  async function remove(c: ServiceConfig) {
    if (!window.confirm(`删除「${c.name}」及其全部加密字段？此操作不可恢复。`)) return;
    try {
      await rpc('admin_service_delete', { p_id: c.id });
      setNote({ ok: true, text: `已删除 ${c.name}` });
      await reload();
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : '删除失败' });
    }
  }

  async function test(c: ServiceConfig) {
    setBusyId(c.id);
    setNote(null);
    try {
      const r = await callFunction({ action: 'test', config_id: c.id });
      setNote(r.ok ? { ok: true, text: '测试邮件已发出，请查收（首次可能在垃圾邮件中）。' } : { ok: false, text: `发送失败：${r.error ?? '未知错误'}` });
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function connectOutlook(c: ServiceConfig) {
    setBusyId(c.id);
    try {
      const r = await callFunction({ action: 'oauth_start', config_id: c.id });
      if (r.url) window.location.href = r.url;
      else setNote({ ok: false, text: r.error ?? '无法开始授权' });
    } finally {
      setBusyId(null);
    }
  }

  const row = (c: ServiceConfig) => (
    <div key={c.id} className="px-5 py-3.5 text-[12.5px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {c.name}
            {c.is_default ? <Badge tone="blue">默认发信</Badge> : null}
            <Badge tone={c.enabled ? 'green' : 'gray'}>{c.enabled ? '启用' : '停用'}</Badge>
            <Badge tone="gray">{PURPOSES[c.purpose] ?? c.purpose}</Badge>
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-[#71717a]">
            {c.kind === 'smtp'
              ? `${c.settings.host}:${c.settings.port} · ${c.settings.security} · ${c.settings.auth} · ${c.settings.username ?? ''}`
              : `${c.settings.provider ?? ''} ${c.settings.base_url ?? ''}`}
          </p>
          <p className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
            {Object.entries(c.secret_fields).map(([k, m]) => <Badge key={k} tone="green">{k} ····{m.last4}</Badge>)}
            {Object.keys(c.secret_fields).length === 0 ? <span className="text-[#a1a1aa]">尚未设置任何机密字段</span> : null}
          </p>
          {c.last_test ? (
            <p className={`mt-1 flex items-center gap-1 text-[11px] ${c.last_test.ok ? 'text-[#15803d]' : 'text-[#b91c1c]'}`}>
              {c.last_test.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
              {formatWhen(c.last_test.at)} · {c.last_test.message}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {c.kind === 'smtp' && c.settings.auth === 'xoauth2' ? (
            <Button onClick={() => void connectOutlook(c)} disabled={busyId === c.id || !c.settings.oauth_client_id}>
              <Plug className="h-3.5 w-3.5" /> {c.secret_fields.refresh_token ? '重新连接 Outlook' : '连接 Outlook'}
            </Button>
          ) : null}
          {c.kind === 'smtp' ? (
            <Button onClick={() => void test(c)} disabled={busyId === c.id}><Send className="h-3.5 w-3.5" /> {busyId === c.id ? '发送中…' : '发送测试邮件'}</Button>
          ) : null}
          <Button onClick={() => setEditing(c)}>编辑</Button>
          <Button variant="danger" onClick={() => void remove(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="服务配置"
        description="在这里添加、修改或删除 SMTP 发信服务器和第三方 API 配置。密码、API Key、OAuth 令牌加密保存在 Supabase Vault，保存后只显示末 4 位，任何页面都无法再读出原值。"
        actions={<RefreshButton onClick={() => void reload()} loading={loading} />}
      />
      <ErrorBox message={error} />
      {note ? (
        <p className={`mt-3 rounded-lg border px-3 py-2 text-[12.5px] ${note.ok ? 'border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]' : 'border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]'}`}>{note.text}</p>
      ) : null}

      {editing ? (
        <Panel className="mt-4" title={editing.id ? `编辑：${editing.name}` : editing.kind === 'smtp' ? '新增 SMTP 服务器' : '新增 API 配置'}>
          <Editor initial={editing} onDone={async (msg) => { setEditing(null); if (msg) setNote({ ok: true, text: msg }); await reload(); }} />
        </Panel>
      ) : null}

      <Panel
        className="mt-4"
        title={<span className="flex items-center gap-2"><Mail className="h-4 w-4 text-[#71717a]" /> SMTP 发信服务器</span>}
        right={<Button onClick={() => setEditing(emptyConfig('smtp'))}><Plus className="h-3.5 w-3.5" /> 新增 SMTP</Button>}
      >
        {!data ? <Empty>加载中…</Empty> : smtp.length === 0 ? <Empty>还没有 SMTP 配置</Empty> : <div className="divide-y divide-[#f0f0f1]">{smtp.map(row)}</div>}
        <div className="border-t border-[#f0f0f1] px-5 py-3 text-[11.5px] leading-relaxed text-[#71717a]">
          故障告警邮件通过「默认发信」的 SMTP 从云端发出，家里电脑断网也能收到。Outlook.com 只接受 OAuth2：先在 Azure 注册应用并填入应用 ID，再点「连接 Outlook」登录授权一次即可。
          授权回调地址：<span className="select-all font-mono">{FN_URL}?action=oauth_callback</span>
        </div>
      </Panel>

      <Panel
        className="mt-4"
        title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-[#71717a]" /> API 配置</span>}
        right={<Button onClick={() => setEditing(emptyConfig('api'))}><Plus className="h-3.5 w-3.5" /> 新增 API</Button>}
      >
        {!data ? <Empty>加载中…</Empty> : apis.length === 0 ? <Empty>还没有 API 配置</Empty> : <div className="divide-y divide-[#f0f0f1]">{apis.map(row)}</div>}
      </Panel>
    </div>
  );
}
