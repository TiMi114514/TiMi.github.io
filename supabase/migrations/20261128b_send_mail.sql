-- ============================================================
-- Mail delivery via the send-mail Edge Function (2026-11-28)
--  * small Vault helpers the Edge Function (service role) uses
--  * the alert watcher now sends through the default SMTP config
--    (falls back to Resend only if an "api" config named Resend exists)
-- ============================================================

-- Named Vault secrets (service role only).
create or replace function public._svc_named_secret(p_name text)
returns text language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;

create or replace function public._svc_named_secret_set(p_name text, p_value text)
returns void language plpgsql volatile security definer set search_path = public, vault as $$
declare v uuid;
begin
  select id into v from vault.secrets where name = p_name;
  if v is null then perform vault.create_secret(p_value, p_name); else perform vault.update_secret(v, p_value); end if;
end;
$$;

create or replace function public._svc_named_secret_delete(p_name text)
returns void language sql volatile security definer set search_path = public, vault as $$
  delete from vault.secrets where name = p_name;
$$;

create or replace function public._svc_vault_create(p_name text, p_value text)
returns void language sql volatile security definer set search_path = public, vault as $$
  select vault.create_secret(p_value, p_name);
$$;

create or replace function public._svc_vault_update(p_id uuid, p_value text)
returns void language sql volatile security definer set search_path = public, vault as $$
  select vault.update_secret(p_id, p_value);
$$;

revoke all on function public._svc_named_secret(text) from public, anon, authenticated;
revoke all on function public._svc_named_secret_set(text, text) from public, anon, authenticated;
revoke all on function public._svc_named_secret_delete(text) from public, anon, authenticated;
revoke all on function public._svc_vault_create(text, text) from public, anon, authenticated;
revoke all on function public._svc_vault_update(uuid, text) from public, anon, authenticated;
grant execute on function public._svc_named_secret(text) to service_role;
grant execute on function public._svc_named_secret_set(text, text) to service_role;
grant execute on function public._svc_named_secret_delete(text) to service_role;
grant execute on function public._svc_vault_create(text, text) to service_role;
grant execute on function public._svc_vault_update(uuid, text) to service_role;
grant select, update on public.service_configs to service_role;
grant select on public.admins to service_role;

-- Shared key so pg_cron can call the Edge Function (generated once, stays in Vault).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'mail_hook_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'mail_hook_key', 'pg_cron -> send-mail');
  end if;
end $$;

-- Alert email: default SMTP config through the Edge Function.
create or replace function public._alert_send(p_subject text, p_text text)
returns bigint
language plpgsql
volatile
security definer
set search_path = public, extensions, vault
as $$
declare
  v_cfg jsonb := (select value from public.site_settings where key = 'alerts.config');
  v_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'mail_hook_key' limit 1);
  v_smtp public.service_configs;
  v_id bigint;
begin
  if v_cfg is null or coalesce((v_cfg ->> 'enabled')::boolean, true) = false then return null; end if;
  select * into v_smtp from public.service_configs where kind = 'smtp' and is_default and enabled limit 1;
  if v_smtp.id is null or v_key is null then return null; end if;  -- no mail configured: alert is still recorded
  select net.http_post(
    url := 'https://wksdpsmxwybsmtjjipxa.supabase.co/functions/v1/send-mail',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-mail-key', v_key),
    body := jsonb_build_object('action', 'send', 'to', v_cfg -> 'recipients', 'subject', p_subject, 'text', p_text),
    timeout_milliseconds := 30000
  ) into v_id;
  return v_id;
end;
$$;

-- The dashboard reads email status from the default SMTP config now.
create or replace function public.admin_alerts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, vault
as $$
begin
  perform public._admin_guard();
  return jsonb_build_object(
    'config', (select value from public.site_settings where key = 'alerts.config'),
    'email_configured', exists (select 1 from public.service_configs where kind = 'smtp' and is_default and enabled
                                  and (secret_fields ? 'refresh_token' or secret_fields ? 'password')),
    'email_provider', (select name from public.service_configs where kind = 'smtp' and is_default limit 1),
    'watcher_scheduled', exists (select 1 from cron.job where jobname = 'alert-watch' and active),
    'open', coalesce((select jsonb_agg(to_jsonb(s) order by s.opened_at desc) from public.alert_state s where s.status = 'open'), '[]'::jsonb),
    'pending', coalesce((select jsonb_agg(to_jsonb(s)) from public.alert_state s where s.status = 'pending'), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (select * from public.alert_events order by created_at desc limit 100) e), '[]'::jsonb),
    'generated_at', now()
  );
end;
$$;

notify pgrst, 'reload schema';
