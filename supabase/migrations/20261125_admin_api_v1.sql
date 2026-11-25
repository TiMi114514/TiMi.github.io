-- ============================================================
-- Admin data API v1 (2026-11-25)
--
-- Standard contract for every admin_* RPC:
--   * SECURITY DEFINER, raises 'not authorized' unless public.is_admin()
--   * returns jsonb; list endpoints return { items: [...], total, generated_at }
--   * writes go through RPCs that also append to admin_audit_log
--
-- Idempotent: safe to run more than once.
-- ============================================================

-- ------------------------------------------------------------
-- Request context helpers (IP / UA / country from the edge headers)
-- ------------------------------------------------------------
create or replace function public._req_header(p_name text)
returns text
language sql
stable
set search_path = public
as $$
  select nullif(coalesce(current_setting('request.headers', true), '{}')::jsonb ->> p_name, '');
$$;

create or replace function public._req_ip()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    public._req_header('cf-connecting-ip'),
    split_part(public._req_header('x-forwarded-for'), ',', 1),
    public._req_header('x-real-ip')
  );
$$;

-- ------------------------------------------------------------
-- Live presence: richer visitor record
-- ------------------------------------------------------------
alter table public.live_presence add column if not exists visitor_id text;
alter table public.live_presence add column if not exists ip text;
alter table public.live_presence add column if not exists country_code text;
alter table public.live_presence add column if not exists country text;
alter table public.live_presence add column if not exists region text;
alter table public.live_presence add column if not exists city text;
alter table public.live_presence add column if not exists fingerprint text;
alter table public.live_presence add column if not exists fp_components jsonb;
alter table public.live_presence add column if not exists user_agent text;
alter table public.live_presence add column if not exists language text;
alter table public.live_presence add column if not exists screen text;
alter table public.live_presence add column if not exists timezone text;
alter table public.live_presence add column if not exists first_seen timestamptz not null default now();
alter table public.live_presence add column if not exists heartbeats integer not null default 0;

create index if not exists live_presence_visitor_idx on public.live_presence (visitor_id);
create index if not exists live_presence_fp_idx on public.live_presence (fingerprint);

alter table public.download_events add column if not exists visitor_id text;
alter table public.downloads add column if not exists visitor_id text;
create index if not exists download_events_visitor_idx on public.download_events (visitor_id);

drop function if exists public.touch_presence(text, text);
drop function if exists public.touch_presence(text, text, jsonb);

