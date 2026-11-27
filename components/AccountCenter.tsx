'use client';

import { useEffect, useState } from 'react';
import { Crown, KeyRound, Pencil, Ticket, Timer } from 'lucide-react';
import { useAuth } from './AuthProvider';
import {
  changePassword,
  formatMinutes,
  getMyAccount,
  planLabel,
  redeemCode,
  updateDisplayName,
  type MyAccount,
} from '@/lib/account';

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

function Notice({ kind, text }: { kind: 'ok' | 'err'; text: string }) {
  return (
    <p className={`rounded-xl border px-3 py-2 text-[12.5px] ${kind === 'ok' ? 'border-[#cfe1d4] bg-[#eef5ef] text-[#3f7d5a]' : 'border-[#e7c9c1] bg-[#fbeeea] text-[#8a3b2a]'}`}>
      {text}
    </p>
  );
}

/** 个人中心：会员、兑换码、个人资料、修改密码、番茄钟统计（仅简体中文）。 */
export function AccountCenter() {
  const { user } = useAuth();
  const [account, setAccount] = useState<MyAccount | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeMsg, setCodeMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [name, setName] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function load() {
    try {
      const a = await getMyAccount();
      setAccount(a);
      setName(a?.display_name ?? '');
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '加载失败');
    }
  }

  useEffect(() => {
    if (user) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    setCodeBusy(true);
    setCodeMsg(null);
    try {
      const r = await redeemCode(code);
      setCode('');
      setCodeMsg({ kind: 'ok', text: r.expires_at ? `兑换成功！会员有效期至 ${fmtDate(r.expires_at)}。` : '兑换成功！你已成为永久会员。' });
      await load();
    } catch (e) {
      setCodeMsg({ kind: 'err', text: e instanceof Error ? e.message : '兑换失败' });
    } finally {
      setCodeBusy(false);
    }
  }

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    setNameBusy(true);
    setNameMsg(null);
    try {
      await updateDisplayName(name.trim());
      setNameMsg({ kind: 'ok', text: '昵称已更新' });
      await load();
    } catch (e) {
      setNameMsg({ kind: 'err', text: e instanceof Error ? e.message : '保存失败' });
    } finally {
      setNameBusy(false);
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setPwMsg(null);
    if (pw.next !== pw.confirm) return setPwMsg({ kind: 'err', text: '两次输入的新密码不一致' });
    setPwBusy(true);
    try {
      await changePassword(user?.email ?? '', pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      setPwMsg({ kind: 'ok', text: '密码已修改，下次登录请使用新密码' });
    } catch (e) {
      setPwMsg({ kind: 'err', text: e instanceof Error ? e.message : '修改失败' });
    } finally {
      setPwBusy(false);
    }
  }

  if (!user) return null;
  const pro = account?.plan === 'pro';

  return (
    <div className="mt-8 grid gap-5 lg:grid-cols-2">
      {loadError ? <div className="lg:col-span-2"><Notice kind="err" text={loadError} /></div> : null}

      {/* 会员 */}
      <section className={`rounded-2xl border p-6 ${pro ? 'border-[#e9cf86] bg-[#fffaf0]' : 'border-line bg-paper'}`}>
        <h2 className="flex items-center gap-2 font-display text-[22px] leading-none">
          <Crown className={`h-5 w-5 ${pro ? 'text-[#b8860b]' : 'text-muted'}`} aria-hidden /> 我的套餐
        </h2>
        <p className="mt-3 text-[26px] font-semibold">{account ? planLabel(account) : '…'}</p>
        {pro ? <p className="text-[12.5px] text-muted">{account?.plan_expires_at ? `有效期至 ${fmtDate(account.plan_expires_at)}` : '永久有效'}</p> : null}

        <dl className="mt-4 space-y-2 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">AI 辅导每日提问</dt>
            <dd className="tabular-nums">{account ? `今日已用 ${account.ai.used_today} / ${account.ai.limit} 次` : '…'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">真人辅导预约</dt>
            <dd>{account ? (account.tutor_priority ? '优先处理' : '普通排队') : '…'}</dd>
          </div>
        </dl>
        {!pro && account ? (
          <p className="mt-4 rounded-xl bg-cream/70 px-3 py-2 text-[12px] leading-relaxed text-muted">
            会员权益：AI 辅导每日 {account.ai.pro_limit} 次提问（免费版 {account.ai.free_limit} 次），真人辅导预约优先安排。
          </p>
        ) : null}

        <form onSubmit={submitCode} className="mt-5 space-y-2.5 border-t border-line/70 pt-4">
          <label className="block space-y-1.5 text-[12.5px] text-muted">
            <span className="flex items-center gap-1.5"><Ticket className="h-3.5 w-3.5" aria-hidden />使用兑换码</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX"
              maxLength={20}
              className="input font-mono tracking-[0.12em]"
              autoComplete="off"
            />
          </label>
          {codeMsg ? <Notice kind={codeMsg.kind} text={codeMsg.text} /> : null}
          <button type="submit" disabled={codeBusy || code.replace(/[^A-Z0-9]/g, '').length !== 12} className="btn-dark w-full py-2.5">
            {codeBusy ? '兑换中…' : '兑换'}
          </button>
        </form>

        {account?.redemptions.length ? (
          <div className="mt-4 text-[12px]">
            <p className="text-muted">兑换记录</p>
            <ul className="mt-1.5 divide-y divide-line/70">
              {account.redemptions.map((r, i) => (
                <li key={i} className="flex justify-between gap-3 py-1.5">
                  <span className="font-mono">····-{r.code_tail}</span>
                  <span className="text-muted">
                    {r.days ? `${r.days} 天` : '永久'} · {fmtDate(r.redeemed_at)}
                    {r.status === 'revoked' ? ' · 已撤销' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* 番茄钟 */}
      <section className="rounded-2xl border border-line bg-paper p-6">
        <h2 className="flex items-center gap-2 font-display text-[22px] leading-none">
          <Timer className="h-5 w-5 text-muted" aria-hidden /> 专注统计
        </h2>
        <p className="mt-3 text-[26px] font-semibold">{account ? formatMinutes(account.pomodoro.total_minutes) : '…'}</p>
        <p className="text-[12.5px] text-muted">累计专注时长（番茄钟完成的专注时段）</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            ['今天', account ? formatMinutes(account.pomodoro.today_minutes) : '…'],
            ['近 7 天', account ? formatMinutes(account.pomodoro.week_minutes) : '…'],
            ['完成次数', account ? `${account.pomodoro.sessions} 个` : '…'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-cream/60 px-2 py-3">
              <p className="text-[11.5px] text-muted">{label}</p>
              <p className="mt-1 text-[14px] font-medium">{value}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">登录状态下，每完成一个专注时段会自动记入统计；中途暂停或重置的时段不计入。</p>
      </section>

      {/* 个人信息 */}
      <section className="rounded-2xl border border-line bg-paper p-6">
        <h2 className="flex items-center gap-2 font-display text-[22px] leading-none">
          <Pencil className="h-5 w-5 text-muted" aria-hidden /> 个人信息
        </h2>
        <dl className="mt-4 space-y-2 text-[13px]">
          <div className="flex justify-between gap-3"><dt className="text-muted">邮箱</dt><dd className="truncate">{account?.email ?? user.email}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">注册日期</dt><dd>{fmtDate(account?.created_at)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">最近登录</dt><dd>{fmtDate(account?.last_sign_in_at)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">考区</dt><dd>{account?.exam_zone ? `第 ${account.exam_zone} 考区` : '未设置'}</dd></div>
        </dl>
        <form onSubmit={saveName} className="mt-4 space-y-2.5 border-t border-line/70 pt-4">
          <label className="block space-y-1.5 text-[12.5px] text-muted">
            <span>昵称</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="input" />
          </label>
          {nameMsg ? <Notice kind={nameMsg.kind} text={nameMsg.text} /> : null}
          <button type="submit" disabled={nameBusy || !name.trim() || name.trim() === account?.display_name} className="btn-light w-full py-2.5">
            {nameBusy ? '保存中…' : '保存昵称'}
          </button>
        </form>
      </section>

      {/* 修改密码 */}
      <section className="rounded-2xl border border-line bg-paper p-6">
        <h2 className="flex items-center gap-2 font-display text-[22px] leading-none">
          <KeyRound className="h-5 w-5 text-muted" aria-hidden /> 修改密码
        </h2>
        <form onSubmit={savePassword} className="mt-4 space-y-2.5">
          {([
            ['current', '当前密码', 'current-password'],
            ['next', '新密码（至少 8 位）', 'new-password'],
            ['confirm', '再次输入新密码', 'new-password'],
          ] as const).map(([key, label, ac]) => (
            <label key={key} className="block space-y-1.5 text-[12.5px] text-muted">
              <span>{label}</span>
              <input
                type="password"
                required
                minLength={key === 'current' ? 1 : 8}
                autoComplete={ac}
                value={pw[key]}
                onChange={(e) => setPw({ ...pw, [key]: e.target.value })}
                className="input"
              />
            </label>
          ))}
          {pwMsg ? <Notice kind={pwMsg.kind} text={pwMsg.text} /> : null}
          <button type="submit" disabled={pwBusy} className="btn-dark w-full py-2.5">{pwBusy ? '修改中…' : '修改密码'}</button>
          <p className="text-[11.5px] text-muted">忘记当前密码？请退出后在登录页使用「忘记密码」。</p>
        </form>
      </section>
    </div>
  );
}
