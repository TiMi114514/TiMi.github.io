import { supabase } from '@/lib/supabase';

/** Best-effort audit trail for administrator actions. */
export async function logAdminAction(
  action: string,
  target?: string,
  details?: Record<string, unknown>,
): Promise<void> {
  if (!supabase) return;
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from('admin_audit_log').insert({
      admin_id: data.user.id,
      admin_email: data.user.email ?? null,
      action,
      target: target ?? null,
      details: details ?? {},
    });
  } catch {
    /* audit logging must never break the action */
  }
}
