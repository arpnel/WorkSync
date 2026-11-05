-- PREPARED, NOT APPLIED.
-- Carry a mutually approved job or service-order milestone plan into the
-- active project's milestone rows used by work submissions. Apply after:
-- worksync_contract_workflow_replacement.sql,
-- worksync_service_order_basic_terms_agreement.sql,
-- worksync_service_order_work_plan_agreement.sql, and
-- worksync_service_order_milestone_plan_agreement.sql,
-- worksync_job_milestone_plan_agreement.sql, and
-- worksync_job_work_plan_agreement.sql.
begin;

alter table public.milestones enable row level security;
grant select on public.milestones to authenticated;

do $policy$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'milestones'
      and policyname = 'worksync_milestone_project_participant_read'
  ) then
    create policy worksync_milestone_project_participant_read
      on public.milestones for select to authenticated
      using (
        exists (
          select 1 from public.projects p
          join public.client_profiles cp on cp.client_id = p.client_id
          where p.project_id = milestones.project_id
            and cp.user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.projects p
          join public.freelancer_profiles fp on fp.freelancer_id = p.freelancer_id
          where p.project_id = milestones.project_id
            and fp.user_id = (select auth.uid())
        )
      );
  end if;
end;
$policy$;

create or replace function public.worksync_materialize_service_order_milestones(
  p_project uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_row public.projects;
  v_contract_id uuid;
  approved_plan jsonb;
  agreed_budget numeric;
  item record;
  item_id uuid;
  item_amount numeric;
  item_due date;
  item_title text;
  item_description text;
  item_source_id uuid;
  item_count integer;
  plan_total numeric;
  project_milestone_status public.milestone_status;
begin
  select p.* into project_row
  from public.projects p
  where p.project_id = p_project;
  if not found
     or (project_row.order_id is null and project_row.application_id is null)
     or project_row.project_type::text <> 'milestone'
     or project_row.status::text not in ('active', 'in_progress', 'revision', 'completed') then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(project_row.project_id::text, 0)
  );

  if project_row.application_id is not null then
    select agreement.milestone_plan, (agreement.terms->>'budget')::numeric,
           contract.contract_id
      into approved_plan, agreed_budget, v_contract_id
    from public.job_applications application
    join public.jobs job on job.job_id = application.job_id
    join public.contracts contract on contract.application_id = application.application_id
    join public.job_basic_terms_agreements agreement
      on agreement.application_id = application.application_id
    where application.application_id = project_row.application_id
      and job.project_type::text = 'milestone'
      and contract.client_signed_at is not null
      and contract.freelancer_signed_at is not null
      and agreement.client_milestone_agreed_at is not null
      and agreement.freelancer_milestone_agreed_at is not null;
  else
    select agreement.milestone_plan, (agreement.terms->>'budget')::numeric,
           contract.contract_id
      into approved_plan, agreed_budget, v_contract_id
    from public.service_orders service_order
    join public.services service on service.service_id = service_order.service_id
    join public.contracts contract on contract.order_id = service_order.order_id
    join public.service_order_basic_terms_agreements agreement
      on agreement.order_id = service_order.order_id
    where service_order.order_id = project_row.order_id
      and service_order.application_id is null
      and service.service_type::text = 'milestone'
      and contract.client_signed_at is not null
      and contract.freelancer_signed_at is not null
      and agreement.client_milestone_agreed_at is not null
      and agreement.freelancer_milestone_agreed_at is not null;
  end if;
  if not found or pg_catalog.jsonb_typeof(approved_plan) is distinct from 'array' then
    return;
  end if;

  select pg_catalog.count(*), coalesce(pg_catalog.sum((value->>'amount')::numeric), 0)
    into item_count, plan_total
  from pg_catalog.jsonb_array_elements(approved_plan) as items(value);
  if item_count not between 1 and 30
     or round(plan_total, 2) <> round(agreed_budget, 2) then
    raise exception 'The approved milestone plan does not match the signed project budget'
      using errcode = '23514';
  end if;

  project_milestone_status := case
    when project_row.status::text = 'completed' then 'approved'::public.milestone_status
    else 'pending'::public.milestone_status
  end;

  for item in
    select value, ordinality
    from pg_catalog.jsonb_array_elements(approved_plan)
      with ordinality as plan_items(value, ordinality)
  loop
    item_id := (item.value->>'id')::uuid;
    item_title := pg_catalog.btrim(item.value->>'title');
    item_description := coalesce(item.value->>'description', '');
    item_amount := (item.value->>'amount')::numeric;
    item_due := nullif(item.value->>'dueDate', '')::date;

    if item_title = '' or item_amount <= 0 or item_due is null then
      raise exception 'The approved milestone plan contains an invalid milestone'
        using errcode = '23514';
    end if;

    if exists (
      select 1 from public.milestones existing
      where existing.project_id = project_row.project_id
        and (
          existing.source_contract_milestone_id = item_id
          or (
            existing.display_order = item.ordinality::integer
            and existing.title = item_title
          )
        )
    ) then
      continue;
    end if;

    item_source_id := null;
    if exists (
      select 1 from public.contract_milestones contract_milestone
      where contract_milestone.contract_id = v_contract_id
        and contract_milestone.contract_milestone_id = item_id
    ) then
      item_source_id := item_id;
    end if;

    insert into public.milestones (
      project_id, title, description, amount, due_date, display_order,
      status, source_contract_milestone_id
    ) values (
      project_row.project_id, item_title, item_description, item_amount,
      item_due, item.ordinality::integer, project_milestone_status, item_source_id
    );
  end loop;
end;
$$;
revoke all on function public.worksync_materialize_service_order_milestones(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.worksync_materialize_service_order_milestones_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.worksync_materialize_service_order_milestones(new.project_id);
  return new;
end;
$$;
revoke all on function public.worksync_materialize_service_order_milestones_trigger()
  from public, anon, authenticated, service_role;

drop trigger if exists worksync_materialize_service_order_milestones_after_activation
  on public.projects;
create trigger worksync_materialize_service_order_milestones_after_activation
  after insert or update of status on public.projects
  for each row execute function public.worksync_materialize_service_order_milestones_trigger();

-- Repair active/completed projects created before this synchronization existed.
do $$
declare
  project_id uuid;
begin
  for project_id in
    select p.project_id
    from public.projects p
    where (p.order_id is not null or p.application_id is not null)
      and p.project_type::text = 'milestone'
      and p.status::text in ('active', 'in_progress', 'revision', 'completed')
  loop
    perform public.worksync_materialize_service_order_milestones(project_id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
