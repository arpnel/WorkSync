-- PREPARED, NOT APPLIED.
-- Store one active refund attempt on its existing subscription_orders row.
-- admin_audit_log retains the immutable review and provider status history.
-- Provider calls remain in the server API.
begin;

do $$
begin
  if to_regclass('public.subscription_orders') is null
     or to_regclass('public.user_subscriptions') is null
     or to_regclass('public.admin_audit_log') is null then
    raise exception 'Subscription orders, entitlements, and admin audit tables are required';
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

alter table public.subscription_orders
  add column if not exists refund_id uuid,
  add column if not exists refund_status text,
  add column if not exists refund_provider_refund_id text,
  add column if not exists refund_reviewer_id uuid references public."Users"(user_id),
  add column if not exists refund_reviewed_unused boolean,
  add column if not exists refund_support_ticket_ref text,
  add column if not exists refund_exception_type text,
  add column if not exists refund_exception_reason text,
  add column if not exists refund_usage_evidence jsonb,
  add column if not exists refund_claimed_at timestamptz,
  add column if not exists refund_updated_at timestamptz,
  add column if not exists refund_completed_at timestamptz;

create unique index if not exists subscription_orders_refund_id_unique
  on public.subscription_orders(refund_id) where refund_id is not null;
create unique index if not exists subscription_orders_provider_refund_id_unique
  on public.subscription_orders(refund_provider_refund_id)
  where refund_provider_refund_id is not null;

alter table public.subscription_orders
  drop constraint if exists subscription_orders_refund_status_check;
alter table public.subscription_orders
  add constraint subscription_orders_refund_status_check
  check (refund_status is null or refund_status in ('processing','pending','refunded','failed','needs_review'));
alter table public.subscription_orders
  drop constraint if exists subscription_orders_refund_exception_check;
alter table public.subscription_orders
  add constraint subscription_orders_refund_exception_check
  check (refund_exception_type is null or refund_exception_type in ('technical_failure','applicable_law'));

alter table public.subscription_orders
  drop constraint if exists subscription_orders_status_check;
alter table public.subscription_orders
  add constraint subscription_orders_status_check
  check (status in ('pending','paid','failed','needs_review','refunded'));

