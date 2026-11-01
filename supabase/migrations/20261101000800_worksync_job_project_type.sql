-- PREPARED, NOT APPLIED.
-- Persist the client's Standard/Milestone choice through job hiring and project
-- activation. Legacy listings and projects default to Standard unless their
-- linked service already identifies them as milestone-based.
begin;

alter table public.jobs
  add column if not exists project_type text not null default 'standard';
alter table public.projects
  add column if not exists project_type text not null default 'standard';

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.jobs'::regclass
      and conname = 'jobs_project_type_check'
  ) then
    alter table public.jobs add constraint jobs_project_type_check
      check (project_type in ('standard', 'milestone'));
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_project_type_check'
  ) then
    alter table public.projects add constraint projects_project_type_check
      check (project_type in ('standard', 'milestone'));
  end if;
end;
$$;

-- Preserve the established type for service-based projects; job-based projects
-- inherit the type selected on the originating listing.
update public.projects p
set project_type = coalesce(j.project_type, s.service_type, 'standard')
from public.service_orders so
left join public.job_applications a on a.application_id = so.application_id
left join public.jobs j on j.job_id = coalesce(a.job_id, so.job_id)
left join public.services s on s.service_id = so.service_id
where (so.order_id = p.order_id or (p.application_id is not null and so.application_id = p.application_id))
  and p.project_type is distinct from coalesce(j.project_type, s.service_type, 'standard');

create or replace function public.worksync_set_project_type_from_listing()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare source_type text;
begin
  if new.application_id is not null then
    select j.project_type into source_type
    from public.job_applications a
    join public.jobs j on j.job_id = a.job_id
    where a.application_id = new.application_id;
  elsif new.order_id is not null then
    select s.service_type into source_type
    from public.service_orders so
    join public.services s on s.service_id = so.service_id
    where so.order_id = new.order_id;
  end if;
  new.project_type := coalesce(source_type, new.project_type, 'standard');
  return new;
end;
$$;
revoke all on function public.worksync_set_project_type_from_listing() from public, anon, authenticated, service_role;
create trigger worksync_set_project_type_from_listing_before_write
  before insert or update of application_id, order_id on public.projects
  for each row execute function public.worksync_set_project_type_from_listing();

-- A job-based milestone project gets an initial funded deliverable when no
-- milestone schedule was included in its signed contract. Existing contract
-- milestones are still inserted by worksync_activate_contract.
create or replace function public.worksync_seed_job_project_milestone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.application_id is null
    or new.project_type <> 'milestone'
    or new.status::text not in ('active', 'in_progress')
    or new.budget is null or new.budget <= 0 then
    return new;
  end if;
  if exists (
    select 1 from public.milestones m where m.project_id = new.project_id
  ) or exists (
    select 1 from public.contract_milestones cm
    join public.contracts c on c.contract_id = cm.contract_id
    where c.application_id = new.application_id
  ) then
    return new;
  end if;
  insert into public.milestones(
    project_id, title, description, amount, due_date, display_order, status
  ) values (
    new.project_id, 'Project delivery', 'Final delivery for this milestone project.',
    new.budget, new.due_date, 1, 'pending'::public.milestone_status
  );
  return new;
end;
$$;
revoke all on function public.worksync_seed_job_project_milestone() from public, anon, authenticated, service_role;
create trigger worksync_seed_job_project_milestone_after_write
  after insert or update on public.projects
  for each row execute function public.worksync_seed_job_project_milestone();

commit;
