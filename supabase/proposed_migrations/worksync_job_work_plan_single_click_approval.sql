-- PREPARED, NOT APPLIED.
-- When a participant saves a changed job work plan, record that participant's
-- approval in the same RPC call. The other participant remains pending.
begin;

create or replace function public.worksync_agree_job_work_plan(
  p_application uuid,
  p_plan jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user uuid := auth.uid();
  application_status text;
  client_user uuid;
  freelancer_user uuid;
  submitted_plan jsonb;
  current_party text;
  agreement_row public.job_basic_terms_agreements;
  column_item record;
  task_item record;
  column_count integer;
  task_count integer := 0;
  done_count integer := 0;
  column_ids text[] := '{}';
  task_ids text[] := '{}';
  baseline_plan jsonb;
  plan_changed boolean;
  parsed_task_due date;
begin
  if requesting_user is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if p_plan is null
     or pg_catalog.jsonb_typeof(p_plan) is distinct from 'object'
     or pg_catalog.octet_length(p_plan::text) > 262144
     or pg_catalog.jsonb_typeof(p_plan->'name') is distinct from 'string'
     or pg_catalog.length(pg_catalog.btrim(p_plan->>'name')) not between 1 and 120
     or pg_catalog.jsonb_typeof(p_plan->'description') is distinct from 'string'
     or pg_catalog.length(p_plan->>'description') > 2000
     or pg_catalog.jsonb_typeof(p_plan->'content') is distinct from 'object'
     or pg_catalog.jsonb_typeof(p_plan #> '{content,columns}') is distinct from 'array' then
    raise exception 'Invalid work plan' using errcode = '22023';
  end if;
  column_count := pg_catalog.jsonb_array_length(p_plan #> '{content,columns}');
  if column_count not between 1 and 20 then
    raise exception 'A work plan must have between 1 and 20 stages' using errcode = '22023';
  end if;

  for column_item in
    select value, ordinal
    from pg_catalog.jsonb_array_elements(p_plan #> '{content,columns}')
      with ordinality as plan_columns(value, ordinal)
  loop
    if pg_catalog.jsonb_typeof(column_item.value) is distinct from 'object'
       or pg_catalog.jsonb_typeof(column_item.value->'id') is distinct from 'string'
       or pg_catalog.length(pg_catalog.btrim(column_item.value->>'id')) not between 1 and 80
       or column_item.value->>'id' = any(column_ids)
       or pg_catalog.jsonb_typeof(column_item.value->'name') is distinct from 'string'
       or pg_catalog.length(pg_catalog.btrim(column_item.value->>'name')) not between 1 and 80
       or pg_catalog.jsonb_typeof(column_item.value->'type') is distinct from 'string'
       or column_item.value->>'type' not in ('stage', 'done')
       or pg_catalog.jsonb_typeof(column_item.value->'tasks') is distinct from 'array'
       or pg_catalog.jsonb_array_length(column_item.value->'tasks') > 25 then
      raise exception 'Work plan stage % has invalid details', column_item.ordinal using errcode = '22023';
    end if;
    column_ids := pg_catalog.array_append(column_ids, column_item.value->>'id');
    if column_item.value->>'type' = 'done' then
      done_count := done_count + 1;
      if column_item.ordinal <> column_count then
        raise exception 'The Done stage must be last' using errcode = '22023';
      end if;
    end if;

    for task_item in
      select value
      from pg_catalog.jsonb_array_elements(column_item.value->'tasks') as stage_tasks(value)
    loop
      task_count := task_count + 1;
      if task_count > 120
         or pg_catalog.jsonb_typeof(task_item.value) is distinct from 'object'
         or pg_catalog.jsonb_typeof(task_item.value->'id') is distinct from 'string'
         or pg_catalog.length(pg_catalog.btrim(task_item.value->>'id')) not between 1 and 80
         or task_item.value->>'id' = any(task_ids)
         or pg_catalog.jsonb_typeof(task_item.value->'title') is distinct from 'string'
         or pg_catalog.length(pg_catalog.btrim(task_item.value->>'title')) not between 1 and 160
         or pg_catalog.jsonb_typeof(task_item.value->'description') is distinct from 'string'
         or pg_catalog.length(task_item.value->>'description') > 1000
         or pg_catalog.jsonb_typeof(task_item.value->'priority') is distinct from 'string'
         or task_item.value->>'priority' not in ('low', 'medium', 'high') then
        raise exception 'Work plan stage % contains an invalid task', column_item.ordinal using errcode = '22023';
      end if;
      if task_item.value ? 'expectedDays'
         and task_item.value->'expectedDays' <> 'null'::jsonb
         and (pg_catalog.jsonb_typeof(task_item.value->'expectedDays') is distinct from 'number'
           or (task_item.value->>'expectedDays')::numeric <> pg_catalog.trunc((task_item.value->>'expectedDays')::numeric)
           or (task_item.value->>'expectedDays')::numeric not between 1 and 3650) then
        raise exception 'Task estimates must be whole days from 1 to 3650' using errcode = '22023';
      end if;
      if task_item.value ? 'dueDate'
         and task_item.value->'dueDate' <> 'null'::jsonb
         and (pg_catalog.jsonb_typeof(task_item.value->'dueDate') is distinct from 'string'
           or task_item.value->>'dueDate' !~ '^\d{4}-\d{2}-\d{2}$') then
        raise exception 'Task due dates must use YYYY-MM-DD' using errcode = '22023';
      end if;
      if task_item.value ? 'dueDate' and task_item.value->'dueDate' <> 'null'::jsonb then
        begin
          parsed_task_due := (task_item.value->>'dueDate')::date;
        exception when others then
          raise exception 'Task due dates must be valid calendar dates' using errcode = '22023';
        end;
      end if;
      if task_item.value ? 'milestoneId'
         and task_item.value->'milestoneId' <> 'null'::jsonb
         and (pg_catalog.jsonb_typeof(task_item.value->'milestoneId') is distinct from 'string'
           or pg_catalog.length(task_item.value->>'milestoneId') > 80) then
        raise exception 'Task milestone assignments are invalid' using errcode = '22023';
      end if;
      task_ids := pg_catalog.array_append(task_ids, task_item.value->>'id');
    end loop;
  end loop;

  if done_count > 1 then
    raise exception 'A work plan can have only one Done stage' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_application::text, 0));
  select a.status::text, cp.user_id, fp.user_id, a.proposed_plan
    into application_status, client_user, freelancer_user, submitted_plan
  from public.job_applications as a
  join public.jobs as j on j.job_id = a.job_id
  join public.client_profiles as cp on cp.client_id = j.client_id
  join public.freelancer_profiles as fp on fp.freelancer_id = a.freelancer_id
  where a.application_id = p_application
  for update of a;

  if application_status is distinct from 'accepted'
     or requesting_user not in (client_user, freelancer_user) then
    raise exception 'Application unavailable' using errcode = '42501';
  end if;
  current_party := case when requesting_user = client_user then 'client' else 'freelancer' end;

  select * into agreement_row
  from public.job_basic_terms_agreements
  where application_id = p_application
  for update;
  if agreement_row.application_id is null
     or agreement_row.terms is null
     or agreement_row.client_agreed_at is null
     or agreement_row.freelancer_agreed_at is null then
    raise exception 'Agree to the basic contract details before planning the work' using errcode = '22023';
  end if;

  baseline_plan := coalesce(agreement_row.work_plan, submitted_plan);
  plan_changed := baseline_plan is distinct from p_plan;
  if plan_changed then
    update public.job_basic_terms_agreements
    set previous_work_plan = baseline_plan,
        work_plan = p_plan,
        work_plan_changed_by = current_party,
        client_work_plan_agreed_at = case
          when current_party = 'client' then pg_catalog.clock_timestamp() end,
        freelancer_work_plan_agreed_at = case
          when current_party = 'freelancer' then pg_catalog.clock_timestamp() end,
        updated_at = pg_catalog.clock_timestamp()
    where application_id = p_application;
  else
    update public.job_basic_terms_agreements
    set work_plan = p_plan,
        client_work_plan_agreed_at = case
          when current_party = 'client' then coalesce(client_work_plan_agreed_at, pg_catalog.clock_timestamp())
          else client_work_plan_agreed_at end,
        freelancer_work_plan_agreed_at = case
          when current_party = 'freelancer' then coalesce(freelancer_work_plan_agreed_at, pg_catalog.clock_timestamp())
          else freelancer_work_plan_agreed_at end,
        updated_at = pg_catalog.clock_timestamp()
    where application_id = p_application;
  end if;

  return public.worksync_get_job_work_plan_agreement(p_application);
end;
$$;

notify pgrst, 'reload schema';
commit;
