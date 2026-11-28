-- ============================================================
-- Service credentials managed from the dashboard (2026-11-28)
--
-- public.service_configs : one row per SMTP server / API provider. Non-secret
--   fields (host, port, user, from, base URL, purpose...) live in `settings`.
-- Secret values (password, API key, OAuth client secret / refresh token) are
--   stored ENCRYPTED in Supabase Vault, one secret per field, named
--   svc:<config id>:<field>. They are WRITE-ONLY from the dashboard: admins can
--   set, replace or clear them, but no RPC ever returns the value — only
--   "set / not set", last 4 characters and when it was updated.
-- Only server-side code (pg_cron, Edge Functions with the service role) can
--   read them, through public._svc_secret().
-- ============================================================

create table if not exists public.service_configs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('smtp', 'api')),
  name text not null,
  purpose text not null default 'general',         -- e.g. alerts, auth_email, ai, general
  enabled boolean not null default true,
  is_default boolean not null default false,        -- default SMTP used for outgoing mail
  settings jsonb not null default '{}'::jsonb,
  secret_fields jsonb not null default '{}'::jsonb, -- { field: { last4, updated_at } }  (never the value)
  last_test jsonb,                                  -- { at, ok, message }
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, name)
);
create unique index if not exists service_configs_one_default_smtp on public.service_configs (kind) where is_default and kind = 'smtp';
alter table public.service_configs enable row level security;
-- No direct table access for anyone: everything goes through the admin RPCs below.
revoke all on public.service_configs from anon, authenticated;

-- Reject settings that look like secrets: those must go through admin_service_secret_set.
create or replace function public._svc_check_settings(p jsonb)
returns void
language plpgsql
immutable
as $$
declare
  k text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'settings must be an object'; end if;
  for k in select jsonb_object_keys(p) loop
    if k ~* '(pass|secret|token|api_?key|private)' then
      raise exception 'field "%" looks secret — use the secret fields instead', k;
    end if;
  end loop;
end;
$$;

-- Server-side only: decrypted secret for a config field.
create or replace function public._svc_secret(p_config uuid, p_field text)
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'svc:' || p_config || ':' || p_field limit 1;
$$;

-- ---------------------------------------------------------------- admin RPCs
create or replace function public.admin_service_list(p_kind text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._admin_guard();
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(c) order by c.kind, c.is_default desc, c.name)
                         from public.service_configs c where p_kind is null or c.kind = p_kind), '[]'::jsonb),
    'generated_at', now());
end;
$$;