create or replace function public.touch_presence(
  p_visitor text,
  p_path text default null,
  p_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_actor text;
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
begin
  if p_visitor is null or length(p_visitor) < 8 or length(p_visitor) > 64 then
    if v_uid is null then
      return;
    end if;
  end if;
  v_actor := coalesce('u:' || v_uid::text, 'g:' || p_visitor);

  -- A guest who signs in becomes the same person, not two.
  if v_uid is not null and p_visitor is not null then
    delete from public.live_presence where actor = 'g:' || p_visitor;
  end if;

  insert into public.live_presence as lp (
    actor, user_id, visitor_id, path, last_seen, first_seen, heartbeats,
    ip, country_code, country, region, city,
    fingerprint, fp_components, user_agent, language, screen, timezone
  )
  values (
    v_actor, v_uid, left(p_visitor, 64), left(p_path, 200), now(), now(), 1,
    left(public._req_ip(), 64),
    left(coalesce(public._req_header('cf-ipcountry'), v_meta ->> 'country_code'), 8),
    left(v_meta ->> 'country', 80),
    left(v_meta ->> 'region', 80),
    left(v_meta ->> 'city', 80),
    left(v_meta ->> 'fingerprint', 64),
    case when jsonb_typeof(v_meta -> 'fp_components') = 'object' then v_meta -> 'fp_components' end,
    left(public._req_header('user-agent'), 400),
    left(v_meta ->> 'language', 40),
    left(v_meta ->> 'screen', 40),
    left(v_meta ->> 'timezone', 64)
  )
  on conflict (actor) do update
    set last_seen     = now(),
        heartbeats    = lp.heartbeats + 1,
        path          = excluded.path,
        user_id       = excluded.user_id,
        visitor_id    = coalesce(excluded.visitor_id, lp.visitor_id),
        ip            = coalesce(excluded.ip, lp.ip),
        country_code  = coalesce(excluded.country_code, lp.country_code),
        country       = coalesce(excluded.country, lp.country),
        region        = coalesce(excluded.region, lp.region),
        city          = coalesce(excluded.city, lp.city),
        fingerprint   = coalesce(excluded.fingerprint, lp.fingerprint),
        fp_components = coalesce(excluded.fp_components, lp.fp_components),
        user_agent    = coalesce(excluded.user_agent, lp.user_agent),
        language      = coalesce(excluded.language, lp.language),
        screen        = coalesce(excluded.screen, lp.screen),
        timezone      = coalesce(excluded.timezone, lp.timezone);

  -- Retention: keep 30 days of visitor records.
  delete from public.live_presence where last_seen < now() - interval '30 days';
end;
$$;

revoke all on function public.touch_presence(text, text, jsonb) from public;
grant execute on function public.touch_presence(text, text, jsonb) to anon, authenticated;

-- ------------------------------------------------------------
-- Security events (sign-in success / failure, resets …)
-- ------------------------------------------------------------
create table if not exists public.security_events (
  id bigint generated by default as identity primary key,
  kind text not null,
  email text,
  user_id uuid references auth.users (id) on delete set null,
  ip text,
  user_agent text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists security_events_created_idx on public.security_events (created_at desc);
alter table public.security_events enable row level security;

drop policy if exists "security_events_read_admin" on public.security_events;
create policy "security_events_read_admin"
  on public.security_events for select
  using (public.is_admin());

create or replace function public.log_security_event(
  p_kind text,
  p_email text default null,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_kind not in ('sign_in', 'sign_in_failed', 'sign_out', 'sign_up', 'password_reset_requested', 'password_changed') then
    return;
  end if;
  -- Light flood guard: at most 30 events per IP per 10 minutes.
  if (select count(*) from public.security_events
        where ip = public._req_ip() and created_at > now() - interval '10 minutes') >= 30 then
    return;
  end if;
  insert into public.security_events (kind, email, user_id, ip, user_agent, detail)
  values (
    p_kind,
    left(lower(p_email), 200),
    auth.uid(),
    left(public._req_ip(), 64),
    left(public._req_header('user-agent'), 400),
    case when jsonb_typeof(p_detail) = 'object' then p_detail else '{}'::jsonb end
  );
  delete from public.security_events where created_at < now() - interval '180 days';
end;
$$;

revoke all on function public.log_security_event(text, text, jsonb) from public;
grant execute on function public.log_security_event(text, text, jsonb) to anon, authenticated;

-- ------------------------------------------------------------
-- Generic admin resource registry
-- kind: integration | mcp_server | secret | workflow | agent
-- Secrets store METADATA ONLY (where it lives, last 4 chars, rotation dates).
-- ------------------------------------------------------------
create table if not exists public.admin_resources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('integration', 'mcp_server', 'secret', 'workflow', 'agent')),
  slug text not null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'disabled', 'error', 'planned')),
  config jsonb not null default '{}'::jsonb,
  notes text,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, slug)
);
alter table public.admin_resources enable row level security;

drop policy if exists "admin_resources_read_admin" on public.admin_resources;
create policy "admin_resources_read_admin"
  on public.admin_resources for select
  using (public.is_admin());

create or replace function public._admin_guard()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
end;
$$;

