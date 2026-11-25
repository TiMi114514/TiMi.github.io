-- ============================================================
-- Admin data API v1.1 (2026-11-25): app user directory + user detail
-- Same contract as v1: is_admin() guard, jsonb, { items, total, generated_at }.
-- ============================================================

create or replace function public.admin_users(p_search text default null, p_limit int default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_q text := nullif(lower(trim(coalesce(p_search, ''))), '');
  v_items jsonb;
begin
  perform public._admin_guard();

  with u as (
    select au.id, au.email::text as email, coalesce(p.display_name, '') as display_name,
           au.created_at, au.last_sign_in_at, (au.email_confirmed_at is not null) as confirmed,
           exists (select 1 from public.admins a where lower(a.email) = lower(au.email)) as is_admin
      from auth.users au
      left join public.profiles p on p.id = au.id
     where v_q is null or lower(au.email) like '%' || v_q || '%' or lower(coalesce(p.display_name, '')) like '%' || v_q || '%'
     order by au.created_at desc
     limit greatest(1, least(coalesce(p_limit, 500), 2000))
  ),
  presence as (
    select distinct on (lp.user_id) lp.user_id, lp.last_seen, lp.ip, lp.country_code, lp.country,
           lp.region, lp.city, lp.user_agent, lp.path
      from public.live_presence lp
     where lp.user_id is not null
     order by lp.user_id, lp.last_seen desc
  ),
  sess as (
    select distinct on (s.user_id) s.user_id, host(s.ip) as ip, s.user_agent,
           coalesce(s.refreshed_at, s.updated_at, s.created_at) as at
      from auth.sessions s
     order by s.user_id, coalesce(s.refreshed_at, s.updated_at, s.created_at) desc
  ),
  dl as (
    select user_id, count(*) as n, max(created_at) as last_at from (
      select user_id, created_at from public.downloads
      union all
      select user_id, created_at from public.download_events where user_id is not null
    ) x group by user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id,
           'email', u.email,
           'display_name', u.display_name,
           'created_at', u.created_at,
           'last_sign_in_at', u.last_sign_in_at,
           'confirmed', u.confirmed,
           'is_admin', u.is_admin,
           'last_active', greatest(pr.last_seen, se.at, u.last_sign_in_at),
           'status', case
                       when pr.last_seen >= now() - interval '2 minutes' then 'active'
                       when pr.last_seen >= now() - interval '10 minutes' then 'idle'
                       else 'offline' end,
           'ip', coalesce(pr.ip, se.ip),
           'country_code', pr.country_code,
           'country', pr.country,
           'region', pr.region,
           'city', pr.city,
           'user_agent', coalesce(pr.user_agent, se.user_agent),
           'downloads', coalesce(dl.n, 0),
           'last_download_at', dl.last_at
         ) order by u.created_at desc), '[]'::jsonb)
    into v_items
    from u
    left join presence pr on pr.user_id = u.id
    left join sess se on se.user_id = u.id
    left join dl on dl.user_id = u.id;

  return jsonb_build_object('items', v_items, 'total', jsonb_array_length(v_items), 'generated_at', now());
end;
$$;

create or replace function public.admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_user jsonb;
  v_visitors text[];
