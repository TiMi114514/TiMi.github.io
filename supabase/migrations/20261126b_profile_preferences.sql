-- ============================================================
-- Profile preferences detected at sign-up (2026-11-26)
--   locale     : UI language chosen from the visitor's IP country (or their own choice)
--   exam_zone  : Cambridge administrative zone (1-6) from IP timezone / country
--   country    : ISO-3166 alpha-2 seen at sign-up (informational)
-- Values arrive in auth user metadata at sign-up and are copied by the trigger.
-- Users may change their own row (existing profiles_update_own policy).
-- ============================================================

alter table public.profiles add column if not exists locale text;
alter table public.profiles add column if not exists exam_zone smallint;
alter table public.profiles add column if not exists country text;

alter table public.profiles drop constraint if exists profiles_locale_check;
alter table public.profiles add constraint profiles_locale_check
  check (locale is null or locale in ('en', 'zh-CN', 'zh-TW', 'ru', 'fr', 'de', 'it', 'ja'));
alter table public.profiles drop constraint if exists profiles_exam_zone_check;
alter table public.profiles add constraint profiles_exam_zone_check
  check (exam_zone is null or exam_zone between 1 and 6);
alter table public.profiles drop constraint if exists profiles_country_check;
alter table public.profiles add constraint profiles_country_check
  check (country is null or country ~ '^[A-Z]{2}$');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_locale text := v_meta ->> 'locale';
  v_zone text := v_meta ->> 'exam_zone';
  v_country text := upper(v_meta ->> 'country');
begin
  insert into public.profiles (id, email, display_name, locale, exam_zone, country)
  values (
    new.id,
    new.email,
    coalesce(v_meta ->> 'display_name', split_part(new.email, '@', 1)),
    case when v_locale in ('en', 'zh-CN', 'zh-TW', 'ru', 'fr', 'de', 'it', 'ja') then v_locale end,
    case when v_zone ~ '^[1-6]$' then v_zone::smallint end,
    case when v_country ~ '^[A-Z]{2}$' then v_country end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- admin_users / admin_user_detail expose the new fields.
create or replace function public.my_preferences()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('locale', locale, 'exam_zone', exam_zone, 'country', country)
    from public.profiles where id = auth.uid();
$$;

create or replace function public.set_my_preferences(p_locale text default null, p_exam_zone int default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  update public.profiles
     set locale = case when p_locale in ('en', 'zh-CN', 'zh-TW', 'ru', 'fr', 'de', 'it', 'ja') then p_locale else locale end,
         exam_zone = case when p_exam_zone between 1 and 6 then p_exam_zone::smallint else exam_zone end
   where id = auth.uid();
  return public.my_preferences();
end;
$$;

revoke all on function public.my_preferences() from public, anon;
revoke all on function public.set_my_preferences(text, int) from public, anon;
grant execute on function public.my_preferences() to authenticated;
grant execute on function public.set_my_preferences(text, int) to authenticated;

notify pgrst, 'reload schema';