create or replace function public._admin_audit(p_action text, p_target text, p_details jsonb)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.admin_audit_log (admin_id, admin_email, action, target, details)
  values (auth.uid(), auth.jwt() ->> 'email', p_action, p_target, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function public.admin_resource_list(p_kind text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_items jsonb;
begin
  perform public._admin_guard();
  select coalesce(jsonb_agg(to_jsonb(r) order by r.name), '[]'::jsonb)
    into v_items
    from public.admin_resources r
   where p_kind is null or r.kind = p_kind;
  return jsonb_build_object(
    'items', v_items,
    'total', jsonb_array_length(v_items),
    'generated_at', now()
  );
end;
$$;

create or replace function public.admin_resource_upsert(
  p_kind text,
  p_slug text,
  p_name text,
  p_status text default 'active',
  p_config jsonb default '{}'::jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.admin_resources;
  v_config jsonb := coalesce(p_config, '{}'::jsonb);
begin
  perform public._admin_guard();
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9._-]{0,63}$' then
    raise exception 'slug must be lowercase letters, digits, dot, dash or underscore';
  end if;
  if p_kind = 'secret' and (v_config ? 'value' or v_config ? 'secret' or v_config ? 'token') then
    raise exception 'secret values must never be stored here; save only metadata';
  end if;

  insert into public.admin_resources as r (kind, slug, name, status, config, notes, created_by, updated_by)
  values (p_kind, p_slug, p_name, coalesce(p_status, 'active'), v_config, p_notes,
          auth.jwt() ->> 'email', auth.jwt() ->> 'email')
  on conflict (kind, slug) do update
    set name = excluded.name,
        status = excluded.status,
        config = excluded.config,
        notes = excluded.notes,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into v_row;

  perform public._admin_audit('resource.upsert', p_kind || ':' || p_slug,
    jsonb_build_object('status', v_row.status));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_resource_delete(p_kind text, p_slug text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  perform public._admin_guard();
  delete from public.admin_resources where kind = p_kind and slug = p_slug;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform public._admin_audit('resource.delete', p_kind || ':' || p_slug, '{}'::jsonb);
  end if;
  return jsonb_build_object('deleted', v_count);
end;
$$;

-- ------------------------------------------------------------
-- Live visitors (online users console)
-- status: active (< 2 min) | idle (< 10 min) | offline
-- ------------------------------------------------------------
create or replace function public.admin_live_visitors(p_window_minutes int default 60)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_window interval := make_interval(mins => greatest(1, least(coalesce(p_window_minutes, 60), 43200)));
  v_items jsonb;
begin
  perform public._admin_guard();

  with base as (
    select lp.*,
           p.email,
           p.display_name,
           case
             when lp.last_seen >= now() - interval '2 minutes' then 'active'
             when lp.last_seen >= now() - interval '10 minutes' then 'idle'
             else 'offline'
           end as status
      from public.live_presence lp
      left join public.profiles p on p.id = lp.user_id
     where lp.last_seen >= now() - v_window
  ),
  dl as (
    select b.actor,
           (select count(*) from public.downloads d
             where (b.user_id is not null and d.user_id = b.user_id)
                or (b.visitor_id is not null and d.visitor_id = b.visitor_id)) as account_downloads,
           (select count(*) from public.download_events e
             where (b.visitor_id is not null and e.visitor_id = b.visitor_id)
                or (b.user_id is not null and e.user_id = b.user_id)) as guest_downloads
      from base b
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'actor', b.actor,
             'kind', case when b.user_id is null then 'guest' else 'user' end,
             'user_id', b.user_id,
             'email', b.email,
             'display_name', b.display_name,
             'visitor_id', b.visitor_id,
             'status', b.status,
             'path', b.path,
             'ip', b.ip,
             'country_code', b.country_code,
             'country', b.country,
             'region', b.region,
             'city', b.city,
             'fingerprint', b.fingerprint,
             'fp_components', b.fp_components,
             'user_agent', b.user_agent,
             'language', b.language,
             'screen', b.screen,
             'timezone', b.timezone,
             'first_seen', b.first_seen,
             'last_seen', b.last_seen,
             'heartbeats', b.heartbeats,
             'downloads', dl.account_downloads + dl.guest_downloads,
             'same_fingerprint', case when b.fingerprint is null then 0 else
                                   (select count(*) - 1 from base o where o.fingerprint = b.fingerprint) end
           ) order by b.last_seen desc), '[]'::jsonb)
    into v_items
    from base b join dl on dl.actor = b.actor;

  return jsonb_build_object(
    'items', v_items,
    'total', jsonb_array_length(v_items),
    'active', (select count(*) from public.live_presence where last_seen >= now() - interval '2 minutes'),
    'idle', (select count(*) from public.live_presence
              where last_seen < now() - interval '2 minutes' and last_seen >= now() - interval '10 minutes'),
    'generated_at', now()
  );
end;
$$;

-- ------------------------------------------------------------
-- Unified logs
-- kind: all | page_view | download | admin | email | security
-- ------------------------------------------------------------
create or replace function public.admin_logs(
  p_kind text default 'all',
  p_search text default null,
  p_limit int default 100,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 100), 500));
  v_before timestamptz := coalesce(p_before, now() + interval '1 minute');
  v_kind text := coalesce(nullif(p_kind, ''), 'all');
  v_q text := nullif(lower(trim(coalesce(p_search, ''))), '');
  v_items jsonb;
