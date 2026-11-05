-- PREPARED, NOT APPLIED.
-- Persist a shared milestone schedule for milestone service orders without an
-- application ID. Apply the basic-terms and work-plan migrations first.
begin;

alter table public.service_order_basic_terms_agreements
  add column if not exists milestone_plan jsonb,
  add column if not exists previous_milestone_plan jsonb,
  add column if not exists milestone_changed_by text
    check (milestone_changed_by in ('client', 'freelancer')),
  add column if not exists client_milestone_agreed_at timestamptz,
  add column if not exists freelancer_milestone_agreed_at timestamptz;

create or replace function public.worksync_reset_service_order_milestone_plan()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.terms is distinct from old.terms
     or new.work_plan is distinct from old.work_plan then
    new.previous_milestone_plan := old.milestone_plan;
    new.milestone_changed_by := case
      when new.terms is distinct from old.terms then new.changed_by
      else new.work_plan_changed_by
    end;
    new.milestone_plan := null;
    new.client_milestone_agreed_at := null;
    new.freelancer_milestone_agreed_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.worksync_reset_service_order_milestone_plan()
  from public, anon, authenticated, service_role;
drop trigger if exists worksync_reset_service_order_milestone_plan
  on public.service_order_basic_terms_agreements;
create trigger worksync_reset_service_order_milestone_plan
  before update of terms, work_plan
  on public.service_order_basic_terms_agreements
  for each row execute function public.worksync_reset_service_order_milestone_plan();

