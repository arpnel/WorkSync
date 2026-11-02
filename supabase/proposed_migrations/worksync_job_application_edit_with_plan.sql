-- PREPARED, NOT APPLIED.
-- Plan-aware replacement for worksync_update_job_application.
-- Apply only after confirming proposed_plan exists on job_applications and
-- the existing update RPC contract in the target database.
create or replace function public.worksync_update_job_application_with_plan(
  p_application uuid,
  p_proposal text,
  p_proposed_price numeric,
  p_estimated_days integer,
  p_proposed_plan jsonb
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
  col jsonb;
  task jsonb;
  col_count integer := 0;
  task_count integer := 0;
  done_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select job_id into target_job from public.job_applications where application_id = p_application;
  if target_job is null then raise exception 'Application not found' using errcode='P0002'; end if;
  select * into j from public.jobs where job_id = target_job for update;
  if j.job_id is null or j.status::text <> 'open' or coalesce(j.is_archived, false) then
    raise exception 'This position is no longer open' using errcode='22023';
  end if;
  select * into a from public.job_applications where application_id = p_application for update;
  if a.application_id is null or a.job_id <> target_job then raise exception 'Application not found' using errcode='P0002'; end if;
  select freelancer_id into freelancer from public.freelancer_profiles where user_id = auth.uid();
  if freelancer is null or freelancer <> a.freelancer_id then
    raise exception 'Only the applicant may edit this proposal' using errcode='42501';
  end if;
  if exists (
    select 1 from public.job_applications hired_application
    join public.contracts hired_contract on hired_contract.application_id = hired_application.application_id
    where hired_application.job_id = a.job_id and hired_contract.status::text in ('active', 'completed')
  ) then raise exception 'This position has already been taken' using errcode='22023'; end if;
  if a.status is null or a.status::text not in ('pending', 'in_review', 'accepted') then
    raise exception 'This application can no longer be edited' using errcode='22023';
  end if;
  if coalesce(length(trim(p_proposal)), 0) not between 1 and 10000
     or p_proposed_price is null or p_proposed_price <= 0 or p_proposed_price > 100000
     or p_proposed_price::text in ('NaN', 'Infinity', '-Infinity')
     or p_estimated_days is null or p_estimated_days < 1 then
    raise exception 'Enter a valid proposal, price and delivery time' using errcode='22023';
  end if;
  if p_proposed_plan is not null then
    if pg_catalog.jsonb_typeof(p_proposed_plan) <> 'object'
       or coalesce(length(btrim(p_proposed_plan->>'name')), 0) not between 1 and 120
       or length(coalesce(p_proposed_plan->>'description', '')) > 2000
       or pg_catalog.jsonb_typeof(p_proposed_plan->'content'->'columns') <> 'array'
       or pg_catalog.jsonb_array_length(p_proposed_plan->'content'->'columns') not between 1 and 20 then
      raise exception 'The proposed plan is invalid' using errcode='22023';
    end if;
    for col in select value from pg_catalog.jsonb_array_elements(p_proposed_plan->'content'->'columns') loop
      col_count := col_count + 1;
      if coalesce(length(col->>'id'), 0) not between 1 and 80
         or coalesce(length(btrim(col->>'name')), 0) not between 1 and 80
         or coalesce(col->>'type', '') not in ('stage', 'done')
         or pg_catalog.jsonb_typeof(col->'tasks') <> 'array'
         or pg_catalog.jsonb_array_length(col->'tasks') > 25 then
        raise exception 'The proposed plan has an invalid stage' using errcode='22023';
      end if;
      if col->>'type' = 'done' then
        done_count := done_count + 1;
        if done_count > 1 or col_count <> pg_catalog.jsonb_array_length(p_proposed_plan->'content'->'columns') then
          raise exception 'The Done stage must be unique and final' using errcode='22023';
        end if;
      end if;
      for task in select value from pg_catalog.jsonb_array_elements(col->'tasks') loop
        task_count := task_count + 1;
        if task_count > 120
           or coalesce(length(task->>'id'), 0) not between 1 and 80
           or coalesce(length(btrim(task->>'title')), 0) not between 1 and 160
           or length(coalesce(task->>'description', '')) > 1000
           or coalesce(task->>'priority', '') not in ('low', 'medium', 'high') then
          raise exception 'The proposed plan has an invalid task' using errcode='22023';
        end if;
      end loop;
    end loop;
  end if;
  update public.job_applications
  set proposal = trim(p_proposal), proposed_price = p_proposed_price,
      estimated_days = p_estimated_days, proposed_plan = p_proposed_plan,
      screening_id = null, updated_at = now()
  where application_id = p_application;
  return p_application;
end;
$$;

revoke all on function public.worksync_update_job_application_with_plan(uuid, text, numeric, integer, jsonb)
  from public, anon;
grant execute on function public.worksync_update_job_application_with_plan(uuid, text, numeric, integer, jsonb)
  to authenticated;