begin
  perform public._admin_guard();

  with events as (
    select 'page_view'::text as kind, 'pv-' || id as id, created_at as at,
           coalesce(user_id::text, session_id) as actor,
           path as subject,
           jsonb_build_object('country', country, 'referrer', referrer, 'session_id', session_id) as detail
      from public.page_views
     where v_kind in ('all', 'page_view') and created_at < v_before
    union all
    select 'download', 'dl-' || d.id, d.created_at,
           coalesce(p.email, d.user_id::text), d.paper_title,
           jsonb_build_object('source', 'account', 'paper_id', d.paper_id)
      from public.downloads d left join public.profiles p on p.id = d.user_id
     where v_kind in ('all', 'download') and d.created_at < v_before
    union all
    select 'download', 'de-' || id, created_at,
           coalesce(visitor_id, session_id), file_name,
           jsonb_build_object('source', 'guest', 'dataset', dataset, 'paper_id', paper_id)
      from public.download_events
     where v_kind in ('all', 'download') and created_at < v_before
    union all
    select 'admin', 'au-' || id, created_at,
           admin_email, action || coalesce(' · ' || target, ''), details
      from public.admin_audit_log
     where v_kind in ('all', 'admin') and created_at < v_before
    union all
    select 'email', 'em-' || id, created_at,
           applicant_email, coalesce(subject, kind),
           jsonb_build_object('recipient', recipient, 'status', status, 'kind', kind)
      from public.email_events
     where v_kind in ('all', 'email') and created_at < v_before
    union all
    select 'security', 'se-' || id, created_at,
           coalesce(email, user_id::text), kind,
           detail || jsonb_build_object('ip', ip, 'user_agent', user_agent)
      from public.security_events
     where v_kind in ('all', 'security') and created_at < v_before
  ),
  filtered as (
    select * from events
     where v_q is null
        or lower(coalesce(subject, '')) like '%' || v_q || '%'
        or lower(coalesce(actor, '')) like '%' || v_q || '%'
        or lower(detail::text) like '%' || v_q || '%'
     order by at desc
     limit v_limit
  )
  select coalesce(jsonb_agg(to_jsonb(f) order by f.at desc), '[]'::jsonb) into v_items from filtered f;

  return jsonb_build_object(
    'items', v_items,
    'total', jsonb_array_length(v_items),
    'next_before', (select min((e ->> 'at')::timestamptz) from jsonb_array_elements(v_items) e),
    'generated_at', now()
  );
end;
$$;

