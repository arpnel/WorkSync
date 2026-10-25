-- PREPARED ONLY: one-time Premium trial and manual monthly PayMongo renewals.
-- Apply after 202610130001, 202610240001, 202610240004, and 202610240005.
begin;

do $$
begin
  if to_regclass('public.subscription_plans') is null
     or to_regclass('public.user_subscriptions') is null
     or to_regclass('public.listing_submissions') is null then
    raise exception 'Apply the listing and subscription migrations first';
  end if;
  if exists(select 1 from public.subscription_plans where plan_code = 'pro_plus') then
    raise exception 'Apply the single-Premium migration before subscription billing';
  end if;
end;
$$;

alter table public.user_subscriptions
  add column if not exists trial_claimed_at timestamptz,
  add column if not exists access_type text not null default 'free';
alter table public.subscription_plans
  add column if not exists active_listing_limit integer not null default 3
    check (active_listing_limit > 0);
alter table public.user_subscriptions
  drop constraint if exists user_subscriptions_access_type_check;
alter table public.user_subscriptions
  add constraint user_subscriptions_access_type_check
  check (access_type in ('free','trial','paid'));
update public.user_subscriptions
set access_type = case when plan_code = 'pro' then 'paid' else 'free' end
where access_type = 'free' and plan_code = 'pro';
update public.subscription_plans
set provisional_monthly_price = 999.99,
    display_name = 'Premium',
    monthly_job_limit = 30,
    monthly_service_limit = 30,
    active_listing_limit = 20,
    active_job_limit = 20,
    active_service_limit = 20
where plan_code = 'pro';
update public.subscription_plans
set active_listing_limit = 3
where plan_code = 'free';

