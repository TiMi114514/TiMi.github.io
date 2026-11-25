-- ============================================================
-- Donations v2 (2026-11-25): messages are moderated
--
-- * Message-only posts are no longer accepted.
-- * Every donation message starts as message_status = 'pending' and is only
--   published after an admin approves it in /admin/donations — independent of
--   whether the payment itself is confirmed.
-- ============================================================

alter table public.donations add column if not exists message_status text not null default 'pending';
alter table public.donations drop constraint if exists donations_message_status_check;
alter table public.donations add constraint donations_message_status_check
  check (message_status in ('pending', 'approved', 'rejected'));
alter table public.donations add column if not exists message_reviewed_at timestamptz;
alter table public.donations add column if not exists message_reviewed_by text;

-- Old message-only rows: take them off the wall and back into review.
update public.donations set status = 'hidden', message_status = 'pending' where kind = 'message' and status = 'confirmed';
-- Messages that were never approved explicitly stay pending (default).

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
    case when p_method in ('wechat', 'alipay', 'paypal', 'other') then p_method end,
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

create or replace function public.donation_wall(p_limit int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with money as (
    select * from public.donations where status = 'confirmed' and kind = 'donation'
  ),
  month as (
    select * from money where created_at >= now() - interval '30 days'
  ),
  donors as (
    select case
             when anonymous then 'anon:' || id
             when user_id is not null then 'u:' || user_id
             when display_name is not null then 'n:' || lower(display_name)
             else 'anon:' || id
           end as donor_key,
           *
      from month
  ),
  ranked as (
    select donor_key,
           bool_or(anonymous) as anonymous,
           (array_agg(display_name order by created_at desc))[1] as display_name,
           sum(case when currency = 'CNY' then amount else 0 end) as cny,
           sum(case when currency = 'USD' then amount else 0 end) as usd,
           sum(public._donation_cny(amount, currency)) as cny_equiv,
           count(*) as gifts,
           max(created_at) as last_at
      from donors
     group by donor_key
     order by cny_equiv desc, last_at asc
     limit 3
  )
  select jsonb_build_object(
    'stats', jsonb_build_object(
      'donors_30d', (select count(distinct donor_key) from donors),
      'gifts_30d', (select count(*) from month),
      'cny_30d', (select coalesce(sum(amount), 0) from month where currency = 'CNY'),
      'usd_30d', (select coalesce(sum(amount), 0) from month where currency = 'USD'),
      'gifts_all', (select count(*) from money),
      'cny_all', (select coalesce(sum(amount), 0) from money where currency = 'CNY'),
      'usd_all', (select coalesce(sum(amount), 0) from money where currency = 'USD'),
      'messages', (select count(*) from money where message is not null and message_status = 'approved')
    ),
    'top', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', case when anonymous then null else display_name end,
               'cny', cny, 'usd', usd, 'cny_equiv', round(cny_equiv, 2),
               'gifts', gifts, 'last_at', last_at
             ) order by cny_equiv desc, last_at asc)
        from ranked), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', public_id,
               'kind', kind,
               'name', case when anonymous then null else display_name end,
               'amount', amount,
               'currency', currency,
               'method', method,
               -- Only admin-approved messages are ever published.
               'message', case when message_status = 'approved' then message end,
               'at', created_at
             ) order by created_at desc)
        from (select * from money order by created_at desc
               limit greatest(1, least(coalesce(p_limit, 30), 100))) r), '[]'::jsonb),
    'generated_at', now()
  );
$$;

create or replace function public.admin_donations(p_status text default null, p_limit int default 200)
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
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'public_id', d.public_id, 'kind', d.kind,
           'user_id', d.user_id, 'email', p.email, 'display_name', d.display_name,
           'anonymous', d.anonymous, 'amount', d.amount, 'currency', d.currency,
           'method', d.method, 'message', d.message, 'message_status', d.message_status,
           'message_reviewed_at', d.message_reviewed_at, 'message_reviewed_by', d.message_reviewed_by,
           'reference', d.reference,
           'status', d.status, 'ip', d.ip, 'user_agent', d.user_agent, 'visitor_id', d.visitor_id,
           'created_at', d.created_at, 'reviewed_at', d.reviewed_at, 'reviewed_by', d.reviewed_by
         ) order by d.created_at desc), '[]'::jsonb)
    into v_items
    from (select * from public.donations
           where p_status is null
              or (p_status = 'messages' and message is not null and message_status = 'pending')
              or status = p_status
           order by created_at desc
           limit greatest(1, least(coalesce(p_limit, 200), 1000))) d
    left join public.profiles p on p.id = d.user_id;

  return jsonb_build_object(
    'items', v_items,
    'total', jsonb_array_length(v_items),
    'pending', (select count(*) from public.donations where status = 'pending'),
    'pending_messages', (select count(*) from public.donations where message is not null and message_status = 'pending'),
    'generated_at', now()
  );
end;
$$;

create or replace function public.admin_donation_message_review(p_id bigint, p_status text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.donations;
begin
  perform public._admin_guard();
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'invalid message status';
  end if;
  update public.donations
     set message_status = p_status,
         message_reviewed_at = now(),
         message_reviewed_by = auth.jwt() ->> 'email'
   where id = p_id and message is not null
  returning * into v_row;
  if v_row.id is null then
    raise exception 'donation message not found';
  end if;
  perform public._admin_audit('donation.message.' || p_status, v_row.public_id, '{}'::jsonb);
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.admin_donation_message_review(bigint, text) from public;
grant execute on function public.admin_donation_message_review(bigint, text) to authenticated;

notify pgrst, 'reload schema';
