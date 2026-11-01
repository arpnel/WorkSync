-- Persist task estimates and their local-time deadline when a freelancer
-- starts work. Progress is a one-way transition; review controls completion.

alter table public.project_tasks
  add column if not exists expected_days integer,
  add column if not exists deadline_at timestamptz;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_tasks'
      and column_name = 'expected_days' and data_type = 'integer'
  ) then
    raise exception 'public.project_tasks.expected_days must be an integer';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_tasks'
      and column_name = 'deadline_at' and data_type = 'timestamp with time zone'
  ) then
    raise exception 'public.project_tasks.deadline_at must be timestamptz';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.project_tasks'::regclass
      and conname = 'project_tasks_expected_days_check'
  ) then
    alter table public.project_tasks
      add constraint project_tasks_expected_days_check
      check (expected_days is null or expected_days between 1 and 3650);
  end if;
end;
$$;

create or replace function public.worksync_fill_project_task_estimate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.expected_days is null then
    select nullif(task.value->>'expectedDays', '')::integer
      into new.expected_days
    from public.projects p
    join public.contracts c on
      (c.order_id is not null and c.order_id = p.order_id) or
      (c.application_id is not null and c.application_id = p.application_id)
    join public.contract_versions v
      on v.contract_id = c.contract_id and v.version = new.source_version
    cross join lateral pg_catalog.jsonb_array_elements(
      v.snapshot->'terms'->'plan'->'content'->'columns'
    ) as column_data(value)
    cross join lateral pg_catalog.jsonb_array_elements(column_data.value->'tasks') as task(value)
    where p.project_id = new.project_id
      and task.value->>'id' = new.source_key
    limit 1;
  end if;
  return new;
end;
$$;

revoke all on function public.worksync_fill_project_task_estimate() from public, anon, authenticated, service_role;
drop trigger if exists worksync_fill_project_task_estimate_before_insert on public.project_tasks;
create trigger worksync_fill_project_task_estimate_before_insert
  before insert on public.project_tasks
  for each row execute function public.worksync_fill_project_task_estimate();

-- Existing task rows get the estimate from their immutable contract snapshot.
update public.project_tasks t
set expected_days = source.expected_days
from (
  select task_row.task_id,
    nullif(task.value->>'expectedDays', '')::integer as expected_days
  from public.project_tasks task_row
  join public.projects p on p.project_id = task_row.project_id
  join public.contracts c on
    (c.order_id is not null and c.order_id = p.order_id) or
    (c.application_id is not null and c.application_id = p.application_id)
  join public.contract_versions v
    on v.contract_id = c.contract_id and v.version = task_row.source_version
  cross join lateral pg_catalog.jsonb_array_elements(
    v.snapshot->'terms'->'plan'->'content'->'columns'
  ) as column_data(value)
  cross join lateral pg_catalog.jsonb_array_elements(column_data.value->'tasks') as task(value)
  where task.value->>'id' = task_row.source_key
) source
where t.task_id = source.task_id
  and source.expected_days is not null;

