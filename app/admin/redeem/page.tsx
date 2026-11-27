'use client';

import { useMemo, useState } from 'react';
import { Copy, Download, Plus, Ticket, XCircle } from 'lucide-react';
import { Badge, Button, Empty, ErrorBox, PageHeader, Panel, RefreshButton, formatWhen, inputClass, useAdminData } from '@/components/admin/ui';
import { supabase } from '@/lib/supabase';

type CodeRow = {
  id: number;
  code: string;
  batch: string | null;
  days: number | null;
  note: string | null;
  expires_at: string | null;
  status: 'active' | 'redeemed' | 'void' | 'revoked' | 'expired';
  redeemed_email: string | null;
  redeemed_at: string | null;
  granted_until: string | null;
  created_by: string | null;
  created_at: string;
};
type ListResult = { items: CodeRow[]; counts: { active: number; redeemed: number; expired: number; void: number; pro_members: number } };

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Supabase 未配置');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.code === '42501' ? '需要管理员权限' : error.message);
  return data as T;
}

const STATUS: Record<CodeRow['status'], { label: string; tone: 'green' | 'blue' | 'gray' | 'red' | 'amber' }> = {
  active: { label: '未使用', tone: 'green' },
  redeemed: { label: '已兑换', tone: 'blue' },
  expired: { label: '已过期', tone: 'amber' },
  void: { label: '已作废', tone: 'gray' },
  revoked: { label: '已撤销', tone: 'red' },
};