create table if not exists public.subscription_orders (
  order_id uuid primary key,
  user_id uuid not null references public."Users"(user_id) on delete cascade,
  amount numeric(10,2) not null check (amount = 999.99),
  status text not null default 'pending'
    check (status in ('pending','paid','failed','needs_review')),
  transaction_reference text unique,
  checkout_url text,
  provider_payment_id text unique,
  livemode boolean not null,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists subscription_orders_one_open_per_user
  on public.subscription_orders(user_id) where status in ('pending','needs_review');
alter table public.subscription_orders enable row level security;
revoke all on public.subscription_orders from anon, authenticated;
grant select, insert, update on public.subscription_orders to service_role;

create or replace function public.worksync_effective_subscription_plan(p_user uuid)
returns text language sql stable security definer set search_path='' as $$
  select case
    when s.plan_code = 'pro' and s.period_ends_at <= now() then 'free'
    else coalesce(s.plan_code, 'free')
  end
  from (select 1) seed
  left join public.user_subscriptions s on s.user_id = p_user;
$$;
revoke all on function public.worksync_effective_subscription_plan(uuid) from public, anon, authenticated;

create or replace function public.worksync_claim_premium_trial()
returns timestamptz language plpgsql security definer set search_path='' as $$
declare owner uuid := auth.uid(); row_data public.user_subscriptions%rowtype; expiry timestamptz;
begin
  if owner is null then raise exception 'Sign in to start your Premium trial' using errcode='42501'; end if;
  insert into public.user_subscriptions(user_id) values(owner) on conflict(user_id) do nothing;
  select * into row_data from public.user_subscriptions where user_id=owner for update;
  if row_data.trial_claimed_at is not null or row_data.access_type in ('trial','paid') then
    raise exception 'The Premium trial is only available once per account';
  end if;
  if row_data.plan_code='pro' and row_data.period_ends_at>now() then raise exception 'Premium is already active'; end if;
  expiry := now() + interval '3 months';
  update public.user_subscriptions
    set plan_code='pro', access_type='trial', trial_claimed_at=now(),
        period_started_at=now(), period_ends_at=expiry, updated_at=now()
    where user_id=owner;
  return expiry;
end; $$;
revoke all on function public.worksync_claim_premium_trial() from public, anon;
grant execute on function public.worksync_claim_premium_trial() to authenticated;

create or replace function public.worksync_confirm_subscription_payment(
  p_order uuid, p_session text, p_payment text, p_paid_at timestamptz
) returns boolean language plpgsql security definer set search_path='' as $$
declare order_data public.subscription_orders%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  select * into order_data from public.subscription_orders where order_id=p_order for update;
  if not found then return false; end if;
  if order_data.status='paid' then
    if order_data.transaction_reference is distinct from p_session
       or order_data.provider_payment_id is distinct from p_payment then
      raise exception 'Subscription payment reference mismatch';
    end if;
    return true;
  end if;
  if order_data.status <> 'pending' or order_data.transaction_reference is distinct from p_session then
    raise exception 'Subscription order is not payable';
  end if;
  update public.subscription_orders set status='paid', provider_payment_id=p_payment,
    paid_at=coalesce(p_paid_at,now()) where order_id=p_order;
  insert into public.user_subscriptions(user_id) values(order_data.user_id) on conflict(user_id) do nothing;
  update public.user_subscriptions set
    plan_code='pro', access_type='paid',
    period_started_at=case when plan_code='pro' and period_ends_at>now() then period_started_at else now() end,
    period_ends_at=greatest(
      now(),
      case when plan_code='pro' and period_ends_at>now() then period_ends_at else now() end
    ) + interval '1 month',
    updated_at=now()
  where user_id=order_data.user_id;
  return true;
end; $$;
revoke all on function public.worksync_confirm_subscription_payment(uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.worksync_confirm_subscription_payment(uuid,text,text,timestamptz) to service_role;

create or replace function public.worksync_capture_listing_submission()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid; plan text; monthly_cap integer; used bigint; duplicate_found boolean; kind text; listing_id uuid;
begin
 if tg_table_name='jobs' then
  kind:='job'; listing_id:=new.job_id;
  select user_id into owner from public.client_profiles where client_id=new.client_id;
 else
  kind:='service'; listing_id:=new.service_id;
  select user_id into owner from public.freelancer_profiles where freelancer_id=new.freelancer_id;
 end if;
 if owner is null then raise exception 'Complete the owner profile before posting'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
 insert into public.user_subscriptions(user_id) values(owner) on conflict(user_id) do nothing;
 plan := public.worksync_effective_subscription_plan(owner);
 select case when kind='job' then monthly_job_limit else monthly_service_limit end into monthly_cap from public.subscription_plans where plan_code=plan;
 select count(*) into used from public.listing_submissions where owner_id=owner and listing_type=kind and created_at>=date_trunc('month',now()) and created_at<date_trunc('month',now())+interval '1 month';
 if used>=monthly_cap then raise exception 'Monthly % submission limit reached for the % plan',kind,plan using errcode='P0001'; end if;
 select exists(select 1 from public.listing_submissions s where s.owner_id=owner and s.listing_type=kind and s.created_at>=now()-interval '30 days' and lower(regexp_replace(s.title||s.description,'[[:space:][:punct:]]','','g'))=lower(regexp_replace(new.title||new.description,'[[:space:][:punct:]]','','g'))) into duplicate_found;
 if duplicate_found then raise exception 'A substantially identical listing was submitted recently. Edit the existing listing or contact an administrator.' using errcode='P0001'; end if;
 insert into public.listing_submissions(listing_type,listing_id,owner_id,title,description,status)
 values(kind,listing_id,owner,new.title,new.description,'pending_review');
 return new;
end; $$;

create or replace function public.worksync_guard_listing_archive()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid; active_count bigint; active_cap integer; current_plan text; status_now text; target_listing_id uuid; listing_kind text;
begin
 if old.is_archived is not distinct from new.is_archived then return new; end if;
 if tg_table_name='jobs' then
  listing_kind:='job'; target_listing_id:=new.job_id;
  select user_id into owner from public.client_profiles where client_id=new.client_id;
 else
  listing_kind:='service'; target_listing_id:=new.service_id;
  select user_id into owner from public.freelancer_profiles where freelancer_id=new.freelancer_id;
 end if;
 if auth.uid() is distinct from owner and not public.worksync_is_admin() then raise exception 'Only the listing owner can archive or restore this listing'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
 select status into status_now from public.listing_submissions where listing_type=listing_kind and listing_id=target_listing_id for update;
 if status_now is distinct from 'approved' then raise exception 'Only approved listings can be archived or restored'; end if;
 if new.is_archived then
  if tg_table_name='jobs' then
   if exists(select 1 from public.job_applications a where a.job_id=target_listing_id and a.status::text='accepted') then raise exception 'Resolve accepted applications before archiving this job'; end if;
  else
   if exists(select 1 from public.service_orders o where o.service_id=target_listing_id and o.status::text in ('accepted','converted')) then raise exception 'Complete or resolve active service orders before archiving this service'; end if;
  end if;
  update public.listing_submissions set archived_at=now() where listing_type=listing_kind and listing_id=target_listing_id;
  insert into public.listing_moderation_events(submission_id,actor_id,actor_kind,action,explanation)
   select submission_id,auth.uid(),'system','archived','Owner archived the listing.' from public.listing_submissions where listing_type=listing_kind and listing_id=target_listing_id;
 else
  insert into public.user_subscriptions(user_id) values(owner) on conflict(user_id) do nothing;
  current_plan := public.worksync_effective_subscription_plan(owner);
  if current_plan='pro' then
   select active_listing_limit into active_cap from public.subscription_plans where plan_code=current_plan;
   select count(*) into active_count from (
    select j.job_id from public.jobs j join public.listing_submissions s on s.listing_type='job' and s.listing_id=j.job_id
     where s.owner_id=owner and s.status='approved' and s.archived_at is null and j.is_archived=false
    union all
    select v.service_id from public.services v join public.listing_submissions s on s.listing_type='service' and s.listing_id=v.service_id
     where s.owner_id=owner and s.status='approved' and s.archived_at is null and v.is_archived=false
   ) active_listings;
  elsif listing_kind='job' then
   select active_job_limit into active_cap from public.subscription_plans where plan_code=current_plan;
   select count(*) into active_count from public.jobs j join public.listing_submissions s on s.listing_type='job' and s.listing_id=j.job_id
    where s.owner_id=owner and s.status='approved' and s.archived_at is null and j.is_archived=false;
  else
   select active_service_limit into active_cap from public.subscription_plans where plan_code=current_plan;
   select count(*) into active_count from public.services v join public.listing_submissions s on s.listing_type='service' and s.listing_id=v.service_id
    where s.owner_id=owner and s.status='approved' and s.archived_at is null and v.is_archived=false;
  end if;
  if coalesce(active_count,0)>=coalesce(active_cap,0) then raise exception 'Active listing limit reached. Archive an active listing or change plans before restoring'; end if;
  update public.listing_submissions set archived_at=null where listing_type=listing_kind and listing_id=target_listing_id;
  insert into public.listing_moderation_events(submission_id,actor_id,actor_kind,action,explanation)
   select submission_id,auth.uid(),'system','restored','Owner restored the approved listing.' from public.listing_submissions where listing_type=listing_kind and listing_id=target_listing_id;
 end if;
 return new;
end; $$;

create or replace function public.worksync_admin_decide_listing(p_submission uuid,p_action text,p_category text,p_explanation text)
returns void language plpgsql security definer set search_path='' as $$
declare row_data public.listing_submissions%rowtype; cap integer; active_count bigint; plan text;
begin
 if not public.worksync_is_admin() then raise exception 'Administrator access required'; end if;
 if p_action not in ('approve','reject','flag') then raise exception 'Invalid moderation action'; end if;
 if p_action='reject' and (length(trim(coalesce(p_explanation,'')))<12 or length(trim(coalesce(p_category,'')))<2) then raise exception 'A rejection category and meaningful explanation are required'; end if;
 select * into row_data from public.listing_submissions where submission_id=p_submission for update;
 if not found then raise exception 'Submission not found'; end if;
 if row_data.status='editing' then raise exception 'The owner is editing this listing; review is not ready'; end if;
 if p_action='approve' then
  plan := public.worksync_effective_subscription_plan(row_data.owner_id);
  if plan='pro' then
   select active_listing_limit into cap from public.subscription_plans where plan_code=plan;
   select count(*) into active_count from (
    select j.job_id from public.listing_submissions s join public.jobs j on j.job_id=s.listing_id
     where s.owner_id=row_data.owner_id and s.listing_type='job' and s.status='approved' and s.archived_at is null and j.is_archived=false
    union all
    select v.service_id from public.listing_submissions s join public.services v on v.service_id=s.listing_id
     where s.owner_id=row_data.owner_id and s.listing_type='service' and s.status='approved' and s.archived_at is null and v.is_archived=false
   ) active_listings;
  elsif row_data.listing_type='job' then
   select active_job_limit into cap from public.subscription_plans where plan_code=plan;
   select count(*) into active_count from public.listing_submissions s join public.jobs j on j.job_id=s.listing_id
    where s.owner_id=row_data.owner_id and s.listing_type='job' and s.status='approved' and s.archived_at is null and j.is_archived=false;
  else
   select active_service_limit into cap from public.subscription_plans where plan_code=plan;
   select count(*) into active_count from public.listing_submissions s join public.services v on v.service_id=s.listing_id
    where s.owner_id=row_data.owner_id and s.listing_type='service' and s.status='approved' and s.archived_at is null and v.is_archived=false;
  end if;
  if coalesce(active_count,0)>=coalesce(cap,0) then raise exception 'Owner has reached the active listing limit'; end if;
 end if;
 update public.listing_submissions set
  status=case when p_action='approve' then 'approved' when p_action='reject' then 'rejected' else 'manual_review' end,
  decision='administrator_'||p_action,
  decision_category=case when p_action='approve' then null else nullif(trim(p_category),'') end,
  decision_reason=case when p_action='approve' then null else nullif(trim(p_explanation),'') end
 where submission_id=p_submission;
 insert into public.listing_moderation_events(submission_id,actor_id,actor_kind,action,category,explanation)
 values(p_submission,auth.uid(),'admin',p_action,nullif(trim(p_category),''),trim(coalesce(p_explanation,'')));
 if p_action in ('approve','reject') then
  insert into public.notifications(user_id,type,title,message,related_id,is_read)
  values(row_data.owner_id,'listing_moderation',case when p_action='approve' then 'Listing approved' else 'Listing rejected' end,
   case when p_action='approve' then '"'||row_data.title||'" was approved and is now eligible for marketplace display.'
   else '"'||row_data.title||'" was rejected ('||trim(p_category)||'): '||trim(p_explanation)||' You may edit and resubmit it or request an administrator review.' end,
   row_data.listing_id,false);
 end if;
end; $$;

commit;
