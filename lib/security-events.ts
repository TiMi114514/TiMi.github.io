import { supabase } from '@/lib/supabase';

export type SecurityEventKind =
  | 'sign_in'
  | 'sign_in_failed'
  | 'sign_out'
  | 'sign_up'
  | 'password_reset_requested'
  | 'password_changed';

/** Best-effort security event (IP and UA are captured server-side). Never throws. */
export function logSecurityEvent(
  kind: SecurityEventKind,
  email?: string | null,
  detail: Record<string, unknown> = {},
): void {
  if (!supabase) return;
  try {
    void supabase
      .rpc('log_security_event', { p_kind: kind, p_email: email ?? null, p_detail: detail })
      .then(
        () => undefined,
        () => undefined,
      );
  } catch {
    /* never break auth flows */
  }
}