function toCsv(rows: CodeRow[]): string {
  const head = ['兑换码', '批次', '会员天数', '备注', '兑换截止', '状态', '兑换账号', '兑换时间', '会员到期'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return '\ufeff' + [head, ...rows.map((r) => [r.code, r.batch, r.days ?? '永久', r.note, r.expires_at, STATUS[r.status].label, r.redeemed_email, r.redeemed_at, r.granted_until])].map((r) => r.map(esc).join(',')).join('\r\n');
}

export default function AdminRedeemPage() {
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const { data, error, loading, reload } = useAdminData(
    () => rpc<ListResult>('admin_redeem_list', { p_status: status, p_search: search || null, p_limit: 1000 }),
    [status, search],
  );

  const [count, setCount] = useState(10);
  const [days, setDays] = useState<string>('30');
  const [expires, setExpires] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ batch: string; codes: string[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [quota, setQuota] = useState<{ free: string; pro: string } | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await rpc<{ batch: string; codes: string[] }>('admin_redeem_create', {
        p_count: count,
        p_days: days === 'forever' ? null : Number(days),
        p_expires_at: expires ? new Date(expires + 'T23:59:59+08:00').toISOString() : null,
        p_note: note || null,
      });
      setCreated(r);
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '生成失败');
    } finally {
      setBusy(false);
    }
  }

  async function voidCode(row: CodeRow) {
    const text = row.status === 'redeemed'
      ? `撤销 ${row.code}？\n将收回 ${row.redeemed_email} 通过此码获得的${row.days ? ` ${row.days} 天` : '永久'}会员。`
      : `作废未使用的兑换码 ${row.code}？`;
    if (!window.confirm(text)) return;
    try {
      await rpc('admin_redeem_void', { p_id: row.id });
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '操作失败');
    }
  }

  function download(rows: CodeRow[], name: string) {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function saveQuota() {
    if (!quota) return;
    try {
      await rpc('admin_membership_config', { p_free: Number(quota.free), p_pro: Number(quota.pro) });
      setMsg('AI 额度已保存，立即生效');
      setQuota(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '保存失败');
    }
  }

  const items = data?.items ?? [];
  const batchRows = useMemo(() => (created ? items.filter((r) => r.batch === created.batch) : []), [created, items]);

  return (
    <div>
      <PageHeader
        title="兑换码"
        description="生成会员兑换码（一码一用），可设置会员天数与兑换截止日期。会员权益：AI 辅导每日提问额度更高、真人辅导预约优先处理。"
        actions={<RefreshButton onClick={() => void reload()} loading={loading} />}
      />
      <ErrorBox message={error} />
      {msg ? <p className="mt-3 rounded-lg border border-[#e4e4e7] bg-white px-3 py-2 text-[12.5px]">{msg}</p> : null}

      <div className="mt-5 grid gap-3 md:grid-cols-5">
        {[
          ['未使用', data?.counts.active],
          ['已兑换', data?.counts.redeemed],
          ['已过期', data?.counts.expired],
          ['作废 / 撤销', data?.counts.void],
          ['当前会员人数', data?.counts.pro_members],
        ].map(([label, v]) => (
          <div key={String(label)} className="rounded-xl border border-[#e4e4e7] bg-white px-4 py-3.5">
            <p className="text-[11.5px] text-[#71717a]">{label}</p>
            <p className="mt-1 text-[22px] font-semibold tabular-nums">{v ?? '—'}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Panel title={<span className="flex items-center gap-2"><Plus className="h-4 w-4 text-[#71717a]" /> 生成兑换码</span>}>
            <form onSubmit={create} className="space-y-3 p-5 text-[12.5px]">
              <label className="block space-y-1">
                <span className="text-[#71717a]">数量（1–500）</span>
                <input type="number" min={1} max={500} value={count} onChange={(e) => setCount(Number(e.target.value))} className={inputClass} />
              </label>
              <label className="block space-y-1">
                <span className="text-[#71717a]">会员时长</span>
                <select value={days} onChange={(e) => setDays(e.target.value)} className={inputClass}>
                  {['7', '30', '90', '180', '365'].map((d) => <option key={d} value={d}>{d} 天</option>)}
                  <option value="forever">永久</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[#71717a]">兑换截止日期（选填，过期未兑换即失效）</span>
                <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={inputClass} />
              </label>
              <label className="block space-y-1">
                <span className="text-[#71717a]">备注（选填，如活动名称）</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} className={inputClass} />
              </label>
              <Button variant="dark" type="submit" disabled={busy}>{busy ? '生成中…' : '生成'}</Button>
            </form>
          </Panel>

          {created ? (
            <Panel title={`本次生成 ${created.codes.length} 个`} right={<span className="font-mono text-[10.5px]">{created.batch}</span>}>
              <div className="space-y-2 p-4">
                <textarea readOnly value={created.codes.join('\n')} rows={Math.min(10, created.codes.length)} className={`${inputClass} font-mono text-[12px]`} />
                <div className="flex gap-2">
                  <Button onClick={() => void navigator.clipboard.writeText(created.codes.join('\n'))}><Copy className="h-3.5 w-3.5" /> 复制全部</Button>
                  <Button onClick={() => download(batchRows, `兑换码-${created.batch}.csv`)}><Download className="h-3.5 w-3.5" /> 导出 CSV</Button>
                </div>
              </div>
            </Panel>
          ) : null}

          <Panel title="会员 AI 额度（每日提问次数）">
            <div className="space-y-3 p-5 text-[12.5px]">
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1"><span className="text-[#71717a]">免费版</span>
                  <input type="number" min={0} max={10000} placeholder="10" value={quota?.free ?? ''} onChange={(e) => setQuota({ free: e.target.value, pro: quota?.pro ?? '' })} className={inputClass} />
                </label>
                <label className="block space-y-1"><span className="text-[#71717a]">会员</span>
                  <input type="number" min={0} max={10000} placeholder="100" value={quota?.pro ?? ''} onChange={(e) => setQuota({ pro: e.target.value, free: quota?.free ?? '' })} className={inputClass} />
                </label>
              </div>
              <Button onClick={() => void saveQuota()} disabled={!quota?.free || !quota?.pro}>保存额度</Button>
              <p className="text-[11px] text-[#a1a1aa]">按北京时间每日 0 点重置。留空表示不修改。</p>
            </div>
          </Panel>
        </div>

        <Panel
          title={<span className="flex items-center gap-2"><Ticket className="h-4 w-4 text-[#71717a]" /> 全部兑换码</span>}
          right={
            <div className="flex items-center gap-2">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-[#e4e4e7] px-2 py-1 text-[12px]">
                <option value="all">全部</option>
                <option value="active">未使用</option>
                <option value="redeemed">已兑换</option>
                <option value="expired">已过期</option>
                <option value="void">已作废</option>
                <option value="revoked">已撤销</option>
              </select>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索码 / 批次 / 备注" className="w-[170px] rounded-md border border-[#e4e4e7] px-2 py-1 text-[12px]" />
              <Button onClick={() => download(items, '兑换码.csv')}><Download className="h-3.5 w-3.5" /> 导出</Button>
            </div>
          }
        >
          {!data ? <Empty>加载中…</Empty> : items.length === 0 ? <Empty>还没有兑换码</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-[#fafafa] text-left text-[11px] text-[#71717a]">
                  <tr>{['兑换码', '时长', '状态', '兑换账号', '兑换时间 / 截止', '备注', ''].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-[#f0f0f1]">
                  {items.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="px-3 py-2 font-mono">{r.code}<div className="text-[10.5px] text-[#a1a1aa]">{r.batch}</div></td>
                      <td className="px-3 py-2">{r.days ? `${r.days} 天` : '永久'}</td>
                      <td className="px-3 py-2"><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></td>
                      <td className="px-3 py-2">{r.redeemed_email ?? '—'}{r.granted_until ? <div className="text-[10.5px] text-[#a1a1aa]">会员至 {formatWhen(r.granted_until)}</div> : null}</td>
                      <td className="px-3 py-2 text-[#52525b]">{r.redeemed_at ? formatWhen(r.redeemed_at) : r.expires_at ? `截止 ${formatWhen(r.expires_at)}` : '不限'}</td>
                      <td className="max-w-[160px] truncate px-3 py-2 text-[#71717a]">{r.note ?? ''}</td>
                      <td className="px-3 py-2 text-right">
                        {r.status === 'active' || r.status === 'expired' ? (
                          <button onClick={() => void voidCode(r)} className="inline-flex items-center gap-1 text-[11.5px] text-[#71717a] hover:text-[#b91c1c]"><XCircle className="h-3.5 w-3.5" />作废</button>
                        ) : r.status === 'redeemed' ? (
                          <button onClick={() => void voidCode(r)} className="inline-flex items-center gap-1 text-[11.5px] text-[#b91c1c] hover:underline">撤销</button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