create or replace function public.worksync_claim_subscription_refund(
  p_order uuid,
  p_reviewer uuid,
  p_reviewed_unused boolean,
  p_support_ticket_ref text,
  p_exception_type text,
  p_exception_reason text,
  p_usage_evidence jsonb
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
  assignment public.user_subscriptions%rowtype;
  new_refund_id uuid := gen_random_uuid();
  remaining interval;
  standard_allowed boolean;
  usage_signals integer;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_reviewer is null or length(btrim(coalesce(p_support_ticket_ref, ''))) < 2
     or length(p_support_ticket_ref) > 100 then
    raise exception 'A reviewed support ticket reference is required';
  end if;
  if p_exception_type is not null and p_exception_type not in ('technical_failure','applicable_law') then
    raise exception 'Invalid refund exception type';
  end if;
  if p_exception_type is not null and length(btrim(coalesce(p_exception_reason, ''))) < 10 then
    raise exception 'Document the technical failure or applicable-law exception';
  end if;

  select * into order_row
  from public.subscription_orders
  where subscription_orders.order_id = p_order
  for update;
  if not found or order_row.status <> 'paid' or order_row.provider_payment_id is null then
    raise exception 'Only a confirmed Premium purchase can be refunded';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(order_row.user_id::text, 0));
  if exists (
    select 1 from public.subscription_orders later_order
    where later_order.user_id = order_row.user_id
      and later_order.status = 'paid'
      and (coalesce(later_order.paid_at, later_order.created_at), later_order.order_id)
          > (coalesce(order_row.paid_at, order_row.created_at), order_row.order_id)
  ) then
    raise exception 'Review the most recent Premium purchase before issuing a refund';
  end if;
  if order_row.refund_status in ('processing','pending','needs_review') then
    raise exception 'A refund for this purchase is already being processed';
  end if;

  select * into assignment
  from public.user_subscriptions
  where user_subscriptions.user_id = order_row.user_id
  for update;
  if found and assignment.plan_code = 'pro' and assignment.access_type = 'paid' then
    remaining := assignment.period_ends_at - clock_timestamp();
  else
    remaining := interval '0';
  end if;
  usage_signals := coalesce(jsonb_array_length(coalesce(p_usage_evidence->'signals', '[]'::jsonb)), 0);
  standard_allowed := coalesce(assignment.plan_code = 'pro'
    and assignment.access_type = 'paid'
    and assignment.period_ends_at > clock_timestamp()
    and remaining > interval '30 days'
    and coalesce((p_usage_evidence->>'verified')::boolean, false)
    and usage_signals = 0
    and p_reviewed_unused is true, false);
  if not standard_allowed and p_exception_type is null then
    raise exception 'Standard refund unavailable: verify Premium use, remaining time, and exception eligibility';
  end if;

  update public.subscription_orders
  set refund_id = new_refund_id,
      refund_status = 'processing',
      refund_provider_refund_id = null,
      refund_reviewer_id = p_reviewer,
      refund_reviewed_unused = p_reviewed_unused,
      refund_support_ticket_ref = btrim(p_support_ticket_ref),
      refund_exception_type = p_exception_type,
      refund_exception_reason = nullif(btrim(p_exception_reason), ''),
      refund_usage_evidence = coalesce(p_usage_evidence, '{}'::jsonb),
      refund_claimed_at = clock_timestamp(),
      refund_updated_at = clock_timestamp(),
      refund_completed_at = null
  where subscription_orders.order_id = p_order;

  insert into public.admin_audit_log(admin_id, action, target_id, details)
  values (p_reviewer, 'subscription_refund_requested', p_order,
    jsonb_build_object(
      'refund_id', new_refund_id,
      'support_ticket_ref', btrim(p_support_ticket_ref),
      'reviewed_unused', p_reviewed_unused,
      'exception_type', p_exception_type,
      'exception_reason', nullif(btrim(p_exception_reason), ''),
      'usage_evidence', coalesce(p_usage_evidence, '{}'::jsonb),
      'remaining_seconds', extract(epoch from remaining),
      'purchased_term', order_row.billing_period,
      'standard_eligible', standard_allowed
    ));

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
declare changed_order uuid;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  update public.subscription_orders
  set refund_provider_refund_id = p_provider_refund_id,
      refund_status = 'pending', refund_updated_at = clock_timestamp()
  where refund_id = p_refund and refund_status = 'processing'
    and refund_provider_refund_id is null
  returning order_id into changed_order;
  if changed_order is not null then
    insert into public.admin_audit_log(admin_id, action, target_id, details)
    select refund_reviewer_id, 'subscription_refund_provider_submitted', changed_order,
      jsonb_build_object('refund_id', p_refund)
    from public.subscription_orders where order_id = changed_order;
  end if;
  return changed_order is not null;
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
  order_row public.subscription_orders%rowtype;
  term interval;
  new_end timestamptz;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_status not in ('refunded','failed','pending','needs_review') then
    raise exception 'Invalid provider refund status';
  end if;
  select * into order_row from public.subscription_orders
  where refund_id = p_refund for update;
  if not found then raise exception 'Provider refund reference is unavailable'; end if;
  if p_status <> 'needs_review' and order_row.refund_provider_refund_id is null then
    raise exception 'Provider refund reference is unavailable';
  end if;
  if order_row.refund_status in ('refunded','failed') then
    return order_row.refund_status = p_status;
  end if;
  update public.subscription_orders
  set refund_status = p_status,
      refund_completed_at = case when p_status = 'refunded' then clock_timestamp() else null end,
      refund_updated_at = clock_timestamp(),
      status = case when p_status = 'refunded' then 'refunded' else status end
  where order_id = order_row.order_id;
  if p_status = 'refunded' then
    term := case order_row.billing_period
      when 'yearly' then interval '1 year'
      when 'monthly' then interval '1 month'
      else interval '0'
    end;
    select period_ends_at - term into new_end
    from public.user_subscriptions
    where user_id = order_row.user_id and plan_code = 'pro' and access_type = 'paid'
    for update;
    if new_end is not null then
      update public.user_subscriptions
      set period_ends_at = new_end,
          plan_code = case when new_end <= clock_timestamp() then 'free' else plan_code end,
          access_type = case
            when new_end <= clock_timestamp() then 'free'
            when trial_claimed_at is not null and new_end <= trial_claimed_at + interval '3 months' then 'trial'
            else 'paid'
          end,
          updated_at = clock_timestamp()
      where user_id = order_row.user_id and plan_code = 'pro' and access_type = 'paid';
    end if;
  end if;
  insert into public.admin_audit_log(admin_id, action, target_id, details)
  values (order_row.refund_reviewer_id, 'subscription_refund_status_updated', order_row.order_id,
    jsonb_build_object('refund_id', p_refund, 'status', p_status));
  return true;
end;
$$;

revoke all on function public.worksync_claim_subscription_refund(uuid,uuid,boolean,text,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.worksync_record_subscription_refund_provider(uuid,text)
  from public, anon, authenticated;
revoke all on function public.worksync_finish_subscription_refund(uuid,text)
  from public, anon, authenticated;
grant execute on function public.worksync_claim_subscription_refund(uuid,uuid,boolean,text,text,text,jsonb)
  to service_role;
grant execute on function public.worksync_record_subscription_refund_provider(uuid,text)
  to service_role;
grant execute on function public.worksync_finish_subscription_refund(uuid,text)
  to service_role;

notify pgrst, 'reload schema';
commit;
