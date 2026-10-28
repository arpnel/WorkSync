-- DO NOT APPLY: REVIEW FOUND BLOCKING SECURITY AND CONSISTENCY DEFECTS.
-- This is the prior draft retained for inspection, not an approved migration.
-- A replacement must coordinate the contract version writer, activation,
-- task submission, client review, and service-role auto-review paths together.

begin;

-- Legacy terms are TEXT and some rows predate JSON-encoded request details.
create or replace function public.worksync_safe_contract_json(p_terms text)
returns jsonb language plpgsql immutable set search_path = '' as $$
begin
  if p_terms is null or btrim(p_terms) = '' then return '{}'::jsonb; end if;
  return p_terms::jsonb;
exception when others then
  return '{}'::jsonb;
end;
$$;

-- Each acceptance is pinned to the current immutable snapshot version.
alter table public.contracts
  add column if not exists current_version integer not null default 1,
  add column if not exists client_signed_version integer,
  add column if not exists freelancer_signed_version integer;

create table if not exists public.contract_versions (
  contract_id uuid not null references public.contracts(contract_id),
  version integer not null check (version > 0),
  snapshot jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (contract_id, version)
);

-- Existing agreements get a version 1 snapshot from their current live terms.
insert into public.contract_versions(contract_id, version, snapshot, created_by, created_at)
select c.contract_id, 1,
  jsonb_build_object(
    'legacy', true,
    'finalPrice', c.final_price,
    'deliveryTimeDays', c.delivery_time_days,
    'revisionsCount', c.revisions_count,
    'terms', c.terms,
    'milestones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.contract_milestone_id, 'title', m.title,
        'description', m.description, 'amount', m.amount,
        'dueDate', m.due_date, 'displayOrder', m.display_order
      ) order by m.display_order, m.contract_milestone_id)
      from public.contract_milestones m where m.contract_id = c.contract_id
    ), '[]'::jsonb),
    'tasks', coalesce(public.worksync_safe_contract_json(c.terms)->'tasks', '[]'::jsonb)
  ), null, c.created_at
from public.contracts c
on conflict (contract_id, version) do nothing;

update public.contracts
set client_signed_version = current_version
where client_signed_at is not null and client_signed_version is null;
update public.contracts
set freelancer_signed_version = current_version
where freelancer_signed_at is not null and freelancer_signed_version is null;

create or replace function public.worksync_contract_version_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Contract version snapshots are immutable' using errcode = '55000';
end;
$$;

create trigger worksync_contract_versions_immutable
before update or delete on public.contract_versions
for each row execute function public.worksync_contract_version_immutable();

alter table public.contract_versions enable row level security;
revoke all on public.contract_versions from public, anon, authenticated, service_role;
grant select on public.contract_versions to authenticated;
create policy contract_versions_participant_read on public.contract_versions
for select to authenticated
using (public.is_contract_participant(contract_id));
revoke insert, update, delete on public.contract_versions from anon, authenticated;

-- Persisted task plan is seeded from the accepted contract snapshot on activation.
create table if not exists public.project_tasks (
  task_id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(project_id),
  source_version integer not null check (source_version > 0),
  source_key text not null,
  title text not null check (length(btrim(title)) between 1 and 200),
  description text,
  expected_output text,
  status text not null default 'todo'
    check (status in ('todo','in_progress','in_review','revision_requested','completed')),
  due_date date,
  display_order integer not null default 1,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, source_version, source_key)
);

create table if not exists public.project_task_history (
  history_id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks(task_id),
  actor_id uuid references auth.users(id),
  from_status text,
  to_status text not null
    check (to_status in ('todo','in_progress','in_review','revision_requested','completed')),
  note text,
  submission_id uuid references public.project_submissions(submission_id),
  created_at timestamptz not null default now()
);

alter table public.project_submissions
  add column if not exists task_id uuid references public.project_tasks(task_id);

create index if not exists project_tasks_project_order_idx
  on public.project_tasks(project_id, display_order, task_id);
create index if not exists project_task_history_task_created_idx
  on public.project_task_history(task_id, created_at desc);
create index if not exists project_submissions_task_id_idx
  on public.project_submissions(task_id) where task_id is not null;

alter table public.project_tasks enable row level security;
alter table public.project_task_history enable row level security;
revoke all on public.project_tasks, public.project_task_history from public, anon, authenticated, service_role;
grant select on public.project_tasks, public.project_task_history to authenticated;
create policy project_tasks_participant_read on public.project_tasks
for select to authenticated
using (public.is_project_participant(project_id));
create policy project_task_history_participant_read on public.project_task_history
for select to authenticated
using (exists (
  select 1 from public.project_tasks t
  where t.task_id = project_task_history.task_id
    and public.is_project_participant(t.project_id)
));
-- Direct task writes are denied; transitions and history go through the RPC.
revoke insert, update, delete on public.project_tasks from authenticated;
revoke insert, update, delete on public.project_task_history from authenticated;

