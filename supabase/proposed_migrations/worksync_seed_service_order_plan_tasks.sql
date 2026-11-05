-- PREPARED, NOT APPLIED.
-- Persist every task from the mutually approved direct service-order work plan.
-- These rows support freelancer task status, comments, and reference files only;
-- they are deliberately unlinked to milestones and do not affect payments.
-- Apply after worksync_service_order_work_plan_agreement.sql,
-- worksync_contract_workflow_replacement.sql, and
-- worksync_persist_forward_task_progress.sql.
begin;

create or replace function public.worksync_seed_service_order_plan_tasks(
  p_project_id uuid
)
returns setof public.project_tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_row public.projects;
  contract_row public.contracts;
  plan_json jsonb;
  column_item jsonb;
  task_item jsonb;
  stage_number integer := 0;
  task_number integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select p.* into project_row
  from public.projects p
  where p.project_id = p_project_id
  for update;
  if project_row.project_id is null then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if public.worksync_project_party(project_row.project_id) is distinct from 'freelancer' then
    raise exception 'Only the assigned freelancer may initialize project tasks' using errcode = '42501';
  end if;
  if project_row.status::text not in ('active', 'in_progress') then
    raise exception 'Project tasks can only be initialized for an active project' using errcode = '22023';
  end if;
  if project_row.order_id is null or project_row.application_id is not null then
    raise exception 'This is not a direct service-order project' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(project_row.project_id::text, 0)
  );

  select c.* into contract_row
  from public.contracts c
  where c.order_id = project_row.order_id
    and c.status::text = 'active'
    and c.client_signed_at is not null
    and c.freelancer_signed_at is not null
  order by c.created_at desc
  limit 1;
  if contract_row.contract_id is null then
    raise exception 'The signed active contract could not be found' using errcode = 'P0002';
  end if;

  select agreement.work_plan into plan_json
  from public.service_order_basic_terms_agreements agreement
  where agreement.order_id = project_row.order_id
    and agreement.client_work_plan_agreed_at is not null
    and agreement.freelancer_work_plan_agreed_at is not null;
  if plan_json is null then
    raise exception 'The mutually agreed service-order work plan is unavailable' using errcode = 'P0002';
  end if;
  perform public.worksync_validate_service_order_work_plan(plan_json);

  for column_item in
    select value
    from pg_catalog.jsonb_array_elements(plan_json #> '{content,columns}')
  loop
    stage_number := stage_number + 1;
    if column_item->>'type' = 'done' then
      continue;
    end if;
    task_number := 0;
    for task_item in
      select value
      from pg_catalog.jsonb_array_elements(column_item->'tasks')
    loop
      task_number := task_number + 1;
      insert into public.project_tasks (
        project_id, source_version, source_key, stage_id, stage_name,
        stage_order, title, description, priority, milestone_id,
        due_date, expected_days, status, display_order
      ) values (
        project_row.project_id,
        contract_row.current_version,
        task_item->>'id',
        column_item->>'id',
        column_item->>'name',
        stage_number,
        pg_catalog.btrim(task_item->>'title'),
        coalesce(task_item->>'description', ''),
        task_item->>'priority',
        null,
        nullif(task_item->>'dueDate', '')::date,
        case when task_item->>'expectedDays' ~ '^[0-9]+$'
          then (task_item->>'expectedDays')::integer else null end,
        'todo',
        task_number
      )
      on conflict (project_id, source_version, source_key) do nothing;
    end loop;
  end loop;

  return query
  select task.*
  from public.project_tasks task
  where task.project_id = project_row.project_id
    and task.source_version = contract_row.current_version
  order by task.stage_order, task.display_order, task.task_id;
end;
$$;

revoke all on function public.worksync_seed_service_order_plan_tasks(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.worksync_seed_service_order_plan_tasks(uuid)
  to authenticated;

notify pgrst, 'reload schema';
commit;