create or replace function public.worksync_get_service_order_milestone_plan_agreement(p_order uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  requester uuid := auth.uid();
  client_user uuid;
  freelancer_user uuid;
  is_milestone boolean;
  agreement_row public.service_order_basic_terms_agreements;
begin
  if requester is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select cp.user_id, fp.user_id, s.service_type::text = 'milestone'
    into client_user, freelancer_user, is_milestone
  from public.service_orders as o
  join public.services as s on s.service_id = o.service_id
  join public.client_profiles as cp on cp.client_id = o.client_id
  join public.freelancer_profiles as fp on fp.freelancer_id = o.freelancer_id
  where o.order_id = p_order and o.application_id is null;
  if is_milestone is distinct from true
     or requester not in (client_user, freelancer_user) then
    raise exception 'Milestone service order unavailable' using errcode = '42501';
  end if;
  select * into agreement_row
  from public.service_order_basic_terms_agreements as agreement
  where agreement.order_id = p_order;
  return jsonb_build_object(
    'milestones', coalesce(agreement_row.milestone_plan, '[]'::jsonb),
    'previousMilestones', coalesce(agreement_row.previous_milestone_plan, '[]'::jsonb),
    'changedBy', agreement_row.milestone_changed_by,
    'clientAgreed', agreement_row.client_milestone_agreed_at is not null,
    'freelancerAgreed', agreement_row.freelancer_milestone_agreed_at is not null
  );
end;
$$;

create or replace function public.worksync_agree_service_order_milestone_plan(
  p_order uuid,
  p_milestones jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  requester uuid := auth.uid();
  client_user uuid;
  freelancer_user uuid;
  service_type text;
  order_status text;
  contract_status text;
  current_party text;
  agreement_row public.service_order_basic_terms_agreements;
  normalized_plan jsonb;
  plan_total numeric := 0;
  plan_budget numeric;
  plan_start date;
  plan_deadline date;
  item jsonb;
  task_item jsonb;
  task_key text;
  task_keys text[] := '{}';
  item_count integer := 0;
  item_due date;
begin
  if requester is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select o.status::text, s.service_type::text, cp.user_id, fp.user_id
    into order_status, service_type, client_user, freelancer_user
  from public.service_orders as o
  join public.services as s on s.service_id = o.service_id
  join public.client_profiles as cp on cp.client_id = o.client_id
  join public.freelancer_profiles as fp on fp.freelancer_id = o.freelancer_id
  where o.order_id = p_order and o.application_id is null
  for update of o;
  select c.status::text into contract_status
  from public.contracts as c where c.order_id = p_order for update;
  if service_type is distinct from 'milestone'
     or order_status not in ('pending', 'accepted', 'converted')
     or contract_status is null
     or contract_status in ('active', 'completed', 'cancelled', 'rejected')
     or requester not in (client_user, freelancer_user) then
    raise exception 'Milestone service order unavailable for agreement' using errcode = '42501';
  end if;
  if jsonb_typeof(p_milestones) is distinct from 'array'
     or jsonb_array_length(p_milestones) not between 1 and 30 then
    raise exception 'Add between 1 and 30 milestones' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_order::text, 0));
  select * into agreement_row
  from public.service_order_basic_terms_agreements as agreement
  where agreement.order_id = p_order for update;
  if agreement_row.order_id is null or agreement_row.terms is null
     or agreement_row.client_agreed_at is null or agreement_row.freelancer_agreed_at is null then
    raise exception 'Agree to the basic contract details before planning milestones' using errcode = '22023';
  end if;
  if agreement_row.work_plan is null
     or agreement_row.client_work_plan_agreed_at is null
     or agreement_row.freelancer_work_plan_agreed_at is null then
    raise exception 'Both participants must agree to the work plan before planning milestones' using errcode = '22023';
  end if;
  begin
    plan_budget := (agreement_row.terms->>'budget')::numeric;
    plan_start := (agreement_row.terms->>'startDate')::date;
    plan_deadline := (agreement_row.terms->>'deadline')::date;
  exception when others then
    raise exception 'Saved contract details are invalid' using errcode = '22023';
  end;
  for item in select value from jsonb_array_elements(p_milestones) loop
    item_count := item_count + 1;
    if jsonb_typeof(item) is distinct from 'object'
       or coalesce(length(btrim(item->>'id')), 0) not between 1 and 80
       or coalesce(length(btrim(item->>'title')), 0) not between 1 and 200
       or length(coalesce(item->>'description', '')) > 5000
       or jsonb_typeof(item->'amount') is distinct from 'number'
       or jsonb_typeof(item->'dueDate') is distinct from 'string'
       or jsonb_typeof(item->'taskIds') is distinct from 'array'
       or jsonb_array_length(item->'taskIds') not between 1 and 120 then
      raise exception 'Milestone % has invalid details or plan-task assignments', item_count using errcode = '22023';
    end if;
    for task_item in select value from jsonb_array_elements(item->'taskIds') loop
      if jsonb_typeof(task_item) is distinct from 'string' then
        raise exception 'Milestone % has an invalid plan task selection', item_count using errcode = '22023';
      end if;
      task_key := btrim(task_item #>> '{}');
      if length(task_key) not between 1 and 161 or task_key = any(task_keys) then
        raise exception 'Milestone task selections must be non-empty and unique' using errcode = '22023';
      end if;
      task_keys := array_append(task_keys, task_key);
    end loop;
    begin
      perform (item->>'id')::uuid;
      item_due := (item->>'dueDate')::date;
      if (item->>'amount')::numeric <= 0 then raise exception 'amount must be positive'; end if;
    exception when others then
      raise exception 'Milestone % has an invalid ID, amount, or deadline', item_count using errcode = '22023';
    end;
    if item_due < plan_start or item_due > plan_deadline then
      raise exception 'Milestone deadlines must fall within the agreed project dates' using errcode = '22023';
    end if;
    if item_count > 1 and item_due < (
      select (prior.value->>'dueDate')::date
      from jsonb_array_elements(p_milestones) with ordinality as prior(value, ord)
      where prior.ord = item_count - 1
    ) then
      raise exception 'Milestones must be ordered by deadline' using errcode = '22023';
    end if;
    plan_total := plan_total + (item->>'amount')::numeric;
  end loop;
  if round(plan_total, 2) <> round(plan_budget, 2) then
    raise exception 'Milestone amounts must add up to the agreed project budget' using errcode = '22023';
  end if;
  if (select count(distinct (value->>'id')::uuid) from jsonb_array_elements(p_milestones)) <> item_count then
    raise exception 'Milestone IDs must be unique' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(task_keys) as assigned(task_key)
    where not exists (
      select 1
      from jsonb_array_elements(agreement_row.work_plan #> '{content,columns}') as plan_columns(column_value)
      cross join lateral jsonb_array_elements(plan_columns.column_value->'tasks') as plan_tasks(task_value)
      where plan_columns.column_value->>'type' = 'stage'
        and assigned.task_key = (plan_columns.column_value->>'id') || ':' || (plan_tasks.task_value->>'id')
    )
  ) then
    raise exception 'Milestone task assignments must match tasks in the agreed work plan' using errcode = '22023';
  end if;
  select jsonb_agg(jsonb_build_object(
    'id', (value->>'id')::uuid,
    'title', btrim(value->>'title'),
    'description', coalesce(value->>'description', ''),
    'amount', round((value->>'amount')::numeric, 2),
    'dueDate', value->>'dueDate',
    'displayOrder', ord,
    'taskIds', value->'taskIds'
  ) order by ord) into normalized_plan
  from jsonb_array_elements(p_milestones) with ordinality as items(value, ord);

  current_party := case when requester = client_user then 'client' else 'freelancer' end;
  if agreement_row.milestone_plan is distinct from normalized_plan then
    update public.service_order_basic_terms_agreements as agreement
    set previous_milestone_plan = agreement_row.milestone_plan,
        milestone_plan = normalized_plan,
        milestone_changed_by = current_party,
        client_milestone_agreed_at = case
          when agreement_row.milestone_plan is null and current_party = 'client' then pg_catalog.clock_timestamp()
          else null end,
        freelancer_milestone_agreed_at = case
          when agreement_row.milestone_plan is null and current_party = 'freelancer' then pg_catalog.clock_timestamp()
          else null end,
        updated_at = pg_catalog.clock_timestamp()
    where agreement.order_id = p_order;
  else
    update public.service_order_basic_terms_agreements as agreement
    set client_milestone_agreed_at = case when current_party = 'client' then coalesce(agreement.client_milestone_agreed_at, pg_catalog.clock_timestamp()) else agreement.client_milestone_agreed_at end,
        freelancer_milestone_agreed_at = case when current_party = 'freelancer' then coalesce(agreement.freelancer_milestone_agreed_at, pg_catalog.clock_timestamp()) else agreement.freelancer_milestone_agreed_at end,
        updated_at = pg_catalog.clock_timestamp()
    where agreement.order_id = p_order;
  end if;
  return public.worksync_get_service_order_milestone_plan_agreement(p_order);
end;
$$;

revoke all on function public.worksync_get_service_order_milestone_plan_agreement(uuid) from public, anon;
revoke all on function public.worksync_agree_service_order_milestone_plan(uuid, jsonb) from public, anon;
grant execute on function public.worksync_get_service_order_milestone_plan_agreement(uuid) to authenticated;
grant execute on function public.worksync_agree_service_order_milestone_plan(uuid, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
