-- PREPARED, NOT APPLIED.
-- Adds explicit monthly and yearly Premium billing intervals.
-- Requires subscription plans/orders, the billing RPC, project-payment VAT
-- snapshots, and 20261101000200_worksync_project_transaction_fee.sql.
begin;

alter table public.subscription_plans
  add column if not exists provisional_annual_price numeric(10,2)
    check (provisional_annual_price is null or provisional_annual_price > 0);

update public.subscription_plans
set display_name = 'Premium',
    provisional_monthly_price = 299.00,
    provisional_annual_price = 2990.00,
    monthly_job_limit = 2147483647,
    monthly_service_limit = 2147483647,
    active_job_limit = 100,
    active_service_limit = 2147483647,
    active_listing_limit = 100
where plan_code = 'pro';

update public.subscription_plans
set monthly_job_limit = 2147483647,
    active_job_limit = 1,
    active_listing_limit = 1
where plan_code = 'free';

alter table public.subscription_orders
  add column if not exists billing_period text not null default 'monthly';
alter table public.subscription_orders
  add column if not exists legacy_price boolean not null default false;
-- Existing pending/paid orders keep their original one-line checkout semantics.
-- New checkout prices are VAT-exclusive; the 12% VAT is added on top.
alter table public.subscription_orders
  add column if not exists taxable_amount numeric(10,2);
alter table public.subscription_orders
  add column if not exists vat_amount numeric(10,2);
alter table public.subscription_orders
  add column if not exists vat_rate numeric(5,4);
alter table public.subscription_orders
  add column if not exists vat_itemized boolean not null default false;
update public.subscription_orders
set taxable_amount = amount,
    vat_amount = 0,
    vat_rate = 0
where taxable_amount is null or vat_amount is null or vat_rate is null;
alter table public.subscription_orders
  alter column taxable_amount set not null,
  alter column vat_amount set not null,
  alter column vat_rate set not null;
alter table public.subscription_orders
  drop constraint if exists subscription_orders_vat_breakdown_check;
alter table public.subscription_orders
  add constraint subscription_orders_vat_breakdown_check check (
    taxable_amount >= 0 and vat_amount >= 0 and vat_rate >= 0
    and (not vat_itemized or (
      vat_rate = 0.12
      and round(taxable_amount + vat_amount, 2) = amount
      and vat_amount = round(taxable_amount * 0.12, 2)
    ))
  );
update public.subscription_orders
set legacy_price = true
where amount = 999.99 and billing_period = 'monthly';
alter table public.subscription_orders
  drop constraint if exists subscription_orders_billing_period_check;
alter table public.subscription_orders
  add constraint subscription_orders_billing_period_check
  check (billing_period in ('monthly','yearly'));
alter table public.subscription_orders
  drop constraint if exists subscription_orders_amount_check;
alter table public.subscription_orders
  add constraint subscription_orders_amount_check check (amount > 0);