create or replace function public.worksync_set_project_task_status(
  p_task_id uuid, p_status text, p_note text default null
) returns public.project_tasks
language plpgsql security definer set search_path = '' as $$
declare t public.project_tasks; party text; old_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into t from public.project_tasks where task_id=p_task_id for update;
  if t.task_id is null then raise exception 'Task not found' using errcode='P0002'; end if;
  party := public.worksync_project_party(t.project_id);
  if party is null then raise exception 'Only project participants may change tasks' using errcode='42501'; end if;
  if p_status not in ('todo','in_progress','in_review','revision_requested') then
    raise exception 'Completion is recorded only by client approval of a task submission' using errcode='42501';
  end if;
  if party <> 'freelancer' then raise exception 'Only the freelancer may update task progress' using errcode='42501'; end if;
  if p_status = t.status then return t; end if;
  if not ((t.status='todo' and p_status='in_progress')
       or (t.status='in_progress' and p_status in ('todo','in_review'))
       or (t.status='in_review' and p_status='revision_requested')
       or (t.status='revision_requested' and p_status in ('in_progress','in_review'))) then
    raise exception 'Invalid task status transition' using errcode='22023';
  end if;
  if p_note is not null and length(p_note)>5000 then raise exception 'Task note is too long' using errcode='22023'; end if;
  old_status := t.status;
  update public.project_tasks set status=p_status, updated_at=now()
    where task_id=p_task_id returning * into t;
  insert into public.project_task_history(task_id,actor_id,from_status,to_status,note)
    values(t.task_id,auth.uid(),old_status,p_status,p_note);
  return t;
end;
$$;
revoke all on function public.worksync_set_project_task_status(uuid,text,text) from public, anon;
grant execute on function public.worksync_set_project_task_status(uuid,text,text) to authenticated;

-- Approval of a task-linked submission is the sole path that completes its task.
create or replace function public.worksync_complete_task_from_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.project_tasks; party text;
begin
  if new.task_id is null or new.status not in ('approved','revision_requested')
     or old.status is not distinct from new.status then return new; end if;
  select * into t from public.project_tasks where task_id=new.task_id for update;
  if t.task_id is null or t.project_id <> new.project_id then
    raise exception 'Submission task does not belong to this project' using errcode='23514';
  end if;
  party := public.worksync_project_party(new.project_id);
  if party <> 'client' or auth.uid() is null then
    raise exception 'Only the project client may review a task-linked submission' using errcode='42501';
  end if;
  if t.status not in ('in_review','revision_requested') then
    raise exception 'Task is not awaiting review' using errcode='22023';
  end if;
  if new.status='approved' then
    update public.project_tasks set status='completed', completed_at=now(), updated_at=now()
      where task_id=t.task_id;
    insert into public.project_task_history(task_id,actor_id,from_status,to_status,submission_id)
      values(t.task_id,auth.uid(),t.status,'completed',new.submission_id);
  else
    update public.project_tasks set status='revision_requested', updated_at=now()
      where task_id=t.task_id;
    insert into public.project_task_history(task_id,actor_id,from_status,to_status,submission_id)
      values(t.task_id,auth.uid(),t.status,'revision_requested',new.submission_id);
  end if;
  return new;
end;
$$;
create trigger worksync_complete_task_on_submission_approval
after update of status on public.project_submissions
for each row execute function public.worksync_complete_task_from_submission();

create or replace function public.worksync_guard_submission_task_link()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.project_tasks;
begin
  if new.task_id is null then return new; end if;
  select * into t from public.project_tasks where task_id=new.task_id;
  if t.task_id is null or t.project_id<>new.project_id then
    raise exception 'Task must belong to the submission project' using errcode='23514';
  end if;
  if public.worksync_project_party(new.project_id)<>'freelancer'
     or new.author_id is distinct from auth.uid() then
    raise exception 'Only the project freelancer may submit task work' using errcode='42501';
  end if;
  if new.kind<>'delivery' then raise exception 'Task references are only supported for delivery submissions' using errcode='22023'; end if;
  if tg_op='UPDATE' and old.task_id is distinct from new.task_id then
    raise exception 'Submission task reference cannot change' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger worksync_guard_submission_task_link
before insert or update of task_id on public.project_submissions
for each row execute function public.worksync_guard_submission_task_link();