begin
  perform public._admin_guard();

  select jsonb_build_object(
           'id', au.id,
           'email', au.email,
           'display_name', coalesce(p.display_name, au.raw_user_meta_data ->> 'display_name', ''),
           'created_at', au.created_at,
           'last_sign_in_at', au.last_sign_in_at,
           'email_confirmed_at', au.email_confirmed_at,
           'confirmed', au.email_confirmed_at is not null,
           'provider', au.raw_app_meta_data ->> 'provider',
           'is_admin', exists (select 1 from public.admins a where lower(a.email) = lower(au.email))
         )
    into v_user
    from auth.users au
    left join public.profiles p on p.id = au.id
   where au.id = p_user_id;

  if v_user is null then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(distinct visitor_id), '{}')
    into v_visitors
    from (
      select visitor_id from public.live_presence where user_id = p_user_id and visitor_id is not null
      union
      select visitor_id from public.downloads where user_id = p_user_id and visitor_id is not null
    ) v;

  return jsonb_build_object(
    'user', v_user,
    'presence', coalesce((
      select jsonb_agg(jsonb_build_object(
               'actor', lp.actor, 'visitor_id', lp.visitor_id, 'path', lp.path,
               'ip', lp.ip, 'country_code', lp.country_code, 'country', lp.country,
               'region', lp.region, 'city', lp.city,
               'fingerprint', lp.fingerprint, 'fp_components', lp.fp_components,
               'user_agent', lp.user_agent, 'language', lp.language, 'screen', lp.screen,
               'timezone', lp.timezone, 'first_seen', lp.first_seen, 'last_seen', lp.last_seen,
               'heartbeats', lp.heartbeats,
               'status', case
                           when lp.last_seen >= now() - interval '2 minutes' then 'active'
                           when lp.last_seen >= now() - interval '10 minutes' then 'idle'
                           else 'offline' end
             ) order by lp.last_seen desc)
        from public.live_presence lp
       where lp.user_id = p_user_id
          or (lp.visitor_id = any (v_visitors))), '[]'::jsonb),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'ip', host(s.ip), 'user_agent', s.user_agent,
               'created_at', s.created_at, 'refreshed_at', s.refreshed_at, 'updated_at', s.updated_at,
               'not_after', s.not_after, 'aal', s.aal
             ) order by coalesce(s.refreshed_at, s.updated_at, s.created_at) desc)
        from auth.sessions s where s.user_id = p_user_id), '[]'::jsonb),
    'downloads', coalesce((
      select jsonb_agg(d order by d ->> 'at' desc) from (
        select jsonb_build_object('at', created_at, 'file', paper_title, 'paper_id', paper_id, 'source', 'account') as d
          from public.downloads where user_id = p_user_id
        union all
        select jsonb_build_object('at', created_at, 'file', file_name, 'paper_id', paper_id, 'dataset', dataset, 'source', 'guest-before-sign-in')
          from public.download_events
         where user_id = p_user_id or (visitor_id is not null and visitor_id = any (v_visitors))
        order by 1 desc
        limit 200
      ) x), '[]'::jsonb),
    'download_count', (select count(*) from public.downloads where user_id = p_user_id)
                    + (select count(*) from public.download_events
                        where user_id = p_user_id or (visitor_id is not null and visitor_id = any (v_visitors))),
    'page_views', coalesce((
      select jsonb_agg(jsonb_build_object('at', created_at, 'path', path, 'referrer', referrer, 'country', country) order by created_at desc)
        from (select * from public.page_views where user_id = p_user_id order by created_at desc limit 50) pv), '[]'::jsonb),
    'page_view_count', (select count(*) from public.page_views where user_id = p_user_id),
    'security_events', coalesce((
      select jsonb_agg(jsonb_build_object('at', created_at, 'kind', kind, 'ip', ip, 'user_agent', user_agent) order by created_at desc)
        from (select * from public.security_events
               where user_id = p_user_id or lower(email) = lower(v_user ->> 'email')
               order by created_at desc limit 50) se), '[]'::jsonb),
    'tutor_requests', coalesce((
      select jsonb_agg(jsonb_build_object('at', created_at, 'subject', subject, 'status', status) order by created_at desc)
        from public.human_tutor_requests where user_id = p_user_id), '[]'::jsonb),
    'teacher_application', (
      select jsonb_build_object('at', created_at, 'subjects', subjects, 'status', status)
        from public.teacher_applications where user_id = p_user_id order by created_at desc limit 1),
    'generated_at', now()
  );
end;
$$;

revoke all on function public.admin_users(text, int) from public;
revoke all on function public.admin_user_detail(uuid) from public;
grant execute on function public.admin_users(text, int) to authenticated;
grant execute on function public.admin_user_detail(uuid) to authenticated;

notify pgrst, 'reload schema';
