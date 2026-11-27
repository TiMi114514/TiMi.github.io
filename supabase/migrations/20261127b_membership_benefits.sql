-- ============================================================
-- Membership benefits (2026-11-27)
--   * AI tutor: daily question quota per plan (free / pro), enforced by the gateway.
--   * Human tutor: Pro requests are flagged priority and listed first for admins.
-- Quotas live in site_settings 'membership.config' so they can be changed without a deploy.
-- ============================================================

insert into public.site_settings (key, value, is_public, updated_by)
values ('membership.config', jsonb_build_object(
  'ai_daily', jsonb_build_object('free', 10, 'pro', 100),
  'pro_label', '会员'
), true, 'seed')
on conflict (key) do nothing;

-- Daily AI usage counter (Beijing calendar day). Written only by record_ai_usage().
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  questions int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
drop policy if exists "ai_usage_own" on public.ai_usage;
create policy "ai_usage_own" on public.ai_usage for select using (auth.uid() = user_id or public.is_admin());

-- Human tutor requests: priority flag set from the plan at submission time.
alter table public.human_tutor_requests add column if not exists priority boolean not null default false;

create or replace function public._human_request_priority()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.priority := exists (
    select 1 from public.profiles p
     where p.id = new.user_id and public._plan_effective(p.plan, p.plan_expires_at) = 'pro');
  return new;
end;
$$;
drop trigger if exists human_request_priority on public.human_tutor_requests;
create trigger human_request_priority before insert on public.human_tutor_requests
  for each row execute function public._human_request_priority();

-- Called by the gateway (with the user's own JWT) before answering an AI question.
-- Atomically checks the plan quota and counts the question. Returns whether it is allowed.
create or replace function public.record_ai_usage()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Shanghai')::date;
  v_cfg jsonb := (select value from public.site_settings where key = 'membership.config');
  v_plan text;
  v_limit int;
  v_used int;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select public._plan_effective(plan, plan_expires_at) into v_plan from public.profiles where id = v_uid;
  v_plan := coalesce(v_plan, 'free');
  v_limit := coalesce((v_cfg -> 'ai_daily' ->> v_plan)::int, case when v_plan = 'pro' then 100 else 10 end);

  insert into public.ai_usage (user_id, day, questions) values (v_uid, v_day, 0)
  on conflict (user_id, day) do nothing;
  select questions into v_used from public.ai_usage where user_id = v_uid and day = v_day for update;

  if v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'plan', v_plan, 'used', v_used, 'limit', v_limit);
  end if;
  update public.ai_usage set questions = questions + 1 where user_id = v_uid and day = v_day;
  return jsonb_build_object('allowed', true, 'plan', v_plan, 'used', v_used + 1, 'limit', v_limit);
end;
$$;

-- my_account(): add plan benefits and today's AI usage.
create or replace function public.my_account()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  with me as (
    select u.*, p.display_name, p.locale, p.exam_zone, p.country, p.plan, p.plan_expires_at,
           public._plan_effective(p.plan, p.plan_expires_at) as eff
      from auth.users u join public.profiles p on p.id = u.id
     where u.id = auth.uid()
  ), cfg as (
    select value v from public.site_settings where key = 'membership.config'
  )
  select jsonb_build_object(
    'email', me.email,
    'created_at', me.created_at,
    'last_sign_in_at', me.last_sign_in_at,
    'email_confirmed_at', me.email_confirmed_at,
    'display_name', me.display_name,
    'locale', me.locale,
    'exam_zone', me.exam_zone,
    'country', me.country,
    'plan', me.eff,
    'plan_expires_at', case when me.plan = 'pro' then me.plan_expires_at end,
    'ai', jsonb_build_object(
      'limit', coalesce((cfg.v -> 'ai_daily' ->> me.eff)::int, case when me.eff = 'pro' then 100 else 10 end),
      'used_today', coalesce((select questions from public.ai_usage where user_id = me.id and day = (now() at time zone 'Asia/Shanghai')::date), 0),
      'free_limit', coalesce((cfg.v -> 'ai_daily' ->> 'free')::int, 10),
      'pro_limit', coalesce((cfg.v -> 'ai_daily' ->> 'pro')::int, 100)
    ),
    'tutor_priority', me.eff = 'pro',
    'pomodoro', jsonb_build_object(
      'total_minutes', coalesce((select sum(minutes) from public.pomodoro_sessions where user_id = me.id and mode = 'focus'), 0),
      'sessions', (select count(*) from public.pomodoro_sessions where user_id = me.id and mode = 'focus'),
      'week_minutes', coalesce((select sum(minutes) from public.pomodoro_sessions where user_id = me.id and mode = 'focus' and completed_at > now() - interval '7 days'), 0),
      'today_minutes', coalesce((select sum(minutes) from public.pomodoro_sessions where user_id = me.id and mode = 'focus'
                                   and (completed_at at time zone 'Asia/Shanghai')::date = (now() at time zone 'Asia/Shanghai')::date), 0)
    ),
    'redemptions', coalesce((select jsonb_agg(jsonb_build_object('code_tail', right(code, 4), 'days', days, 'redeemed_at', redeemed_at, 'granted_until', granted_until, 'status', status) order by redeemed_at desc)
                               from public.redeem_codes where redeemed_by = me.id), '[]'::jsonb)
  )
  from me left join cfg on true;
$$;

-- Admin: change quotas.
create or replace function public.admin_membership_config(p_free int, p_pro int)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform public._admin_guard();
  if p_free < 0 or p_pro < 0 or p_free > 10000 or p_pro > 10000 then raise exception '额度需在 0–10000 之间'; end if;
  v := coalesce((select value from public.site_settings where key = 'membership.config'), '{}'::jsonb)
       || jsonb_build_object('ai_daily', jsonb_build_object('free', p_free, 'pro', p_pro));
  update public.site_settings set value = v, updated_by = auth.jwt() ->> 'email', updated_at = now() where key = 'membership.config';
  perform public._admin_audit('membership.config', null, v);
  return v;
end;
$$;

revoke all on function public._human_request_priority() from public, anon, authenticated;
revoke all on function public.record_ai_usage() from public, anon;
revoke all on function public.admin_membership_config(int, int) from public, anon;
grant execute on function public.record_ai_usage() to authenticated;
grant execute on function public.admin_membership_config(int, int) to authenticated;

notify pgrst, 'reload schema';
