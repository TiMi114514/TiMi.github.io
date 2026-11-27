/** Signed-in user's account: plan, AI quota, Pomodoro totals, redemption. */
import { supabase } from './supabase';

export type MyAccount = {
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  display_name: string | null;
  locale: string | null;
  exam_zone: number | null;
  country: string | null;
  plan: 'free' | 'pro';
  plan_expires_at: string | null;
  ai: { limit: number; used_today: number; free_limit: number; pro_limit: number };
  tutor_priority: boolean;
  pomodoro: { total_minutes: number; sessions: number; week_minutes: number; today_minutes: number };
  redemptions: { code_tail: string; days: number | null; redeemed_at: string; granted_until: string | null; status: string }[];
};

function messageOf(error: { message?: string } | null): string {
  return error?.message?.replace(/^.*?ERROR:\s*/, '') || '操作失败，请稍后再试';
}

export async function getMyAccount(): Promise<MyAccount | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('my_account');
  if (error) throw new Error(messageOf(error));
  return (data as MyAccount | null) ?? null;
}

export async function redeemCode(code: string): Promise<{ plan: string; expires_at: string | null; days: number | null }> {
  if (!supabase) throw new Error('账号服务未配置');
  const { data, error } = await supabase.rpc('redeem_code', { p_code: code });
  if (error) throw new Error(messageOf(error));
  return data as { plan: string; expires_at: string | null; days: number | null };
}

export async function updateDisplayName(name: string): Promise<void> {
  if (!supabase) throw new Error('账号服务未配置');
  const { error } = await supabase.rpc('update_my_profile', { p_display_name: name });
  if (error) throw new Error(messageOf(error));
  await supabase.auth.updateUser({ data: { display_name: name } });
}

/** Change password: re-check the current password first so a borrowed session cannot change it. */
export async function changePassword(email: string, current: string, next: string): Promise<void> {
  if (!supabase) throw new Error('账号服务未配置');
  if (next.length < 8) throw new Error('新密码至少 8 位');
  if (next === current) throw new Error('新密码不能与当前密码相同');
  const check = await supabase.auth.signInWithPassword({ email, password: current });
  if (check.error) throw new Error('当前密码不正确');
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) throw new Error(messageOf(error));
}

export async function logPomodoro(minutes: number, mode: 'focus' | 'break'): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  await supabase.rpc('log_pomodoro', { p_minutes: Math.round(minutes), p_mode: mode }).then(
    () => undefined,
    () => undefined,
  );
}

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} 小时 ${m} 分钟` : `${m} 分钟`;
}

export function planLabel(account: Pick<MyAccount, 'plan' | 'plan_expires_at'>): string {
  if (account.plan !== 'pro') return '免费版';
  return account.plan_expires_at ? '会员' : '永久会员';
}
