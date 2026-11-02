-- Reduce the Free plan to one job application per calendar month.
-- Premium users remain unlimited. Preserve the existing per-user advisory lock
-- so simultaneous application inserts cannot exceed the Free quota.
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