create or replace function public.admin_service_upsert(
  p_id uuid, p_kind text, p_name text, p_purpose text, p_enabled boolean, p_is_default boolean, p_settings jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text := auth.jwt() ->> 'email';
begin
  perform public._admin_guard();
  if p_kind not in ('smtp', 'api') then raise exception 'kind must be smtp or api'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name is required'; end if;
  perform public._svc_check_settings(coalesce(p_settings, '{}'::jsonb));
  if coalesce(p_is_default, false) then
    update public.service_configs set is_default = false where kind = p_kind and id is distinct from p_id;
  end if;
  if p_id is null then
    insert into public.service_configs (kind, name, purpose, enabled, is_default, settings, created_by, updated_by)
    values (p_kind, left(trim(p_name), 80), coalesce(nullif(trim(p_purpose), ''), 'general'), coalesce(p_enabled, true),
            coalesce(p_is_default, false), coalesce(p_settings, '{}'::jsonb), v_email, v_email)
    returning id into v_id;
  else
    update public.service_configs
       set name = left(trim(p_name), 80), purpose = coalesce(nullif(trim(p_purpose), ''), 'general'),
           enabled = coalesce(p_enabled, true), is_default = coalesce(p_is_default, false),
           settings = coalesce(p_settings, '{}'::jsonb), updated_by = v_email, updated_at = now()
     where id = p_id and kind = p_kind
    returning id into v_id;
    if v_id is null then raise exception 'config not found'; end if;
  end if;
  perform public._admin_audit('service.upsert', p_kind || ':' || p_name, jsonb_build_object('id', v_id));
  return (select to_jsonb(c) from public.service_configs c where c.id = v_id);
end;
$$;

-- Set (or clear with null/empty) one secret field. The value is never returned.
create or replace function public.admin_service_secret_set(p_id uuid, p_field text, p_value text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, vault
as $$
declare
  v_name text := 'svc:' || p_id || ':' || p_field;
  v_secret uuid;
begin
  perform public._admin_guard();
  if p_field !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception 'invalid field name'; end if;
  if not exists (select 1 from public.service_configs where id = p_id) then raise exception 'config not found'; end if;
  select id into v_secret from vault.secrets where name = v_name;
  if coalesce(p_value, '') = '' then
    if v_secret is not null then delete from vault.secrets where id = v_secret; end if;
    update public.service_configs set secret_fields = secret_fields - p_field, updated_at = now(), updated_by = auth.jwt() ->> 'email' where id = p_id;
  else
    if length(p_value) > 8000 then raise exception 'value too long'; end if;
    if v_secret is null then
      perform vault.create_secret(p_value, v_name, 'service config ' || p_id);
    else
      perform vault.update_secret(v_secret, p_value);
    end if;
    update public.service_configs
       set secret_fields = secret_fields || jsonb_build_object(p_field, jsonb_build_object('last4', right(p_value, 4), 'updated_at', now())),
           updated_at = now(), updated_by = auth.jwt() ->> 'email'
     where id = p_id;
  end if;
  perform public._admin_audit('service.secret', p_id::text, jsonb_build_object('field', p_field, 'cleared', coalesce(p_value, '') = ''));
  return (select secret_fields from public.service_configs where id = p_id);
end;
$$;

create or replace function public.admin_service_delete(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, vault
as $$
declare
  c public.service_configs;
begin
  perform public._admin_guard();
  select * into c from public.service_configs where id = p_id;
  if c.id is null then raise exception 'config not found'; end if;
  delete from vault.secrets where name like 'svc:' || p_id || ':%';
  delete from public.service_configs where id = p_id;
  perform public._admin_audit('service.delete', c.kind || ':' || c.name, jsonb_build_object('id', p_id));
  return jsonb_build_object('deleted', p_id);
end;
$$;

-- Record a connection test result (written by the Edge Function).
create or replace function public.service_record_test(p_id uuid, p_ok boolean, p_message text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.service_configs set last_test = jsonb_build_object('at', now(), 'ok', p_ok, 'message', left(p_message, 300)) where id = p_id;
$$;

revoke all on function public._svc_check_settings(jsonb) from public, anon, authenticated;
revoke all on function public._svc_secret(uuid, text) from public, anon, authenticated;
revoke all on function public.service_record_test(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.admin_service_list(text) from public, anon;
revoke all on function public.admin_service_upsert(uuid, text, text, text, boolean, boolean, jsonb) from public, anon;
revoke all on function public.admin_service_secret_set(uuid, text, text) from public, anon;
revoke all on function public.admin_service_delete(uuid) from public, anon;
grant execute on function public.admin_service_list(text) to authenticated;
grant execute on function public.admin_service_upsert(uuid, text, text, text, boolean, boolean, jsonb) to authenticated;
grant execute on function public.admin_service_secret_set(uuid, text, text) to authenticated;
grant execute on function public.admin_service_delete(uuid) to authenticated;
-- The Edge Function uses the service role, which can call these:
grant execute on function public._svc_secret(uuid, text) to service_role;
grant execute on function public.service_record_test(uuid, boolean, text) to service_role;

-- Seed the Outlook SMTP entry (no secrets yet).
insert into public.service_configs (kind, name, purpose, is_default, settings, created_by)
values ('smtp', 'Outlook.com', 'alerts', true, jsonb_build_object(
  'host', 'smtp-mail.outlook.com', 'port', 587, 'security', 'starttls', 'auth', 'xoauth2',
  'username', 'JackyChen2027@outlook.com', 'from_name', 'A-Level Hub', 'from_email', 'JackyChen2027@outlook.com',
  'oauth_tenant', 'consumers', 'oauth_scope', 'https://outlook.office.com/SMTP.Send offline_access'
), 'seed')
on conflict (kind, name) do nothing;

notify pgrst, 'reload schema';
