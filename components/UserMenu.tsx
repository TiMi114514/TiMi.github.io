'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Crown, LogOut, Shield, Timer, UserRound } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { getMyAccount, formatMinutes, planLabel, type MyAccount } from '@/lib/account';

/** Header user button: opens a small panel with plan, join date, focus time and quick links. */
export function UserMenu({ displayName, onSignOut }: { displayName: string; onSignOut: () => void }) {
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<MyAccount | null>(null);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    let alive = true;
    getMyAccount().then((a) => alive && setAccount(a), () => undefined);
    return () => {
      alive = false;
    };
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const joined = account ? new Date(account.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const until = account?.plan === 'pro' && account.plan_expires_at
    ? new Date(account.plan_expires_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-[180px] items-center gap-1.5 rounded-full border border-line bg-paper/70 px-3 py-2 text-[12.5px] text-ink transition-colors hover:bg-white"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{displayName}</span>
        {account?.plan === 'pro' ? <Crown className="h-3.5 w-3.5 shrink-0 text-[#b8860b]" aria-label="会员" /> : null}
      </button>

      {open ? (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-[280px] rounded-2xl border border-line bg-paper p-4 shadow-float">
          <p className="truncate font-medium">{account?.display_name || displayName}</p>
          <p className="truncate text-[12px] text-muted">{user?.email}</p>

          <div className="mt-3 space-y-1.5 rounded-xl bg-cream/60 px-3 py-2.5 text-[12.5px]">
            <p className="flex justify-between gap-2">
              <span className="text-muted">套餐</span>
              <span className={account?.plan === 'pro' ? 'font-medium text-[#8a6100]' : ''}>{account ? planLabel(account) : '…'}</span>
            </p>
            {until ? (
              <p className="flex justify-between gap-2"><span className="text-muted">到期</span><span>{until}</span></p>
            ) : null}
            <p className="flex justify-between gap-2">
              <span className="text-muted">今日 AI 提问</span>
              <span className="tabular-nums">{account ? `${account.ai.used_today} / ${account.ai.limit}` : '…'}</span>
            </p>
            <p className="flex justify-between gap-2"><span className="text-muted">注册日期</span><span>{joined || '…'}</span></p>
            <p className="flex justify-between gap-2">
              <span className="flex items-center gap-1 text-muted"><Timer className="h-3 w-3" aria-hidden />专注总时长</span>
              <span>{account ? formatMinutes(account.pomodoro.total_minutes) : '…'}</span>
            </p>
          </div>

          <div className="mt-3 grid gap-1.5 text-[12.5px]">
            <Link href="/account" onClick={() => setOpen(false)} className="rounded-lg px-2.5 py-2 transition-colors hover:bg-cream" role="menuitem">
              个人中心（资料、密码、兑换码）
            </Link>
            {isAdmin ? (
              <Link href="/admin" onClick={() => setOpen(false)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-cream" role="menuitem">
                <Shield className="h-3.5 w-3.5" aria-hidden /> 管理后台
              </Link>
            ) : null}
            <button type="button" onClick={onSignOut} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-[#8a3b2a] transition-colors hover:bg-[#fbeeea]" role="menuitem">
              <LogOut className="h-3.5 w-3.5" aria-hidden /> 退出登录
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
