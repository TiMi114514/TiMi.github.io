-- ============================================================
-- Donations v3 (2026-11-25): bank cards (Visa / Mastercard / UnionPay / Amex) + PayPal
--
-- The site is static, so card data never touches it: donors are sent to the
-- provider's hosted checkout (Stripe Payment Link or similar) configured by an
-- admin. The donation id is passed as client_reference_id so the payment can be
-- matched in the provider dashboard, then confirmed in /admin/donations.
-- ============================================================

alter table public.donations drop constraint if exists donations_method_check;
alter table public.donations add constraint donations_method_check
  check (method in ('wechat', 'alipay', 'card', 'paypal', 'other'));

-- Public site settings (read by anyone when is_public, written only by admins).
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;

drop policy if exists "site_settings_read_public" on public.site_settings;
create policy "site_settings_read_public"
  on public.site_settings for select
  using (is_public or public.is_admin());

create or replace function public.get_public_setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select value from public.site_settings where key = p_key and is_public;
$$;

create or replace function public.admin_setting_set(p_key text, p_value jsonb, p_public boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.site_settings;
  v_url text;
begin
  perform public._admin_guard();
  if p_key !~ '^[a-z0-9][a-z0-9._-]{0,63}$' then
    raise exception 'invalid key';
  end if;
  if p_value ? 'secret' or p_value ? 'token' or p_value ? 'api_key' or p_value ? 'secret_key' then
    raise exception 'never store secrets in site settings';
  end if;
  -- Payment links must be https.
  for v_url in select value from jsonb_each_text(p_value) where key like '%url' and value <> '' loop
    if v_url !~ '^https://' then
      raise exception 'links must start with https://';
    end if;
  end loop;

  insert into public.site_settings as s (key, value, is_public, updated_by, updated_at)
  values (p_key, coalesce(p_value, '{}'::jsonb), coalesce(p_public, false), auth.jwt() ->> 'email', now())
  on conflict (key) do update
    set value = excluded.value, is_public = excluded.is_public,
        updated_by = excluded.updated_by, updated_at = now()
  returning * into v_row;

  perform public._admin_audit('setting.set', p_key, '{}'::jsonb);
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.get_public_setting(text) from public;
revoke all on function public.admin_setting_set(text, jsonb, boolean) from public;
grant execute on function public.get_public_setting(text) to anon, authenticated;
grant execute on function public.admin_setting_set(text, jsonb, boolean) to authenticated;

insert into public.site_settings (key, value, is_public, updated_by)
values ('donate.payments', '{"card_url":"","card_provider":"Stripe","paypal_url":""}'::jsonb, true, 'seed')
on conflict (key) do nothing;

-- Accept 'card' in the donor form.
create or replace function public.submit_donation(
  p_kind text,
  p_name text,
  p_anonymous boolean,
  p_amount numeric,
  p_currency text,
  p_method text,
  p_message text,
  p_reference text,
  p_visitor text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ip text := left(public._req_ip(), 64);
  v_name text := nullif(left(trim(coalesce(p_name, '')), 40), '');
  v_message text := nullif(left(trim(coalesce(p_message, '')), 300), '');
  v_row public.donations;
begin
  if p_kind = 'message' then
    raise exception 'Messages can only be left together with a donation.' using errcode = 'P0001';
  end if;

  if v_ip is not null and (select count(*) from public.donations
                             where ip = v_ip and created_at > now() - interval '1 hour') >= 6 then
    raise exception 'Too many submissions from this network. Please try again later.' using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount < 0.01 or p_amount > 100000 then
    raise exception 'Enter an amount between 0.01 and 100000.' using errcode = 'P0001';
  end if;
  if p_currency not in ('CNY', 'USD') then
    raise exception 'Unsupported currency.' using errcode = 'P0001';
  end if;

  if v_name is null and auth.uid() is not null then
    select nullif(display_name, '') into v_name from public.profiles where id = auth.uid();
  end if;

  insert into public.donations (
    kind, user_id, display_name, anonymous, amount, currency, method, message, message_status, reference,
    status, visitor_id, ip, user_agent
  ) values (
    'donation',
    auth.uid(),
    v_name,
    coalesce(p_anonymous, false),
    round(p_amount, 2),
    p_currency,
    case when p_method in ('wechat', 'alipay', 'card', 'paypal', 'other') then p_method end,
    v_message,
    'pending',
    nullif(left(trim(coalesce(p_reference, '')), 80), ''),
    'pending',
    nullif(left(p_visitor, 64), ''),
    v_ip,
    left(public._req_header('user-agent'), 400)
  )
  returning * into v_row;

  return jsonb_build_object('public_id', v_row.public_id, 'status', v_row.status, 'kind', v_row.kind);
end;
$$;

notify pgrst, 'reload schema';
