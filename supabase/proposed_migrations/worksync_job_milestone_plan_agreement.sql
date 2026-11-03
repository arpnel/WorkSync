-- PREPARED, NOT APPLIED.
-- Persist a shared milestone schedule for accepted milestone jobs. Each
-- participant confirms the same complete schedule; changing it resets the
-- other participant's confirmation. Contract signatures remain a later step.
-- Apply worksync_job_work_plan_agreement.sql before this migration.
begin;

alter table public.job_basic_terms_agreements
  add column if not exists milestone_plan jsonb,
  add column if not exists previous_milestone_plan jsonb,
  add column if not exists milestone_changed_by text,
  add column if not exists client_milestone_agreed_at timestamptz,
  add column if not exists freelancer_milestone_agreed_at timestamptz;

create or replace function public.worksync_reset_milestone_plan_on_terms_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.terms is distinct from old.terms then
    new.previous_milestone_plan := old.milestone_plan;
    new.milestone_changed_by := new.changed_by;
    new.milestone_plan := null;
    new.client_milestone_agreed_at := null;
    new.freelancer_milestone_agreed_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.worksync_reset_milestone_plan_on_terms_change() from public, anon, authenticated, service_role;
drop trigger if exists worksync_reset_milestone_plan_after_terms_change on public.job_basic_terms_agreements;
create trigger worksync_reset_milestone_plan_after_terms_change
  before update of terms on public.job_basic_terms_agreements
  for each row execute function public.worksync_reset_milestone_plan_on_terms_change();

