-- PREPARED, NOT APPLIED
-- Enforce the proposal ceiling in the database for direct RPC callers too.
create or replace function public.worksync_apply_for_job(
  p_job_id uuid,
  p_proposal text,
  p_proposed_price numeric,
  p_estimated_days integer
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  freelancer uuid;
  owner uuid;
  job_status text;
  result uuid;
begin
  select freelancer_id into freelancer
  from public.freelancer_profiles
  where user_id = auth.uid();

  select c.user_id, j.status::text into owner, job_status
  from public.jobs j
  join public.client_profiles c using (client_id)
  where j.job_id = p_job_id
  for update of j;

  if exists (
    select 1 from public.jobs where job_id = p_job_id and is_archived
  ) or not public.worksync_listing_visible('job', p_job_id) then
    raise exception 'This listing is unavailable';
  end if;

  if freelancer is null or owner is null or owner = auth.uid()
     or job_status <> 'open' then
    raise exception 'Only a freelancer may apply to an open job owned by another user';
  end if;

  if coalesce(length(trim(p_proposal)), 0) = 0 or length(p_proposal) > 10000
     or p_proposed_price is null or p_proposed_price <= 0 or p_proposed_price > 100000
     or p_proposed_price::text in ('NaN', 'Infinity', '-Infinity')
     or p_estimated_days is null or p_estimated_days < 1 then
    raise exception 'Proposal price must be greater than 0 and no more than PHP 100,000';
  end if;

  if exists (
    select 1 from public.job_applications
    where job_id = p_job_id and freelancer_id = freelancer
  ) then
    raise exception 'You have already applied to this job';
  end if;

  insert into public.job_applications(
    job_id, freelancer_id, proposal, proposed_price, estimated_days, status
  ) values (
    p_job_id, freelancer, p_proposal, p_proposed_price, p_estimated_days, 'pending'
  ) returning application_id into result;

  insert into public.notifications(
    user_id, type, title, message, related_id, is_read
  ) values (
    owner, 'job_application', 'New job application',
    'A freelancer applied to your job.', p_job_id, false
  );

  return result;
end;
$$;
