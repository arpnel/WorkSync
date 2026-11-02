-- PREPARED, NOT APPLIED.
-- Enforce plan limits at the database boundary: Free has one active project,
-- Premium has up to 20. Drafts, applications, and assessments retain their
-- existing Premium allowances. Requires the project-plan, subscription,
-- application, project, and skill-assessment tables and
-- worksync_effective_subscription_plan.
begin;

do $$
begin
  if to_regclass('public.user_subscriptions') is null
     or to_regclass('public.subscription_plans') is null
     or to_regclass('public.project_plans') is null
     or to_regclass('public.job_applications') is null
     or to_regclass('public.projects') is null
     or to_regclass('public.skill_assessment_attempts') is null then
    raise exception 'Apply the subscription, plans, projects, application, and skill-assessment migrations first';
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
    and a.created_at >= date_trunc('month', now())
    and a.created_at < date_trunc('month', now()) + interval '1 month';
  if used >= 1 then
    raise exception 'The Free plan allows one job application per month. Upgrade to Premium to apply without a monthly limit.' using errcode='P0001';
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

create or replace function public.worksync_enforce_freelancer_active_project_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare freelancer_user uuid; plan text; active_count integer; project_limit integer;
begin
  if new.status::text not in ('active', 'revision', 'in_progress') then return new; end if;
  select user_id into freelancer_user from public.freelancer_profiles
  where freelancer_id = new.freelancer_id;
  if freelancer_user is null then raise exception 'A freelancer profile is required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(freelancer_user::text, 0));
  plan := public.worksync_effective_subscription_plan(freelancer_user);
  project_limit := case when plan = 'pro' then 20 else 1 end;
  select count(*) into active_count
  from public.projects
  where freelancer_id = new.freelancer_id
    and status::text in ('active', 'revision', 'in_progress')
    and (new.project_id is null or project_id <> new.project_id);
  if active_count >= project_limit then
    if plan = 'pro' then
      raise exception 'The Premium plan allows up to 20 active projects at a time. Complete or close an active project before starting another.' using errcode='P0001';
    end if;
    raise exception 'The Free plan allows one active project at a time. Upgrade to Premium for up to 20 active projects.' using errcode='P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.worksync_enforce_freelancer_active_project_limit() from public, anon, authenticated;
drop trigger if exists worksync_enforce_freelancer_project_cadence on public.projects;
drop trigger if exists worksync_enforce_freelancer_active_project_limit on public.projects;
create trigger worksync_enforce_freelancer_active_project_limit
  before insert or update on public.projects
  for each row execute function public.worksync_enforce_freelancer_active_project_limit();
create index if not exists projects_freelancer_created_at
  on public.projects(freelancer_id, created_at desc);

create or replace function public.worksync_enforce_skill_assessment_cadence()
returns trigger language plpgsql security definer set search_path = '' as $$
declare plan text; used integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 0));
  plan := public.worksync_effective_subscription_plan(new.user_id);
  if plan = 'pro' then return new; end if;
  select count(*) into used
  from public.skill_assessment_attempts
  where user_id = new.user_id
    and started_at >= now() - interval '6 months';
  if used >= 1 then
    raise exception 'The Free plan includes one AI skills gap assessment every six months. Upgrade to Premium for unlimited assessments.' using errcode='P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.worksync_enforce_skill_assessment_cadence() from public, anon, authenticated;
drop trigger if exists worksync_enforce_skill_assessment_cadence on public.skill_assessment_attempts;
create trigger worksync_enforce_skill_assessment_cadence
  before insert on public.skill_assessment_attempts
  for each row execute function public.worksync_enforce_skill_assessment_cadence();
create index if not exists skill_assessment_attempts_user_started_at
  on public.skill_assessment_attempts(user_id, started_at desc);

commit;