-- ------------------------------------------------------------
-- Security overview: auth sessions, events, admins
-- ------------------------------------------------------------
create or replace function public.admin_security_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  perform public._admin_guard();
  return jsonb_build_object(
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'user_id', s.user_id,
               'email', u.email,
               'ip', host(s.ip),
               'user_agent', s.user_agent,
               'created_at', s.created_at,
               'refreshed_at', s.refreshed_at,
               'updated_at', s.updated_at,
               'aal', s.aal,
               'is_admin', exists (select 1 from public.admins a where lower(a.email) = lower(u.email))
             ) order by coalesce(s.refreshed_at, s.updated_at, s.created_at) desc)
        from (select * from auth.sessions
               where not_after is null or not_after > now()
               order by coalesce(refreshed_at, updated_at, created_at) desc
               limit 200) s
        join auth.users u on u.id = s.user_id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at desc)
        from (select * from public.security_events order by created_at desc limit 100) e), '[]'::jsonb),
    'failed_24h', (select count(*) from public.security_events
                    where kind = 'sign_in_failed' and created_at > now() - interval '24 hours'),
    'signins_24h', (select count(*) from public.security_events
                     where kind = 'sign_in' and created_at > now() - interval '24 hours'),
    'admins', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.admins a), '[]'::jsonb),
    'unconfirmed_users', (select count(*) from auth.users where email_confirmed_at is null),
    'generated_at', now()
  );
end;
$$;

