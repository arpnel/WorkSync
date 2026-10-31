-- Manually applied
-- Let freelancers update an active application until the job is hired or closed.
-- Lock the job row while checking hiring state so edits cannot race a position fill.
create or replace function public.worksync_update_job_application(
  p_application uuid,
  p_proposal text,
  p_proposed_price numeric,
  p_estimated_days integer
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.job_applications;
  j public.jobs;
  freelancer uuid;
  target_job uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required' using errcode='42501';
  end if;

  select job_id into target_job
  from public.job_applications
  where application_id = p_application;
  if target_job is null then
    raise exception 'Application not found' using errcode='P0002';
  end if;

  select * into j
  from public.jobs
  where job_id = target_job
  for update;
  if j.job_id is null or j.status::text <> 'open' or coalesce(j.is_archived, false) then
    raise exception 'This position is no longer open' using errcode='22023';
  end if;

  select * into a
  from public.job_applications
  where application_id = p_application
  for update;
  if a.application_id is null or a.job_id <> target_job then
    raise exception 'Application not found' using errcode='P0002';
  end if;

  select freelancer_id into freelancer
  from public.freelancer_profiles
  where user_id = auth.uid();
  if freelancer is null or freelancer <> a.freelancer_id then
    raise exception 'Only the applicant may edit this proposal' using errcode='42501';
  end if;

  if exists (
    select 1
    from public.job_applications hired_application
    join public.contracts hired_contract
      on hired_contract.application_id = hired_application.application_id
    where hired_application.job_id = a.job_id
      and hired_contract.status::text in ('active', 'completed')
  ) then
    raise exception 'This position has already been taken' using errcode='22023';
  end if;

  if a.status is null or a.status::text not in ('pending', 'in_review', 'accepted') then
    raise exception 'This application can no longer be edited' using errcode='22023';
  end if;
  if coalesce(length(trim(p_proposal)), 0) not between 1 and 10000
     or p_proposed_price is null or p_proposed_price <= 0
     or p_proposed_price::text in ('NaN', 'Infinity', '-Infinity')
     or p_estimated_days is null or p_estimated_days < 1 then
    raise exception 'Enter a valid proposal, price and delivery time' using errcode='22023';
  end if;

  update public.job_applications
  set proposal = trim(p_proposal),
      proposed_price = p_proposed_price,
      estimated_days = p_estimated_days,
      screening_id = null,
      updated_at = now()
  where application_id = p_application;

  return p_application;
end;
$$;

revoke all on function public.worksync_update_job_application(uuid, text, numeric, integer)
  from public, anon;
grant execute on function public.worksync_update_job_application(uuid, text, numeric, integer)
  to authenticated;