create or replace function public.worksync_mark_task_in_review()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.project_tasks;
begin
  if new.task_id is null or new.kind<>'delivery' or new.status<>'submitted' then return new; end if;
  select * into t from public.project_tasks where task_id=new.task_id for update;
  if t.status not in ('in_progress','revision_requested') then
    raise exception 'Task is not ready for delivery' using errcode='22023';
  end if;
  update public.project_tasks set status='in_review',updated_at=now() where task_id=t.task_id;
  insert into public.project_task_history(task_id,actor_id,from_status,to_status,submission_id)
    values(t.task_id,auth.uid(),t.status,'in_review',new.submission_id);
  return new;
end;
$$;
create trigger worksync_mark_task_in_review_on_delivery
after insert on public.project_submissions
for each row execute function public.worksync_mark_task_in_review();

-- Capture every material contract edit and draft milestone edit as a new version.
create or replace function public.worksync_capture_contract_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.contracts; next_version integer; snap jsonb;
begin
  if tg_table_name='contracts' then
    if tg_op='INSERT' then c:=new;
    elsif row(new.final_price,new.delivery_time_days,new.revisions_count,new.terms)
          is distinct from row(old.final_price,old.delivery_time_days,old.revisions_count,old.terms) then c:=new;
    else return new; end if;
    next_version := case when tg_op='INSERT' then greatest(c.current_version,1) else old.current_version+1 end;
    update public.contracts set current_version=next_version where contract_id=c.contract_id;
  else
    if tg_op='DELETE' then select * into c from public.contracts where contract_id=old.contract_id for update;
    else select * into c from public.contracts where contract_id=new.contract_id for update; end if;
    if c.contract_id is null then return coalesce(new,old); end if;
    next_version := c.current_version+1;
    update public.contracts set current_version=next_version where contract_id=c.contract_id;
  end if;
  select * into c from public.contracts where contract_id=c.contract_id;
  snap := jsonb_build_object(
    'legacy', false, 'finalPrice',c.final_price, 'deliveryTimeDays',c.delivery_time_days,
    'revisionsCount',c.revisions_count, 'terms',c.terms,
    'tasks',coalesce(public.worksync_safe_contract_json(c.terms)->'tasks','[]'::jsonb),
    'startDate', public.worksync_safe_contract_json(c.terms)->>'startDate',
    'deadline',public.worksync_safe_contract_json(c.terms)->>'deadline',
    'milestones',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.contract_milestone_id,'title',m.title,'description',m.description,
      'amount',m.amount,'dueDate',m.due_date,'displayOrder',m.display_order
    ) order by m.display_order,m.contract_milestone_id)
    from public.contract_milestones m where m.contract_id=c.contract_id),'[]'::jsonb)
  );
  insert into public.contract_versions(contract_id,version,snapshot,created_by)
  values(c.contract_id,next_version,snap,auth.uid());
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger worksync_contract_versions_on_material_edit
after insert or update of final_price,delivery_time_days,revisions_count,terms on public.contracts
for each row execute function public.worksync_capture_contract_version();
create trigger worksync_contract_versions_on_milestone_edit
after insert or update or delete on public.contract_milestones
for each row execute function public.worksync_capture_contract_version();

-- Bind signatures to the currently presented version; activation requires both.
create or replace function public.worksync_bind_contract_acceptance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.current_version is distinct from old.current_version and pg_trigger_depth() <= 1 then
    raise exception 'Contract version is managed by the database' using errcode='42501';
  end if;
  if new.client_signed_at is distinct from old.client_signed_at then
    new.client_signed_version := case when new.client_signed_at is null then null else new.current_version end;
  elsif new.client_signed_at is null then
    new.client_signed_version := null;
  elsif new.client_signed_version is distinct from old.client_signed_version then
    raise exception 'Client acceptance version is managed by the database' using errcode='42501';
  end if;
  if new.freelancer_signed_at is distinct from old.freelancer_signed_at then
    new.freelancer_signed_version := case when new.freelancer_signed_at is null then null else new.current_version end;
  elsif new.freelancer_signed_at is null then
    new.freelancer_signed_version := null;
  elsif new.freelancer_signed_version is distinct from old.freelancer_signed_version then
    raise exception 'Freelancer acceptance version is managed by the database' using errcode='42501';
  end if;
  if new.client_signed_version is distinct from old.client_signed_version
     and new.client_signed_at is not null
     and public.worksync_contract_party(old.contract_id) <> 'client' then
    raise exception 'Only the client may accept for the client' using errcode='42501';
  end if;
  if new.freelancer_signed_version is distinct from old.freelancer_signed_version
     and new.freelancer_signed_at is not null
     and public.worksync_contract_party(old.contract_id) <> 'freelancer' then
    raise exception 'Only the freelancer may accept for the freelancer' using errcode='42501';
  end if;
  if new.status='active' and (new.client_signed_at is null or new.freelancer_signed_at is null
     or new.client_signed_version is distinct from new.current_version
     or new.freelancer_signed_version is distinct from new.current_version) then
    raise exception 'Both participants must accept the current contract version' using errcode='P0007';
  end if;
  return new;