create or replace function public.admin_revoke_session(p_session_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_count int;
begin
  perform public._admin_guard();
  delete from auth.sessions where id = p_session_id;
  get diagnostics v_count = row_count;
  perform public._admin_audit('session.revoke', p_session_id::text, '{}'::jsonb);
  return jsonb_build_object('revoked', v_count);
end;
$$;

-- ------------------------------------------------------------
-- Audience breakdown for analytics (visitors seen in the window)
-- ------------------------------------------------------------
create or replace function public.admin_audience(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz := now() - make_interval(days => greatest(coalesce(p_days, 30), 1));
begin
  perform public._admin_guard();
  return jsonb_build_object(
    'visitors', (select count(*) from public.live_presence where last_seen >= v_start),
    'signed_in', (select count(*) from public.live_presence where last_seen >= v_start and user_id is not null),
    'regions', coalesce((
      select jsonb_agg(jsonb_build_object('label', label, 'count', n) order by n desc)
        from (select coalesce(nullif(concat_ws(' ', region, city), ''), country, country_code, 'Unknown') as label,
                     count(*) as n
                from public.live_presence where last_seen >= v_start
               group by 1 order by 2 desc limit 12) x), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(jsonb_build_object('label', label, 'count', n) order by n desc)
        from (select coalesce(country_code, 'Unknown') as label, count(*) as n
                from public.live_presence where last_seen >= v_start
               group by 1 order by 2 desc limit 12) x), '[]'::jsonb),
    'languages', coalesce((
      select jsonb_agg(jsonb_build_object('label', label, 'count', n) order by n desc)
        from (select coalesce(language, 'Unknown') as label, count(*) as n
                from public.live_presence where last_seen >= v_start
               group by 1 order by 2 desc limit 12) x), '[]'::jsonb),
    'user_agents', coalesce((
      select jsonb_agg(jsonb_build_object('label', label, 'count', n) order by n desc)
        from (select coalesce(user_agent, 'Unknown') as label, count(*) as n
                from public.live_presence where last_seen >= v_start
               group by 1 order by 2 desc limit 200) x), '[]'::jsonb),
    'generated_at', now()
  );
end;
$$;

-- Grants: admin RPCs are callable by signed-in users; the guard rejects non-admins.
revoke all on function public.admin_resource_list(text) from public;
revoke all on function public.admin_resource_upsert(text, text, text, text, jsonb, text) from public;
revoke all on function public.admin_resource_delete(text, text) from public;
revoke all on function public.admin_live_visitors(int) from public;
revoke all on function public.admin_logs(text, text, int, timestamptz) from public;
revoke all on function public.admin_security_overview() from public;
revoke all on function public.admin_revoke_session(uuid) from public;
revoke all on function public.admin_audience(int) from public;
revoke all on function public._admin_guard() from public;
revoke all on function public._admin_audit(text, text, jsonb) from public;

grant execute on function public.admin_resource_list(text) to authenticated;
grant execute on function public.admin_resource_upsert(text, text, text, text, jsonb, text) to authenticated;
grant execute on function public.admin_resource_delete(text, text) to authenticated;
grant execute on function public.admin_live_visitors(int) to authenticated;
grant execute on function public.admin_logs(text, text, int, timestamptz) to authenticated;
grant execute on function public.admin_security_overview() to authenticated;
grant execute on function public.admin_revoke_session(uuid) to authenticated;
grant execute on function public.admin_audience(int) to authenticated;

-- Seed the registry with what this deployment already uses (only if empty).
insert into public.admin_resources (kind, slug, name, status, config, notes, created_by)
select * from (values
  ('integration', 'supabase', 'Supabase', 'active',
     '{"category":"Auth & database","url":"https://wksdpsmxwybsmtjjipxa.supabase.co","docs":"https://supabase.com/docs"}'::jsonb,
     'Auth, Postgres, Storage (teacher-documents bucket).', 'seed'),
  ('integration', 'ragflow', 'RAGFlow', 'active',
     '{"category":"AI / knowledge base","url":"http://localhost:9380","docs":"https://ragflow.io/docs"}'::jsonb,
     'Chat assistants and datasets behind the AI tutor.', 'seed'),
  ('integration', 'github-pages', 'GitHub Pages', 'active',
     '{"category":"Hosting","url":"https://timi114514.github.io/TiMi.github.io/","repo":"TiMi114514/TiMi.github.io"}'::jsonb,
     'Static hosting; deployed by GitHub Actions on push to main.', 'seed'),
  ('integration', 'formsubmit', 'FormSubmit', 'active',
     '{"category":"Email forwarding","url":"https://formsubmit.co"}'::jsonb,
     'Forwards teacher applications to the owner inbox.', 'seed'),
  ('integration', 'ip-geolocation', 'IP geolocation', 'active',
     '{"category":"Geolocation","providers":["myip.ipip.net","ipwho.is","ipinfo.io"]}'::jsonb,
     'Browser-side lookup for region / city.', 'seed'),
  ('secret', 'github-pat', 'GitHub PAT', 'active',
     '{"location":"Password manager","scope":"Contents / Pages / Actions write","last4":"","rotate_every_days":90}'::jsonb,
     'Used for pushing and Actions administration.', 'seed'),
  ('secret', 'supabase-management-token', 'Supabase management token', 'active',
     '{"location":"Password manager","scope":"Full account","last4":"","rotate_every_days":90}'::jsonb,
     'Highest risk. Never ship to the browser.', 'seed'),
  ('secret', 'ragflow-api-key', 'RAGFlow API key', 'active',
     '{"location":"GitHub Actions secret NEXT_PUBLIC_RAGFLOW_API_KEY","scope":"RAGFlow API","last4":"","rotate_every_days":30,"exposed_in_bundle":true}'::jsonb,
     'Visible in the browser bundle in the static architecture.', 'seed'),
  ('secret', 'supabase-publishable-key', 'Supabase publishable key', 'active',
     '{"location":"GitHub Actions variable NEXT_PUBLIC_SUPABASE_ANON_KEY","scope":"Public, RLS-limited","last4":"","rotate_every_days":0,"exposed_in_bundle":true}'::jsonb,
     'Public by design.', 'seed'),
  ('workflow', 'deploy-pages', 'Deploy to GitHub Pages', 'active',
     '{"provider":"github-actions","file":".github/workflows/deploy.yml","trigger":"push to main, manual"}'::jsonb,
     'npm ci → npm run build → upload out/ → deploy-pages.', 'seed')
) as seed(kind, slug, name, status, config, notes, created_by)
where not exists (select 1 from public.admin_resources);

notify pgrst, 'reload schema';