create or replace function public.worksync_get_job_milestone_plan_agreement(p_application uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  requester uuid := auth.uid();
  client_user uuid;
  freelancer_user uuid;
  application_status text;
  agreement_row public.job_basic_terms_agreements;
begin
  if requester is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select a.status::text, cp.user_id, fp.user_id
    into application_status, client_user, freelancer_user
  from public.job_applications a
  join public.jobs j on j.job_id = a.job_id
  join public.client_profiles cp on cp.client_id = j.client_id
  join public.freelancer_profiles fp on fp.freelancer_id = a.freelancer_id
  where a.application_id = p_application;
  if application_status is distinct from 'accepted'
     or requester not in (client_user, freelancer_user) then
    raise exception 'Application unavailable' using errcode = '42501';
  end if;
  select * into agreement_row from public.job_basic_terms_agreements where application_id = p_application;
  return jsonb_build_object(
    'milestones', coalesce(agreement_row.milestone_plan, '[]'::jsonb),
    'previousMilestones', coalesce(agreement_row.previous_milestone_plan, '[]'::jsonb),
    'changedBy', agreement_row.milestone_changed_by,
    'clientAgreed', agreement_row.client_milestone_agreed_at is not null,
    'freelancerAgreed', agreement_row.freelancer_milestone_agreed_at is not null
  );
end;
$$;

create or replace function public.worksync_agree_job_milestone_plan(
  p_application uuid,
  p_milestones jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  requester uuid := auth.uid();
  client_user uuid;
  freelancer_user uuid;
  application_status text;
  project_type text;
  agreement_row public.job_basic_terms_agreements;
  current_party text;
  normalized_plan jsonb;
  plan_total numeric := 0;
  item jsonb;
  task_item jsonb;
  task_key text;
  task_keys text[] := '{}';
  item_count integer := 0;
  item_title text;
  item_due date;
  plan_start date;
  plan_deadline date;
  plan_budget numeric;
begin
  if requester is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select a.status::text, cp.user_id, fp.user_id, j.project_type
    into application_status, client_user, freelancer_user, project_type
  from public.job_applications a
  join public.jobs j on j.job_id = a.job_id
  join public.client_profiles cp on cp.client_id = j.client_id
  join public.freelancer_profiles fp on fp.freelancer_id = a.freelancer_id
  where a.application_id = p_application;
  if application_status is distinct from 'accepted'
     or requester not in (client_user, freelancer_user) then
    raise exception 'Application unavailable' using errcode = '42501';
  end if;
  if project_type is distinct from 'milestone' then
    raise exception 'Milestone planning is available only for milestone projects' using errcode = '22023';
  end if;
  if jsonb_typeof(p_milestones) is distinct from 'array'
     or jsonb_array_length(p_milestones) not between 1 and 30 then
    raise exception 'Add between 1 and 30 milestones' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_application::text, 0));
  select * into agreement_row from public.job_basic_terms_agreements
   where application_id = p_application for update;
  if agreement_row.application_id is null or agreement_row.terms is null
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
       or jsonb_typeof(item->'dueDate') is distinct from 'string' then
      raise exception 'Milestone % has invalid details', item_count using errcode = '22023';
    end if;
    if jsonb_typeof(item->'taskIds') is distinct from 'array' then
      raise exception 'Milestone % must include at least one selected plan task', item_count using errcode = '22023';
    end if;
    if jsonb_array_length(item->'taskIds') not between 1 and 120 then
      raise exception 'Milestone % must include at least one selected plan task', item_count using errcode = '22023';
    end if;
    for task_item in select value from jsonb_array_elements(item->'taskIds') loop
      if jsonb_typeof(task_item) is distinct from 'string' then
        raise exception 'Milestone % has an invalid plan task selection', item_count using errcode = '22023';
      end if;
      task_key := btrim(task_item #>> '{}');
      if length(task_key) not between 1 and 161 or task_key = any(task_keys) then
        raise exception 'Milestone % task selections must be non-empty and unique', item_count using errcode = '22023';
      end if;
      task_keys := array_append(task_keys, task_key);
    end loop;
    begin
      perform (item->>'id')::uuid;
      if (item->>'amount')::numeric <= 0 then raise exception 'amount must be positive'; end if;
      item_due := (item->>'dueDate')::date;
    exception when others then
      raise exception 'Milestone % has an invalid ID, amount, or deadline', item_count using errcode = '22023';
    end;
    if item_due < plan_start or item_due > plan_deadline then
      raise exception 'Milestone deadlines must fall within the agreed project dates' using errcode = '22023';
    end if;
    if item_count > 1 and item_due < (select (value->>'dueDate')::date from jsonb_array_elements(p_milestones) with ordinality as prior(value, ord) where ord = item_count - 1) then
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
    select 1
    from unnest(task_keys) as assigned(task_key)
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

  select jsonb_agg(
    jsonb_build_object(
      'id', (value->>'id')::uuid,
      'title', btrim(value->>'title'),
      'description', coalesce(value->>'description', ''),
      'amount', round((value->>'amount')::numeric, 2),
      'dueDate', value->>'dueDate',
      'displayOrder', ord,
      'taskIds', value->'taskIds'
    ) order by ord
  ) into normalized_plan
  from jsonb_array_elements(p_milestones) with ordinality as rows(value, ord);

  current_party := case when requester = client_user then 'client' else 'freelancer' end;
  if agreement_row.milestone_plan is distinct from normalized_plan then
    update public.job_basic_terms_agreements
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
    where application_id = p_application;
  else
    update public.job_basic_terms_agreements
    set client_milestone_agreed_at = case when current_party = 'client' then coalesce(client_milestone_agreed_at, pg_catalog.clock_timestamp()) else client_milestone_agreed_at end,
        freelancer_milestone_agreed_at = case when current_party = 'freelancer' then coalesce(freelancer_milestone_agreed_at, pg_catalog.clock_timestamp()) else freelancer_milestone_agreed_at end,
        updated_at = pg_catalog.clock_timestamp()
    where application_id = p_application;
  end if;
  return public.worksync_get_job_milestone_plan_agreement(p_application);
end;
$$;

revoke all on function public.worksync_get_job_milestone_plan_agreement(uuid) from public, anon;
revoke all on function public.worksync_agree_job_milestone_plan(uuid, jsonb) from public, anon;
grant execute on function public.worksync_get_job_milestone_plan_agreement(uuid) to authenticated;
grant execute on function public.worksync_agree_job_milestone_plan(uuid, jsonb) to authenticated;

commit;