create or replace function public.worksync_confirm_subscription_payment(
  p_order uuid, p_session text, p_payment text, p_paid_at timestamptz
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  order_data public.subscription_orders%rowtype;
  expected_amount numeric(10,2);
  access_start timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  select * into order_data
  from public.subscription_orders
  where order_id = p_order
  for update;
  if not found then return false; end if;

  if order_data.status = 'paid' then
    if order_data.transaction_reference is distinct from p_session
       or order_data.provider_payment_id is distinct from p_payment then
      raise exception 'Subscription payment reference mismatch';
    end if;
    return true;
  end if;
  if order_data.status <> 'pending'
     or order_data.transaction_reference is distinct from p_session then
    raise exception 'Subscription order is not payable';
  end if;

  select case order_data.billing_period
    when 'monthly' then provisional_monthly_price
    when 'yearly' then provisional_annual_price
  end into expected_amount
  from public.subscription_plans
  where plan_code = 'pro';
  if expected_amount is null or (
    (order_data.vat_itemized and (
      order_data.taxable_amount is distinct from expected_amount
      or order_data.vat_amount is distinct from round(expected_amount * 0.12, 2)
      or order_data.amount is distinct from expected_amount + round(expected_amount * 0.12, 2)
    ))
    or (not order_data.vat_itemized
      and order_data.amount is distinct from expected_amount
      and not (order_data.legacy_price and order_data.billing_period = 'monthly'
        and order_data.amount = 999.99))
  ) then
    raise exception 'Subscription order amount does not match its billing period';
  end if;
  if order_data.vat_itemized and (
    order_data.vat_rate is distinct from 0.12
    or order_data.taxable_amount + order_data.vat_amount is distinct from order_data.amount
    or order_data.vat_amount is distinct from round(order_data.taxable_amount * 0.12, 2)
  ) then
    raise exception 'Subscription VAT breakdown does not match its total';
  end if;

  update public.subscription_orders
  set status='paid', provider_payment_id=p_payment,
      paid_at=coalesce(p_paid_at,now())
  where order_id=p_order;
  insert into public.user_subscriptions(user_id)
  values(order_data.user_id) on conflict(user_id) do nothing;
  select case
    when plan_code='pro' and period_ends_at>now() then period_ends_at
    else now()
  end into access_start
  from public.user_subscriptions
  where user_id=order_data.user_id
  for update;
  update public.user_subscriptions
  set plan_code='pro', access_type='paid',
      period_started_at=case
        when plan_code='pro' and period_ends_at>now() then period_started_at
        else now()
      end,
      period_ends_at=access_start + case order_data.billing_period
        when 'yearly' then interval '1 year'
        else interval '1 month'
      end,
      updated_at=now()
  where user_id=order_data.user_id;
  return true;
end;
$$;
revoke all on function public.worksync_confirm_subscription_payment(uuid,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.worksync_confirm_subscription_payment(uuid,text,text,timestamptz)
  to service_role;

create or replace function public.worksync_client_transaction_fee_rate(p_client_user uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select case when exists (
    select 1 from public.user_subscriptions s
    where s.user_id = p_client_user
      and s.plan_code = 'pro'
      and s.period_ends_at > now()
  ) then 0.05 else 0.10 end;
$$;
revoke all on function public.worksync_client_transaction_fee_rate(uuid)
  from public, anon, authenticated;

create or replace function public.worksync_validate_payment_service_vat_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  project_row public.projects;
  client_user uuid;
  agreed_base numeric;
  fee_rate numeric;
begin
  if new.freelancer_service_vat_taxable_base is null then
    raise exception 'New project payments require a server-calculated VAT snapshot';
  end if;
  select * into project_row
  from public.projects where project_id = new.project_id;
  if project_row.project_id is null then
    raise exception 'Project payment target is unavailable';
  end if;
  select user_id into client_user
  from public.client_profiles where client_id = project_row.client_id;
  if client_user is null then raise exception 'Project client is unavailable'; end if;
  select final_price into agreed_base
  from public.contracts
  where (project_row.order_id is not null and order_id = project_row.order_id)
     or (project_row.application_id is not null and application_id = project_row.application_id)
  order by created_at desc limit 1;
  fee_rate := public.worksync_client_transaction_fee_rate(client_user);
  if new.payer_id is distinct from client_user
     or new.order_id is distinct from project_row.order_id
     or agreed_base is null
     or agreed_base is distinct from new.freelancer_service_vat_taxable_base
     or new.freelancer_service_vat_rate is distinct from 0.12
     or new.freelancer_service_vat_amount is distinct from round(agreed_base * 0.12, 2)
     or new.freelancer_service_vat_classification is distinct from 'default_vat'
     or new.freelancer_service_vat_document_id is not null
     or new.platform_service_fee is distinct from round(agreed_base * fee_rate, 2)
     or new.amount is distinct from round(agreed_base + new.freelancer_service_vat_amount + new.platform_service_fee, 2) then
    raise exception 'Payment total must match the agreement, VAT, and client plan fee';
  end if;
  return new;
end;
$$;
revoke all on function public.worksync_validate_payment_service_vat_snapshot()
  from public, anon, authenticated;

commit;