-- Older active contracts deliberately have no versioned task plan. When their
-- assigned freelancer starts a submitted-plan task, persist the application
-- plan server-side rather than accepting task content from the browser.
create or replace function public.worksync_seed_submitted_plan_tasks(p_project_id uuid)
returns setof public.project_tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.projects;
  c public.contracts;
  v public.contract_versions;
  plan_json jsonb;
  plan_application_id uuid;
  column_item jsonb;
  task_item jsonb;
  party text;
  stage_number integer := 0;
  task_number integer;
  task_total integer := 0;
  expected_days_value integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into p from public.projects where project_id = p_project_id for update;
  if p.project_id is null then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  party := public.worksync_project_party(p.project_id);
  if party is distinct from 'freelancer' then
    raise exception 'Only the assigned freelancer may initialize project tasks' using errcode = '42501';
  end if;
  if p.status::text not in ('active', 'in_progress') then
    raise exception 'Project tasks can only be initialized for an active project' using errcode = '22023';
  end if;

  select * into c
  from public.contracts
  where status::text = 'active'
    and ((p.application_id is not null and application_id = p.application_id)
      or (p.order_id is not null and order_id = p.order_id))
  order by created_at desc
  limit 1;
  if c.contract_id is null then
    raise exception 'The active project contract could not be found' using errcode = 'P0002';
  end if;
  select * into v from public.contract_versions
  where contract_id = c.contract_id and version = c.current_version;
  if v.contract_id is null or not v.legacy
    or coalesce(v.snapshot->'taskPlan', 'null'::jsonb) <> 'null'::jsonb then
    raise exception 'This project does not use a legacy submitted-plan board' using errcode = '22023';
  end if;
  plan_application_id := coalesce(
    c.application_id,
    p.application_id,
    (select so.application_id from public.service_orders so where so.order_id = c.order_id)
  );
  if plan_application_id is null then
    raise exception 'The submitted plan is unavailable for this project' using errcode = 'P0002';
  end if;
  select proposed_plan into plan_json from public.job_applications
  where application_id = plan_application_id;
  if plan_json is null or pg_catalog.jsonb_typeof(plan_json->'content'->'columns') <> 'array' then
    raise exception 'The freelancer submitted no valid task plan' using errcode = '22023';
  end if;

  for column_item in
    select value from pg_catalog.jsonb_array_elements(plan_json->'content'->'columns')
  loop
    stage_number := stage_number + 1;
    if column_item->>'type' = 'done' then continue; end if;
    if coalesce(length(column_item->>'id'), 0) not between 1 and 80
      or coalesce(length(btrim(column_item->>'name')), 0) not between 1 and 80
      or pg_catalog.jsonb_typeof(column_item->'tasks') <> 'array' then
      raise exception 'The submitted task plan has an invalid stage' using errcode = '22023';
    end if;
    task_number := 0;
    for task_item in select value from pg_catalog.jsonb_array_elements(column_item->'tasks') loop
      task_number := task_number + 1;
      task_total := task_total + 1;
      if task_total > 120
        or coalesce(length(task_item->>'id'), 0) not between 1 and 80
        or coalesce(length(btrim(task_item->>'title')), 0) not between 1 and 160
        or length(coalesce(task_item->>'description', '')) > 1000
        or coalesce(task_item->>'priority', '') not in ('low', 'medium', 'high') then
        raise exception 'The submitted task plan has an invalid task' using errcode = '22023';
      end if;
      expected_days_value := null;
      if task_item ? 'expectedDays' then
        if task_item->>'expectedDays' is null
          or (task_item->>'expectedDays') !~ '^[0-9]+$'
          or (task_item->>'expectedDays')::integer not between 1 and 3650 then
          raise exception 'The submitted task plan has an invalid duration' using errcode = '22023';
        end if;
        expected_days_value := (task_item->>'expectedDays')::integer;
      end if;

      insert into public.project_tasks(
        project_id, source_version, source_key, stage_id, stage_name,
        stage_order, title, description, priority, expected_days,
        status, display_order
      ) values (
        p.project_id, c.current_version,
        (column_item->>'id') || ':' || (task_item->>'id'),
        column_item->>'id', column_item->>'name', stage_number,
        btrim(task_item->>'title'), coalesce(task_item->>'description', ''),
        task_item->>'priority', expected_days_value, 'todo', task_number
      ) on conflict (project_id, source_version, source_key) do nothing;
    end loop;
  end loop;

  return query select t.* from public.project_tasks t
    where t.project_id = p.project_id and t.source_version = c.current_version
    order by t.stage_order, t.display_order, t.task_id;
end;
$$;
revoke all on function public.worksync_seed_submitted_plan_tasks(uuid) from public, anon;
grant execute on function public.worksync_seed_submitted_plan_tasks(uuid) to authenticated;

drop function if exists public.worksync_set_project_task_status(uuid, text, text);

create or replace function public.worksync_set_project_task_status(
  p_task_id uuid,
  p_status text,
  p_note text default null,
  p_timezone text default 'UTC'
)
returns public.project_tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.project_tasks;
  party text;
  deadline timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into t
  from public.project_tasks
  where task_id = p_task_id
  for update;
  if t.task_id is null then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  party := public.worksync_project_party(t.project_id);
  if party is distinct from 'freelancer' then
    raise exception 'Only the assigned freelancer may update task progress' using errcode = '42501';
  end if;
  if p_note is not null and length(p_note) > 5000 then
    raise exception 'Task note is too long' using errcode = '22023';
  end if;
  if t.status = 'in_progress' and p_status = 'in_progress' then
    return t;
  end if;
  if t.status <> 'todo' or p_status is distinct from 'in_progress' then
    raise exception 'Invalid task transition; progress can only move from To Do to In Progress' using errcode = '22023';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_timezone_names z where z.name = p_timezone
  ) then
    raise exception 'Invalid task deadline time zone' using errcode = '22023';
  end if;

  if t.expected_days is not null then
    deadline := (
      pg_catalog.now() at time zone p_timezone
      + pg_catalog.make_interval(days => t.expected_days)
    ) at time zone p_timezone;
  end if;

  update public.project_tasks
  set status = 'in_progress', deadline_at = deadline, updated_at = pg_catalog.now()
  where task_id = p_task_id
  returning * into t;

  insert into public.project_task_history(task_id, actor_id, from_status, to_status, note)
  values (t.task_id, auth.uid(), 'todo', 'in_progress', p_note);
  return t;
end;
$$;

revoke all on function public.worksync_set_project_task_status(uuid, text, text, text) from public, anon;
grant execute on function public.worksync_set_project_task_status(uuid, text, text, text) to authenticated;
