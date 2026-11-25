-- ============================================================
-- Function grants (2026-11-25)
--
-- Supabase grants EXECUTE on new public functions to anon / authenticated by
-- default, so "revoke ... from public" in the earlier migrations was not enough.
-- _admin_audit() has no guard of its own: anyone with the publishable key could
-- forge audit entries. Internal helpers are only called from SECURITY DEFINER
-- functions, so no API role needs EXECUTE on them.
-- ============================================================

revoke execute on function public._admin_audit(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public._admin_guard() from public, anon, authenticated;
revoke execute on function public._req_header(text) from public, anon, authenticated;
revoke execute on function public._req_ip() from public, anon, authenticated;
revoke execute on function public._donation_cny(numeric, text) from public, anon, authenticated;

-- admin_* RPCs check is_admin() themselves; anonymous callers never need them.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'admin\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
