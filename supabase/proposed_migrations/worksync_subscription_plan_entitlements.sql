-- PREPARED, NOT APPLIED.
-- Enforce subscription limits at the database boundary. Free users may save
-- one project draft, submit one job application every three months, and send
-- one direct Hiring Request every three months. Premium is unlimited for those
-- features. Requires the plan, project-plan, application, and service-order
-- schema plus worksync_effective_subscription_plan.
begin;

do $$
begin
  if to_regclass('public.user_subscriptions') is null
     or to_regclass('public.subscription_plans') is null
     or to_regclass('public.project_plans') is null
     or to_regclass('public.job_applications') is null
     or to_regclass('public.freelancer_profiles') is null
     or to_regclass('public.client_profiles') is null
     or to_regclass('public.service_orders') is null
     or to_regprocedure('public.worksync_effective_subscription_plan(uuid)') is null then
    raise exception 'Apply the subscription, project-plan, application, and service-order migrations first';
  end if;
end;
$$;

create or replace function public.worksync_enforce_project_draft_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare plan text; draft_count integer;
begin
  if new.owner_id is null then raise exception 'A plan owner is required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.owner_id::text, 0));
  plan := public.worksync_effective_subscription_plan(new.owner_id);
  if plan = 'pro' then return new; end if;
  select count(*) into draft_count from public.project_plans where owner_id = new.owner_id;
  if draft_count >= 1 then
    raise exception 'The Free plan includes one project draft. Upgrade to Premium for unlimited drafts.' using errcode='P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.worksync_enforce_project_draft_limit() from public, anon, authenticated;
drop trigger if exists worksync_enforce_project_draft_limit on public.project_plans;
create trigger worksync_enforce_project_draft_limit
  before insert on public.project_plans
  for each row execute function public.worksync_enforce_project_draft_limit();

create or replace function public.worksync_enforce_monthly_job_application_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare applicant uuid; plan text; used integer;
begin
  select user_id into applicant from public.freelancer_profiles
  where freelancer_id = new.freelancer_id;
  if applicant is null then raise exception 'A freelancer profile is required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(applicant::text, 0));
  plan := public.worksync_effective_subscription_plan(applicant);
  if plan = 'pro' then return new; end if;
  select count(*) into used
  from public.job_applications a
  join public.freelancer_profiles f using (freelancer_id)
  where f.user_id = applicant
    and a.created_at > now() - interval '3 months'
    and a.created_at <= now();
  if used >= 1 then
    raise exception 'The Free plan allows one job application every 3 months. Upgrade to Premium for unlimited applications.' using errcode='P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.worksync_enforce_monthly_job_application_limit() from public, anon, authenticated;
drop trigger if exists worksync_enforce_monthly_job_application_limit on public.job_applications;
create trigger worksync_enforce_monthly_job_application_limit
  before insert on public.job_applications
  for each row execute function public.worksync_enforce_monthly_job_application_limit();
create index if not exists job_applications_freelancer_created_at
  on public.job_applications(freelancer_id, created_at desc);

create or replace function public.worksync_enforce_client_hiring_request_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare requester uuid; plan text; used integer;
begin
  if new.service_id is null then return new; end if;
  select user_id into requester from public.client_profiles
  where client_id = new.client_id;
  if requester is null then raise exception 'A client profile is required'; end if;
  if auth.uid() is distinct from requester then
    raise exception 'The Hiring Request client does not match the signed-in account' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(requester::text, 0));
  plan := public.worksync_effective_subscription_plan(requester);
  if plan = 'pro' then return new; end if;
  select count(*) into used
  from public.service_orders
  where client_id = new.client_id
    and service_id is not null
    and created_at > now() - interval '3 months'
    and created_at <= now();
  if used >= 1 then
    raise exception 'The Free plan allows one Hiring Request to a freelancer every 3 months. Upgrade to Premium for unlimited Hiring Requests.' using errcode='P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.worksync_enforce_client_hiring_request_limit() from public, anon, authenticated;
drop trigger if exists worksync_enforce_client_hiring_request_limit on public.service_orders;
create trigger worksync_enforce_client_hiring_request_limit
  before insert on public.service_orders
  for each row execute function public.worksync_enforce_client_hiring_request_limit();
create index if not exists service_orders_client_service_created_at
  on public.service_orders(client_id, created_at desc)
  where service_id is not null;

commit;
