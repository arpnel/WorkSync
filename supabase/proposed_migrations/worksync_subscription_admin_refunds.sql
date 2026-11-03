-- PREPARED, NOT APPLIED.
-- Tracks subscription refund requests reviewed through support tickets.
-- Refunds are full-order PayMongo refunds and require an admin attestation that
-- no Premium-only benefit was used. Provider calls remain in the server API.
begin;

do $$
begin
  if to_regclass('public.subscription_orders') is null
     or to_regclass('public.user_subscriptions') is null then
    raise exception 'Subscription billing tables are required';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='subscription_orders'
      and column_name='billing_period'
  ) then
    raise exception 'Apply the Premium monthly/yearly billing migration first';
  end if;
end;
$$;

create table if not exists public.subscription_refunds (
  refund_id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.subscription_orders(order_id),
  amount numeric(10,2) not null check (amount > 0),
  status text not null default 'processing'
    check (status in ('processing','pending','refunded','failed','needs_review')),
  provider_refund_id text unique,
  reviewer_id uuid not null references public."Users"(user_id),
  reviewed_unused boolean not null check (reviewed_unused),
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  refunded_at timestamptz
);
create unique index if not exists subscription_refunds_one_unresolved_per_order
  on public.subscription_refunds(order_id)
  where status <> 'failed';

alter table public.subscription_refunds enable row level security;
revoke all on public.subscription_refunds from public, anon, authenticated;
grant select, insert, update on public.subscription_refunds to service_role;

alter table public.subscription_orders
  drop constraint if exists subscription_orders_status_check;
alter table public.subscription_orders
  add constraint subscription_orders_status_check
  check (status in ('pending','paid','failed','needs_review','refunded'));

create or replace function public.worksync_claim_subscription_refund(
  p_order uuid,
  p_reviewer uuid,
  p_reviewed_unused boolean
)
returns table (
  refund_id uuid,
  order_id uuid,
  user_id uuid,
  amount numeric,
  provider_payment_id text,
  livemode boolean,
  billing_period text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.subscription_orders%rowtype;
  new_refund_id uuid;
begin
  if pg_catalog.current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_reviewed_unused is distinct from true then
    raise exception 'Review the support ticket and confirm Premium benefits were unused';
  end if;
  select * into order_row
  from public.subscription_orders
  where subscription_orders.order_id = p_order
  for update;
  if not found or order_row.status <> 'paid'
     or order_row.provider_payment_id is null then
    raise exception 'Only a confirmed Premium purchase can be refunded';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(order_row.user_id::text, 0)
  );
  if exists (
    select 1 from public.subscription_orders later_order
    where later_order.user_id = order_row.user_id
      and later_order.status = 'paid'
      and (later_order.paid_at, later_order.order_id) > (order_row.paid_at, order_row.order_id)
  ) then
    raise exception 'Review the most recent Premium purchase before issuing a refund';
  end if;
  insert into public.subscription_refunds (
    order_id, amount, reviewer_id, reviewed_unused
  ) values (
    order_row.order_id, order_row.amount, p_reviewer, true
  ) returning subscription_refunds.refund_id into new_refund_id;
  return query select new_refund_id, order_row.order_id, order_row.user_id,
    order_row.amount, order_row.provider_payment_id, order_row.livemode,
    order_row.billing_period;
end;
$$;

create or replace function public.worksync_record_subscription_refund_provider(
  p_refund uuid,
  p_provider_refund_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  update public.subscription_refunds
  set provider_refund_id = p_provider_refund_id,
      status = 'pending', updated_at = pg_catalog.now()
  where refund_id = p_refund and status = 'processing'
    and provider_refund_id is null;
  return found;
end;
$$;

create or replace function public.worksync_finish_subscription_refund(
  p_refund uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  refund_row public.subscription_refunds%rowtype;
  order_row public.subscription_orders%rowtype;
  term interval;
begin
  if pg_catalog.current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_status not in ('refunded','failed','pending','needs_review') then
    raise exception 'Invalid provider refund status';
  end if;
  select * into refund_row from public.subscription_refunds
  where refund_id = p_refund for update;
  if not found then
    raise exception 'Provider refund reference is unavailable';
  end if;
  if p_status <> 'needs_review' and refund_row.provider_refund_id is null then
    raise exception 'Provider refund reference is unavailable';
  end if;
  if refund_row.status in ('refunded','failed') then
    return refund_row.status = p_status;
  end if;
  update public.subscription_refunds
  set status = p_status,
      refunded_at = case when p_status = 'refunded' then pg_catalog.now() else null end,
      updated_at = pg_catalog.now()
  where refund_id = p_refund;
  if p_status <> 'refunded' then return true; end if;

  select * into order_row from public.subscription_orders
  where subscription_orders.order_id = refund_row.order_id for update;
  if order_row.status <> 'paid' then
    raise exception 'Subscription order is not in a refundable state';
  end if;
  update public.subscription_orders set status = 'refunded'
  where subscription_orders.order_id = order_row.order_id;

  term := case order_row.billing_period
    when 'yearly' then interval '1 year'
    else interval '1 month'
  end;
  update public.user_subscriptions
  set period_ends_at = period_ends_at - term,
      plan_code = case when period_ends_at - term <= pg_catalog.now()
        then 'free' else plan_code end,
      access_type = case
        when period_ends_at - term <= pg_catalog.now() then 'free'
        when trial_claimed_at is not null
          and period_ends_at - term <= trial_claimed_at + interval '3 months' then 'trial'
        else 'paid'
      end,
      updated_at = pg_catalog.now()
  where user_id = order_row.user_id
    and plan_code = 'pro' and access_type = 'paid';
  return true;
end;
$$;

revoke all on function public.worksync_claim_subscription_refund(uuid,uuid,boolean)
  from public, anon, authenticated;
revoke all on function public.worksync_record_subscription_refund_provider(uuid,text)
  from public, anon, authenticated;
revoke all on function public.worksync_finish_subscription_refund(uuid,text)
  from public, anon, authenticated;
grant execute on function public.worksync_claim_subscription_refund(uuid,uuid,boolean)
  to service_role;
grant execute on function public.worksync_record_subscription_refund_provider(uuid,text)
  to service_role;
grant execute on function public.worksync_finish_subscription_refund(uuid,text)
  to service_role;

notify pgrst, 'reload schema';
commit;