end;
$$;
create trigger worksync_bind_contract_acceptances
before update of current_version,client_signed_at,freelancer_signed_at,client_signed_version,freelancer_signed_version,status
on public.contracts for each row execute function public.worksync_bind_contract_acceptance();

create or replace function public.worksync_validate_contract_status_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare order_key uuid; project_done boolean;
begin
  if new.status is not distinct from old.status then return new; end if;
  if old.status::text in ('rejected','cancelled','completed') then
    raise exception 'This contract status is final' using errcode='22023';
  end if;
  if old.status::text='active' and new.status::text='completed' then
    select p.order_id into order_key from public.projects p
      where (old.order_id is not null and p.order_id=old.order_id)
         or (old.application_id is not null and p.application_id=old.application_id)
      order by p.created_at limit 1;
    select exists(select 1 from public.projects p
      where ((old.order_id is not null and p.order_id=old.order_id)
         or (old.application_id is not null and p.application_id=old.application_id))
        and p.status::text='completed') into project_done;
    if not project_done or public.worksync_order_on_hold(coalesce(order_key,old.order_id)) then
      raise exception 'Contract completion must follow project completion and payout hold checks' using errcode='42501';
    end if;
    if auth.role()<>'service_role' and public.worksync_contract_party(old.contract_id)<>'client' then
      raise exception 'Only the project client may complete this contract' using errcode='42501';
    end if;
    return new;
  end if;
  if old.status::text='active' then
    raise exception 'Active contracts cannot return to negotiation' using errcode='22023';
  end if;
  if new.status::text='active' then
    perform public.worksync_guard_contract(old.contract_id);
    if old.client_signed_version is distinct from old.current_version
       or old.freelancer_signed_version is distinct from old.current_version then
      raise exception 'Both participants must accept the current contract version' using errcode='P0007';
    end if;
    return new;
  end if;
  if new.status::text not in ('draft','pending','pending_client','pending_freelancer','rejected','cancelled') then
    raise exception 'Invalid contract status transition' using errcode='22023';
  end if;
  if public.worksync_contract_party(old.contract_id) is null then
    raise exception 'Only a contract participant may change contract status' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger worksync_validate_contract_status_transition
before update of status on public.contracts
for each row execute function public.worksync_validate_contract_status_transition();

-- Idempotently seed tasks after the existing activation RPC creates/locates its project.
create or replace function public.worksync_seed_contract_tasks()
returns trigger language plpgsql security definer set search_path = '' as $$
declare pid uuid; v public.contract_versions; task jsonb; task_key text; ord bigint;
begin
  if new.status <> 'active' or old.status='active' then return new; end if;
  select project_id into pid from public.projects
    where (new.order_id is not null and order_id=new.order_id)
       or (new.application_id is not null and application_id=new.application_id)
    order by created_at limit 1;
  if pid is null then raise exception 'Activated contract has no project' using errcode='P0002'; end if;
  select * into v from public.contract_versions
   where contract_id=new.contract_id and version=new.current_version;
  if v.contract_id is null then raise exception 'Accepted contract version snapshot is missing' using errcode='P0002'; end if;
  update public.projects set
    start_date=coalesce(nullif(v.snapshot->>'startDate','')::date,start_date),
    due_date=coalesce(nullif(v.snapshot->>'deadline','')::date,due_date)
  where project_id=pid;
  if jsonb_typeof(v.snapshot->'tasks') not in ('array') then
    raise exception 'Accepted contract tasks must be an array' using errcode='22023';
  end if;
  for task,ord in
    select x.value,x.ordinality from jsonb_array_elements(coalesce(v.snapshot->'tasks','[]'::jsonb)) with ordinality x(value,ordinality)
  loop
    task_key:=coalesce(nullif(task->>'id',''),ord::text);
    insert into public.project_tasks(project_id,source_version,source_key,title,description,expected_output,due_date,display_order)
    values(pid,new.current_version,task_key,task->>'title',task->>'description',task->>'expectedOutput',
      nullif(task->>'dueDate','')::date,coalesce(nullif(task->>'displayOrder','')::integer,ord::integer))
    on conflict (project_id,source_version,source_key) do nothing;
  end loop;
  return new;
end;
$$;
create trigger worksync_seed_tasks_after_contract_activation
after update of status on public.contracts
for each row execute function public.worksync_seed_contract_tasks();

commit;
