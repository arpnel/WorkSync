-- PREPARED, NOT APPLIED.
-- Align active job posting caps and enforce the Free/Premium project-fee snapshot.
-- Requires the listing/subscription plan schema, the effective-plan helper,
-- and the project VAT/payment snapshot schema.
begin;

do $$
begin
  if to_regclass('public.subscription_plans') is null
     or to_regclass('public.payments') is null
     or to_regclass('public.projects') is null
     or to_regclass('public.client_profiles') is null
     or to_regclass('public.contracts') is null
     or to_regclass('public.listing_submissions') is null
     or to_regclass('public.jobs') is null
     or to_regprocedure('public.worksync_effective_subscription_plan(uuid)') is null then
    raise exception 'Apply the subscription, listing, and payment prerequisites first';
  end if;
end;
$$;

-- Keep the generic usage-card value aligned with the job-specific approval and
-- restore limits enforced by worksync_admin_decide_listing and
-- worksync_guard_listing_archive. Service listing limits remain separate.
update public.subscription_plans
set active_job_limit = 1,
    active_listing_limit = 1
where plan_code = 'free';

update public.subscription_plans
set active_job_limit = 100,
    active_listing_limit = 100
where plan_code = 'pro';

-- Enforce the job cap at the row boundary. The owner lock makes concurrent
-- moderation approvals and archive restores serialize without replacing the
-- existing, live moderation RPC implementation.
create or replace function public.worksync_guard_active_job_posting_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan text;
  cap integer;
  active_count bigint;
begin
  if new.listing_type <> 'job'
     or new.status <> 'approved'
     or (tg_op = 'UPDATE'
       and old.status = 'approved'
       and old.archived_at is null
       and new.archived_at is null) then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.owner_id::text, 0)
  );
  plan := public.worksync_effective_subscription_plan(new.owner_id);
  select active_job_limit into cap
  from public.subscription_plans
  where plan_code = plan;

  select count(*) into active_count
  from public.listing_submissions s
  join public.jobs j on j.job_id = s.listing_id
  where s.owner_id = new.owner_id
    and s.listing_type = 'job'
    and s.status = 'approved'
    and s.archived_at is null
    and j.is_archived = false
    and s.submission_id <> new.submission_id;

  if coalesce(active_count, 0) >= coalesce(cap, 1) then
    raise exception 'Owner has reached the active job posting limit';
  end if;
  return new;
end;
$$;
revoke all on function public.worksync_guard_active_job_posting_limit()
  from public, anon, authenticated;
drop trigger if exists worksync_guard_active_job_posting_limit
  on public.listing_submissions;
create trigger worksync_guard_active_job_posting_limit
  before insert or update of status, archived_at on public.listing_submissions
  for each row execute function public.worksync_guard_active_job_posting_limit();
create or replace function public.worksync_validate_payment_service_vat_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
  from public.projects
  where project_id = new.project_id;
  if project_row.project_id is null then
    raise exception 'Project payment target is unavailable';
  end if;

  select user_id into client_user
  from public.client_profiles
  where client_id = project_row.client_id;
  if client_user is null then
    raise exception 'Project client is unavailable';
  end if;

  select final_price into agreed_base
  from public.contracts
  where (project_row.order_id is not null and order_id = project_row.order_id)
     or (project_row.application_id is not null and application_id = project_row.application_id)
  order by created_at desc
  limit 1;

  fee_rate := case
    when public.worksync_effective_subscription_plan(client_user) = 'pro' then 0.05
    else 0.10
  end;

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

drop trigger if exists worksync_validate_payment_service_vat_snapshot on public.payments;
create trigger worksync_validate_payment_service_vat_snapshot
  before insert on public.payments
  for each row execute function public.worksync_validate_payment_service_vat_snapshot();

commit;
