-- PREPARED, NOT APPLIED.
-- Shared planner snapshots and approvals for service orders without a job
-- application. Apply after worksync_service_order_basic_terms_agreement.sql.

begin;

alter table public.service_order_basic_terms_agreements
  add column if not exists work_plan jsonb,
  add column if not exists previous_work_plan jsonb,
  add column if not exists work_plan_changed_by text
    check (work_plan_changed_by in ('client', 'freelancer')),
  add column if not exists client_work_plan_agreed_at timestamptz,
  add column if not exists freelancer_work_plan_agreed_at timestamptz;

create or replace function public.worksync_reset_service_order_work_plan_on_terms_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.terms is distinct from old.terms then
    new.previous_work_plan := old.work_plan;
    new.work_plan_changed_by := new.changed_by;
    new.client_work_plan_agreed_at := null;
    new.freelancer_work_plan_agreed_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.worksync_reset_service_order_work_plan_on_terms_change()
  from public, anon, authenticated, service_role;
drop trigger if exists worksync_reset_service_order_work_plan_after_terms_change
  on public.service_order_basic_terms_agreements;
create trigger worksync_reset_service_order_work_plan_after_terms_change
  before update of terms on public.service_order_basic_terms_agreements
  for each row execute function public.worksync_reset_service_order_work_plan_on_terms_change();

create or replace function public.worksync_validate_service_order_work_plan(p_plan jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  column_item record;
  task_item record;
  column_count integer;
  task_count integer := 0;
  done_count integer := 0;
  column_ids text[] := '{}';
  task_ids text[] := '{}';
  parsed_task_due date;
begin
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
end;
$$;
revoke all on function public.worksync_validate_service_order_work_plan(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.worksync_get_service_order_work_plan_agreement(p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user uuid := auth.uid();
  client_user uuid;
  freelancer_user uuid;
  agreement_row public.service_order_basic_terms_agreements;
begin
  if requesting_user is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  select cp.user_id, fp.user_id into client_user, freelancer_user
  from public.service_orders as o
  join public.client_profiles as cp on cp.client_id = o.client_id
  join public.freelancer_profiles as fp on fp.freelancer_id = o.freelancer_id
  where o.order_id = p_order;

  if requesting_user is distinct from client_user
     and requesting_user is distinct from freelancer_user then
    raise exception 'Service order unavailable' using errcode = '42501';
  end if;

  select * into agreement_row
  from public.service_order_basic_terms_agreements
  where order_id = p_order;

  return pg_catalog.jsonb_build_object(
    'plan', agreement_row.work_plan,
    'previousPlan', agreement_row.previous_work_plan,
    'changedBy', agreement_row.work_plan_changed_by,
    'clientAgreed', agreement_row.client_work_plan_agreed_at is not null,
    'freelancerAgreed', agreement_row.freelancer_work_plan_agreed_at is not null,
    'hasPlanAgreement', agreement_row.work_plan is not null
  );
end;
$$;

create or replace function public.worksync_agree_service_order_work_plan(
  p_order uuid,
  p_plan jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user uuid := auth.uid();
  order_status text;
  contract_status text;
  client_user uuid;
  freelancer_user uuid;
  current_party text;
  agreement_row public.service_order_basic_terms_agreements;
begin
  if requesting_user is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  perform public.worksync_validate_service_order_work_plan(p_plan);

  -- Match the lock order used by service-order basic-term approval.
  select c.status::text into contract_status
  from public.contracts as c
  where c.order_id = p_order
  for update;

  select o.status::text, cp.user_id, fp.user_id
    into order_status, client_user, freelancer_user
  from public.service_orders as o
  join public.client_profiles as cp on cp.client_id = o.client_id
  join public.freelancer_profiles as fp on fp.freelancer_id = o.freelancer_id
  where o.order_id = p_order
  for update of o;

  if order_status not in ('pending', 'accepted', 'converted')
     or contract_status is null
     or contract_status in ('active', 'completed', 'cancelled', 'rejected')
     or (requesting_user is distinct from client_user
         and requesting_user is distinct from freelancer_user) then
    raise exception 'Service order unavailable for work-plan approval' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.contracts as c
    where c.order_id = p_order
      and (c.client_signed_at is not null or c.freelancer_signed_at is not null)
  ) then
    raise exception 'The work plan cannot be changed after final contract signing begins' using errcode = '55000';
  end if;

  current_party := case when requesting_user = client_user then 'client' else 'freelancer' end;
  select * into agreement_row
  from public.service_order_basic_terms_agreements
  where order_id = p_order
  for update;
  if agreement_row.order_id is null
     or agreement_row.terms is null
     or agreement_row.client_agreed_at is null
     or agreement_row.freelancer_agreed_at is null then
    raise exception 'Both participants must agree to the basic terms before approving the work plan' using errcode = '22023';
  end if;

  if agreement_row.work_plan is distinct from p_plan then
    update public.service_order_basic_terms_agreements
    set previous_work_plan = agreement_row.work_plan,
        work_plan = p_plan,
        work_plan_changed_by = current_party,
        client_work_plan_agreed_at = case when current_party = 'client' then pg_catalog.clock_timestamp() end,
        freelancer_work_plan_agreed_at = case when current_party = 'freelancer' then pg_catalog.clock_timestamp() end,
        updated_at = pg_catalog.clock_timestamp()
    where order_id = p_order;
  else
    update public.service_order_basic_terms_agreements
    set client_work_plan_agreed_at = case
          when current_party = 'client' then coalesce(client_work_plan_agreed_at, pg_catalog.clock_timestamp())
          else client_work_plan_agreed_at end,
        freelancer_work_plan_agreed_at = case
          when current_party = 'freelancer' then coalesce(freelancer_work_plan_agreed_at, pg_catalog.clock_timestamp())
          else freelancer_work_plan_agreed_at end,
        updated_at = pg_catalog.clock_timestamp()
    where order_id = p_order;
  end if;

  return public.worksync_get_service_order_work_plan_agreement(p_order);
end;
$$;

create or replace function public.worksync_require_agreed_service_order_work_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  related_application uuid;
  agreement_row public.service_order_basic_terms_agreements;
begin
  if new.order_id is null then return new; end if;
  related_application := coalesce(
    new.application_id,
    (select o.application_id from public.service_orders as o where o.order_id = new.order_id)
  );
  if related_application is not null then return new; end if;

  select * into agreement_row
  from public.service_order_basic_terms_agreements as a
  where a.order_id = new.order_id;
  if agreement_row.terms is null
     or agreement_row.client_agreed_at is null
     or agreement_row.freelancer_agreed_at is null
     or agreement_row.work_plan is null
     or agreement_row.client_work_plan_agreed_at is null
     or agreement_row.freelancer_work_plan_agreed_at is null then
    raise exception 'Both participants must agree to the work plan before creating or changing a contract version'
      using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.worksync_require_agreed_service_order_work_plan()
  from public, anon, authenticated, service_role;
drop trigger if exists worksync_require_agreed_service_order_work_plan on public.contracts;
create trigger worksync_require_agreed_service_order_work_plan
  before update of current_version, order_id, application_id
  on public.contracts
  for each row execute function public.worksync_require_agreed_service_order_work_plan();

revoke all on function public.worksync_get_service_order_work_plan_agreement(uuid) from public, anon;
revoke all on function public.worksync_agree_service_order_work_plan(uuid, jsonb) from public, anon;
grant execute on function public.worksync_get_service_order_work_plan_agreement(uuid) to authenticated;
grant execute on function public.worksync_agree_service_order_work_plan(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
