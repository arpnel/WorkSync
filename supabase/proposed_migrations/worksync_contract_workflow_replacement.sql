-- APPLIED TO THE CONNECTED SUPABASE PROJECT as migration 20261028224549_worksync_contract_workflow_replacement.
-- The versioned copy in supabase/migrations is the deployment record.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- RLS does not apply to TRUNCATE. The live grants include broad table
-- privileges, so remove client TRUNCATE on the workflow's exposed tables.
revoke truncate on public.contracts,public.contract_milestones,public.contract_item_approvals,
  public.project_submissions,public.projects,public.milestones,public.project_payouts,
  public.revision_requests from anon,authenticated;

-- Marker rows are visible only to owner-executed functions/triggers. They let
-- the bulk writer suppress row-level compatibility snapshots and create one
-- final snapshot for the entire transaction.
create table public.worksync_workflow_write_context (
  backend_pid integer not null,
  transaction_id bigint not null,
  object_id uuid not null,
  purpose text not null check (purpose in
    ('contract_version','task_submission','submission_review','activation','service_response','contract_cancel')),
  primary key (backend_pid, transaction_id, object_id, purpose)
);
alter table public.worksync_workflow_write_context enable row level security;
revoke all on public.worksync_workflow_write_context from public, anon, authenticated, service_role;

-- These authorized order workflows are the only paths allowed to change a
-- contract to response/rejection or cancellation states. Their transaction
-- markers are private and checked by worksync_contract_status_guard below.
create or replace function public.worksync_cancel_order_internal(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.service_orders where order_id=p_order and status::text='completed')
     or exists(select 1 from public.projects where order_id=p_order and status::text='completed') then
    raise exception 'Completed work cannot be cancelled';
  end if;
  update public.service_orders set status='cancelled',updated_at=now() where order_id=p_order;
  update public.projects set status='cancelled',updated_at=now() where order_id=p_order;
  update public.milestones set status='cancelled'
    where project_id in (select project_id from public.projects where order_id=p_order)
      and status::text<>'completed';
  insert into public.worksync_workflow_write_context
    values(pg_backend_pid(),txid_current(),p_order,'contract_cancel');
  update public.contracts set status='cancelled',updated_at=now() where order_id=p_order;
  delete from public.worksync_workflow_write_context
    where backend_pid=pg_backend_pid() and transaction_id=txid_current()
      and object_id=p_order and purpose='contract_cancel';
end;
$$;

-- Keep the existing freelancer service-response behavior and synchronize its
-- contract state in the same transaction, with a marker unavailable to direct
-- participant table updates.
create or replace function public.worksync_respond_service(p_order uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid:=auth.uid(); v_status text; v_order_id uuid;
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if p_accept is null then raise exception using errcode='22023',message='p_accept is required'; end if;
  v_status:=case when p_accept then 'accepted' else 'rejected' end;
  update public.service_orders so set status=v_status,updated_at=now()
  where so.order_id=p_order and so.status='pending'
    and exists(select 1 from public.freelancer_profiles fp
      where fp.freelancer_id=so.freelancer_id and fp.user_id=v_user_id)
  returning so.order_id into v_order_id;
  if v_order_id is null then
    if not exists(select 1 from public.service_orders so where so.order_id=p_order) then
      raise exception using errcode='P0002',message='Service order not found';
    elsif not exists(select 1 from public.service_orders so join public.freelancer_profiles fp
      on fp.freelancer_id=so.freelancer_id where so.order_id=p_order and fp.user_id=v_user_id) then
      raise exception using errcode='42501',message='Only the assigned freelancer can respond';
    else
      raise exception using errcode='22023',message='Service order is no longer pending';
    end if;
  end if;
  insert into public.worksync_workflow_write_context
    values(pg_backend_pid(),txid_current(),v_order_id,'service_response');
  update public.contracts set status=case when p_accept then 'pending_client'::public.contract_status
    else 'rejected'::public.contract_status end,updated_at=now() where order_id=v_order_id;
  delete from public.worksync_workflow_write_context
    where backend_pid=pg_backend_pid() and transaction_id=txid_current()
      and object_id=v_order_id and purpose='service_response';
  return jsonb_build_object('order_id',v_order_id,'status',v_status);
end;
$$;

create or replace function public.worksync_safe_contract_json(p_terms text)
returns jsonb language plpgsql immutable set search_path = '' as $$
begin
  if p_terms is null or btrim(p_terms) = '' then return '{}'::jsonb; end if;
  return p_terms::jsonb;
exception when others then return '{}'::jsonb;
end;
$$;
revoke all on function public.worksync_safe_contract_json(text) from public, anon;

alter table public.contracts
  add column current_version integer not null default 1,
  add column client_signed_version integer,
  add column freelancer_signed_version integer;

create table public.contract_versions (
  contract_id uuid not null references public.contracts(contract_id),
  version integer not null check (version > 0),
  request_id uuid,
  snapshot jsonb not null,
  legacy boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (contract_id, version),
  unique (contract_id, request_id)
);
alter table public.contract_versions enable row level security;
revoke all on public.contract_versions from public, anon, authenticated, service_role;
grant select on public.contract_versions to authenticated;
create policy contract_versions_participant_read on public.contract_versions
  for select to authenticated
  using (public.is_contract_participant(contract_id));

create or replace function public.worksync_reject_contract_version_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Contract version snapshots are immutable' using errcode='55000';
end;
$$;
create trigger worksync_contract_versions_immutable
before update or delete on public.contract_versions
for each row execute function public.worksync_reject_contract_version_mutation();

-- Existing live contracts are few by PostgreSQL estimates (9 rows; about 80 KiB
-- total relation size). They are intentionally marked legacy; no proposed_plan
-- is silently promoted to a negotiated/accepted task plan.
insert into public.contract_versions(contract_id,version,snapshot,legacy,created_at)
select c.contract_id,1,jsonb_build_object(
  'finalPrice',c.final_price,'deliveryDays',c.delivery_time_days,
  'revisionsCount',c.revisions_count,'terms',c.terms,'taskPlan',null,
  'milestones',coalesce((select jsonb_agg(jsonb_build_object(
    'id',m.contract_milestone_id,'title',m.title,'description',m.description,
    'amount',m.amount,'dueDate',m.due_date,'displayOrder',m.display_order)
    order by m.display_order,m.contract_milestone_id)
    from public.contract_milestones m where m.contract_id=c.contract_id),'[]'::jsonb)
),true,c.created_at
from public.contracts c;

create table public.project_tasks (
  task_id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(project_id),
  source_version integer not null check (source_version > 0),
  source_key text not null,
  stage_id text not null,
  stage_name text not null,
  stage_order integer not null check (stage_order > 0),
  title text not null check (length(btrim(title)) between 1 and 160),
  description text not null default '' check (length(description) <= 1000),
  priority text not null check (priority in ('low','medium','high')),
  milestone_id uuid references public.milestones(milestone_id),
  due_date date,
  status text not null default 'todo'
    check (status in ('todo','in_progress','in_review','revision_requested','auto_approved','completed')),
  display_order integer not null check (display_order > 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id,source_version,source_key)
);
create table public.project_task_history (
  history_id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks(task_id),
  actor_id uuid references auth.users(id),
  from_status text,
  to_status text not null check (to_status in
    ('todo','in_progress','in_review','revision_requested','auto_approved','completed')),
  note text,
  submission_id uuid references public.project_submissions(submission_id),
  created_at timestamptz not null default now()
);
alter table public.project_submissions add column task_id uuid;
alter table public.project_submissions add constraint project_submissions_task_id_fkey
  foreign key (task_id) references public.project_tasks(task_id) not valid;
create index project_tasks_project_stage_order_idx
  on public.project_tasks(project_id,stage_order,display_order,task_id);
create index project_task_history_task_created_idx
  on public.project_task_history(task_id,created_at desc);
create index project_submissions_task_id_idx
  on public.project_submissions(task_id) where task_id is not null;
alter table public.project_submissions validate constraint project_submissions_task_id_fkey;

alter table public.project_tasks enable row level security;
alter table public.project_task_history enable row level security;
revoke all on public.project_tasks,public.project_task_history from public,anon,authenticated,service_role;
grant select on public.project_tasks,public.project_task_history to authenticated;
create policy project_tasks_participant_read on public.project_tasks for select to authenticated
  using (public.is_project_participant(project_id));
create policy project_task_history_participant_read on public.project_task_history for select to authenticated
  using (exists(select 1 from public.project_tasks t where t.task_id=project_task_history.task_id
    and public.is_project_participant(t.project_id)));

-- Plan wrapper stored in contracts.terms:
-- {schemaVersion:1,budget,deliveryDays,revisionsCount,projectTitle,description,
--  startDate,deadline,plan:{name,description,content:{columns:[
--  {id,name,type,tasks:[{id,title,description,priority,dueDate?,milestoneId?}]}]}}}
-- plan otherwise retains projectPlanSnapshotSchema's exact shape. dueDate and
-- milestoneId are the only task extensions. Exactly one final Done column is
-- required, with no tasks in Done. New plans require >=1 task, unique stage/task
-- ids, valid dates, and milestone references from p_milestones.
create or replace function public.worksync_validate_contract_plan(
  p_terms jsonb,p_milestones jsonb
) returns void language plpgsql immutable set search_path = '' as $$
declare cols jsonb; col jsonb; task jsonb; ids text[] := '{}'; stage_ids text[] := '{}'; milestone_ids text[] := '{}';
  milestone_orders integer[]:='{}'; done_count integer:=0; task_count integer:=0; ord integer:=0; tord integer; m_order integer;
  start_d date; end_d date; task_d date; mid uuid; m jsonb;
begin
  if p_terms->>'schemaVersion' is distinct from '1' then
    raise exception 'A new contract version requires schemaVersion 1' using errcode='22023';
  end if;
  if jsonb_typeof(p_milestones) is distinct from 'array'
     or jsonb_typeof(p_terms->'plan'->'content'->'columns') is distinct from 'array' then
    raise exception 'Plan columns and milestones must be arrays' using errcode='22023';
  end if;
  if length(btrim(coalesce(p_terms->>'projectTitle',''))) not between 1 and 200
     or coalesce(length(p_terms->>'description'),0)>10000
     or (p_terms->>'budget') is null or (p_terms->>'deliveryDays') is null
     or (p_terms->>'revisionsCount') is null
     or length(btrim(coalesce(p_terms->'plan'->>'name',''))) not between 1 and 120
     or coalesce(length(p_terms->'plan'->>'description'),0)>1500 then
    raise exception 'Contract title, description, budget, duration, and revision count are required' using errcode='22023';
  end if;
  if (p_terms->>'budget')::numeric<=0 or (p_terms->>'deliveryDays')::integer<1
     or (p_terms->>'budget')::numeric::text in ('NaN','Infinity','-Infinity')
     or (p_terms->>'revisionsCount')::integer<0 then
    raise exception 'Invalid contract budget, duration, or revision count' using errcode='22023';
  end if;
  begin
    start_d := nullif(p_terms->>'startDate','')::date;
    end_d := nullif(p_terms->>'deadline','')::date;
  exception when others then raise exception 'Contract dates must be valid ISO dates' using errcode='22023'; end;
  if (p_terms->>'startDate') is not null and start_d is null
     or (p_terms->>'deadline') is not null and end_d is null
     or start_d is not null and end_d is not null and end_d<start_d then
    raise exception 'Contract dates are invalid or out of order' using errcode='22023';
  end if;
  cols:=p_terms->'plan'->'content'->'columns';
  if jsonb_array_length(cols) not between 2 and 21 then raise exception 'Plan requires 1 to 20 stages plus Done' using errcode='22023'; end if;
  for col in select value from jsonb_array_elements(cols) loop
    ord:=ord+1;
    if length(coalesce(col->>'id','')) not between 1 and 80
       or length(btrim(coalesce(col->>'name',''))) not between 1 and 80
       or nullif(btrim(col->>'type'),'') is null
       or col->>'type' not in ('stage','done')
       or jsonb_typeof(col->'tasks') is distinct from 'array'
       or col->>'id'=any(stage_ids) then
      raise exception 'Plan stage is malformed or has a duplicate id' using errcode='22023';
    end if;
    stage_ids:=array_append(stage_ids,col->>'id');
    if col->>'type'='done' then
      done_count:=done_count+1;
      if ord<>jsonb_array_length(cols) or jsonb_array_length(col->'tasks')<>0 then
        raise exception 'Done must be the final column and contain no tasks' using errcode='22023';
      end if;
    end if;
    if jsonb_array_length(col->'tasks')>25 then raise exception 'A stage can contain at most 25 tasks' using errcode='22023'; end if;
    tord:=0;
    for task in select value from jsonb_array_elements(col->'tasks') loop
      tord:=tord+1; task_count:=task_count+1;
      if length(coalesce(task->>'id','')) not between 1 and 80
         or task->>'id'=any(ids)
         or length(btrim(coalesce(task->>'title',''))) not between 1 and 160
         or coalesce(length(task->>'description'),0)>1000
         or nullif(btrim(task->>'priority'),'') is null
         or task->>'priority' not in ('low','medium','high') then
        raise exception 'Plan task is malformed or has a duplicate id' using errcode='22023';
      end if;
      ids:=array_append(ids,task->>'id');
      if task ? 'dueDate' and task->>'dueDate' is not null then
        begin task_d:=(task->>'dueDate')::date;
        exception when others then raise exception 'Task due dates must be valid ISO dates' using errcode='22023'; end;
        if start_d is not null and task_d<start_d or end_d is not null and task_d>end_d then
          raise exception 'Task due date falls outside the contract dates' using errcode='22023';
        end if;
      end if;
      if task ? 'milestoneId' and nullif(task->>'milestoneId','') is not null then
        begin mid:=(task->>'milestoneId')::uuid;
        exception when others then raise exception 'Task milestoneId must be a UUID' using errcode='22023'; end;
        if not exists(select 1 from jsonb_array_elements(p_milestones) x
          where x->>'id'=mid::text) then
          raise exception 'Task refers to a milestone outside this contract version' using errcode='22023';
        end if;
      elsif jsonb_array_length(p_milestones)>0 then
        raise exception 'Every task in a milestone contract must reference a milestone' using errcode='22023';
      end if;
    end loop;
  end loop;
  if done_count<>1 or task_count not between 1 and 120 then
    raise exception 'Plan requires one final Done column and 1 to 120 tasks' using errcode='22023';
  end if;
  if stage_ids && ids then raise exception 'Stage ids and task ids must be distinct' using errcode='22023'; end if;
  ord:=0;
  for m in select value from jsonb_array_elements(p_milestones) loop
    ord:=ord+1;
    if length(coalesce(m->>'id',''))=0 or m->>'id'=any(milestone_ids)
       or length(btrim(coalesce(m->>'title',''))) not between 1 and 200
       or coalesce(length(m->>'description'),0)>5000 or (m->>'amount') is null
       or (m->>'amount')::numeric<=0 or (m->>'amount')::numeric::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Contract milestone is malformed' using errcode='22023';
    end if;
    begin mid:=(m->>'id')::uuid;
    exception when others then raise exception 'Milestone id must be a UUID' using errcode='22023'; end;
    milestone_ids:=array_append(milestone_ids,m->>'id');
    if m->>'displayOrder' is null then raise exception 'Milestone displayOrder is required' using errcode='22023'; end if;
    begin m_order:=(m->>'displayOrder')::integer;
    exception when others then raise exception 'Milestone order must be an integer' using errcode='22023'; end;
    if m_order<1 or m_order=any(milestone_orders) then raise exception 'Milestone order must be positive and unique' using errcode='22023'; end if;
    milestone_orders:=array_append(milestone_orders,m_order);
    if m ? 'dueDate' and nullif(m->>'dueDate','') is not null then
      begin task_d:=(m->>'dueDate')::date;
      exception when others then raise exception 'Milestone dates must be valid ISO dates' using errcode='22023'; end;
      if start_d is not null and task_d<start_d or end_d is not null and task_d>end_d then
        raise exception 'Milestone due date falls outside contract dates' using errcode='22023'; end if;
    end if;
  end loop;
  if coalesce((select sum((value->>'amount')::numeric) from jsonb_array_elements(p_milestones)),0)
       > (p_terms->>'budget')::numeric then
    raise exception 'Contract milestone total exceeds contract budget' using errcode='22023';
  end if;
  if jsonb_array_length(p_milestones)>0 and
    coalesce((select sum((value->>'amount')::numeric) from jsonb_array_elements(p_milestones)),0)
      <> (p_terms->>'budget')::numeric then
    raise exception 'Milestone allocations must equal the contract budget' using errcode='22023';
  end if;
end;
$$;
revoke all on function public.worksync_validate_contract_plan(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.worksync_store_contract_version(
  p_contract_id uuid,p_version integer,p_request_id uuid,p_legacy boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare c public.contracts; terms_json jsonb; milestone_json jsonb; snap jsonb;
begin
  select * into c from public.contracts where contract_id=p_contract_id;
  terms_json:=public.worksync_safe_contract_json(c.terms);
  select coalesce(jsonb_agg(jsonb_build_object('id',m.contract_milestone_id,'title',m.title,
    'description',m.description,'amount',m.amount,'dueDate',m.due_date,'displayOrder',m.display_order)
    order by m.display_order,m.contract_milestone_id),'[]'::jsonb)
  into milestone_json from public.contract_milestones m where m.contract_id=p_contract_id;
  if not p_legacy then perform public.worksync_validate_contract_plan(terms_json,milestone_json); end if;
  snap:=jsonb_build_object('finalPrice',c.final_price,'deliveryDays',c.delivery_time_days,
    'revisionsCount',c.revisions_count,'terms',terms_json,
    'taskPlan',case when p_legacy then null else terms_json->'plan' end,
    'milestones',milestone_json);
  insert into public.contract_versions(contract_id,version,request_id,snapshot,legacy,created_by)
  values(p_contract_id,p_version,p_request_id,snap,p_legacy,auth.uid());
end;
$$;
revoke all on function public.worksync_store_contract_version(uuid,integer,uuid,boolean) from public,anon,authenticated;

-- Preserve the existing reset behavior. Bulk version writes perform the same
-- invalidation once after all rows have changed; direct legacy edits retain the
-- old trigger's row-level behavior.
create or replace function public.worksync_reset_contract_confirmations()
returns trigger language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare cid uuid; item text; internal_write boolean;
begin
  cid:=case when tg_table_name='contracts' then new.contract_id
    when tg_op='DELETE' then old.contract_id else new.contract_id end;
  internal_write:=exists(select 1 from public.worksync_workflow_write_context x
    where x.backend_pid=pg_backend_pid() and x.transaction_id=txid_current()
      and x.object_id=cid and x.purpose='contract_version');
  if internal_write then return case when tg_op='DELETE' then old else new end; end if;
  if tg_table_name='contracts' then
    if new.final_price is distinct from old.final_price or new.delivery_time_days is distinct from old.delivery_time_days
      or new.revisions_count is distinct from old.revisions_count or new.terms is distinct from old.terms then
      update public.contract_item_approvals set client_approved_at=null,freelancer_approved_at=null where contract_id=new.contract_id;
      new.client_signed_at:=null; new.freelancer_signed_at:=null;
      if new.status='active'::public.contract_status then new.status:='pending'::public.contract_status; end if;
    end if;
    return new;
  end if;
  item:='milestone:'||(case when tg_op='DELETE' then old.contract_milestone_id else new.contract_milestone_id end)::text;
  update public.contract_item_approvals set client_approved_at=null,freelancer_approved_at=null
    where contract_id=cid and item_key=item;
  update public.contracts set client_signed_at=null,freelancer_signed_at=null,status='pending'::public.contract_status
    where contract_id=cid and status='active'::public.contract_status;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create or replace function public.worksync_invalidate_and_version_contract(p_contract uuid,p_request uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v integer; legacy_terms boolean; c public.contracts;
begin
  select * into c from public.contracts where contract_id=p_contract for update;
  if c.contract_id is null then return; end if;
  legacy_terms:=public.worksync_safe_contract_json(c.terms)->>'schemaVersion' is distinct from '1';
  insert into public.worksync_workflow_write_context values(pg_backend_pid(),txid_current(),p_contract,'contract_version')
    on conflict do nothing;
  update public.contract_item_approvals set client_approved_at=null,freelancer_approved_at=null
    where contract_id=p_contract and (client_approved_at is not null or freelancer_approved_at is not null);
  update public.contracts set current_version=current_version+1,client_signed_at=null,freelancer_signed_at=null,
    client_signed_version=null,freelancer_signed_version=null
    where contract_id=p_contract returning current_version into v;
  perform public.worksync_store_contract_version(p_contract,v,p_request,legacy_terms);
  delete from public.worksync_workflow_write_context where backend_pid=pg_backend_pid()
    and transaction_id=txid_current() and object_id=p_contract and purpose='contract_version';
end;
$$;
revoke all on function public.worksync_invalidate_and_version_contract(uuid,uuid) from public,anon,authenticated;

create or replace function public.worksync_capture_contract_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare material boolean; ver integer; t jsonb; legacy boolean;
begin
  if tg_op='INSERT' then
    t:=public.worksync_safe_contract_json(new.terms);
    legacy:=t->>'schemaVersion' is distinct from '1';
    -- The version writer validates the persisted contract and milestone rows
    -- together; validating the terms here against an artificial empty
    -- milestone array duplicates that work and cannot check their references.
    perform public.worksync_store_contract_version(new.contract_id,new.current_version,null,legacy);
    return new;
  end if;
  material:=row(new.final_price,new.delivery_time_days,new.revisions_count,new.terms)
    is distinct from row(old.final_price,old.delivery_time_days,old.revisions_count,old.terms);
  if not material or exists(select 1 from public.worksync_workflow_write_context x
    where x.backend_pid=pg_backend_pid() and x.transaction_id=txid_current()
      and x.object_id=new.contract_id and x.purpose='contract_version') then return new; end if;
  ver:=old.current_version+1;
  perform public.worksync_invalidate_and_version_contract(new.contract_id,null);
  return new;
end;
$$;
create trigger worksync_contract_version_capture
after insert or update of final_price,delivery_time_days,revisions_count,terms on public.contracts
for each row execute function public.worksync_capture_contract_version();

-- Statement-level transition tables make one version per multi-row milestone edit.
create or replace function public.worksync_capture_milestone_statement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record; v integer;
begin
  if exists(select 1 from public.worksync_workflow_write_context x
    where x.backend_pid=pg_backend_pid() and x.transaction_id=txid_current()
      and x.purpose='contract_version') then return null; end if;
  for r in
    select contract_id from old_rows union select contract_id from new_rows
  loop
    perform public.worksync_invalidate_and_version_contract(r.contract_id,null);
  end loop;
  return null;
end;
$$;
create trigger worksync_contract_milestone_update_version
after update on public.contract_milestones referencing old table as old_rows new table as new_rows
for each statement execute function public.worksync_capture_milestone_statement();
-- INSERT and DELETE need event-specific transition relations.
create or replace function public.worksync_capture_milestone_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record; v integer;
begin
  if exists(select 1 from public.worksync_workflow_write_context x where x.backend_pid=pg_backend_pid()
    and x.transaction_id=txid_current() and x.purpose='contract_version') then return null; end if;
  for r in select distinct contract_id from new_rows loop
    perform public.worksync_invalidate_and_version_contract(r.contract_id,null);
  end loop;
  return null;
end;
$$;
create trigger worksync_contract_milestone_insert_version after insert on public.contract_milestones
referencing new table as new_rows for each statement execute function public.worksync_capture_milestone_insert();
create or replace function public.worksync_capture_milestone_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record; v integer;
begin
  if exists(select 1 from public.worksync_workflow_write_context x where x.backend_pid=pg_backend_pid()
    and x.transaction_id=txid_current() and x.purpose='contract_version') then return null; end if;
  for r in select distinct contract_id from old_rows loop
    perform public.worksync_invalidate_and_version_contract(r.contract_id,null);
  end loop;
  return null;
end;
$$;
create trigger worksync_contract_milestone_delete_version after delete on public.contract_milestones
referencing old table as old_rows for each statement execute function public.worksync_capture_milestone_delete();

create or replace function public.worksync_save_contract_version(
  p_contract_id uuid,p_expected_version integer,p_request_id uuid,p_terms jsonb,p_milestones jsonb
) returns integer language plpgsql security definer set search_path = '' as $$
declare c public.contracts; m jsonb; next_v integer; existing integer;
begin
  if auth.uid() is null or public.worksync_contract_party(p_contract_id) is null then
    raise exception 'Only a signed-in contract participant may save terms' using errcode='42501'; end if;
  if p_request_id is null then raise exception 'Request id is required for retry-safe saves' using errcode='22023'; end if;
  select version into existing from public.contract_versions where contract_id=p_contract_id and request_id=p_request_id;
  if existing is not null then return existing; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_contract_id::text,0));
  select version into existing from public.contract_versions where contract_id=p_contract_id and request_id=p_request_id;
  if existing is not null then return existing; end if;
  select * into c from public.contracts where contract_id=p_contract_id for update;
  if c.contract_id is null then raise exception 'Contract not found' using errcode='P0002'; end if;
  if c.current_version<>p_expected_version then raise exception 'Contract version changed; reload before saving' using errcode='40001'; end if;
  if c.status::text in ('active','completed','rejected','cancelled') then raise exception 'Final contracts cannot be edited' using errcode='42501'; end if;
  perform public.worksync_validate_contract_plan(p_terms,p_milestones);
  if exists(select 1 from jsonb_array_elements(p_milestones) x join public.contract_milestones cm
    on cm.contract_milestone_id=(x->>'id')::uuid where cm.contract_id<>p_contract_id) then
    raise exception 'Milestone belongs to another contract' using errcode='42501'; end if;
  insert into public.worksync_workflow_write_context values(pg_backend_pid(),txid_current(),p_contract_id,'contract_version');
  next_v:=c.current_version+1;
  update public.contracts set final_price=(p_terms->>'budget')::numeric,
    delivery_time_days=(p_terms->>'deliveryDays')::integer,
    revisions_count=(p_terms->>'revisionsCount')::integer,terms=p_terms::text,
    current_version=next_v,client_signed_at=null,freelancer_signed_at=null,
    client_signed_version=null,freelancer_signed_version=null,updated_at=now()
    where contract_id=p_contract_id;
  for m in select value from jsonb_array_elements(p_milestones) loop
    insert into public.contract_milestones(contract_milestone_id,contract_id,title,description,amount,due_date,display_order)
    values((m->>'id')::uuid,p_contract_id,m->>'title',m->>'description',(m->>'amount')::numeric,
      nullif(m->>'dueDate','')::date,(m->>'displayOrder')::integer)
    on conflict (contract_milestone_id) do update set title=excluded.title,
      description=excluded.description,amount=excluded.amount,due_date=excluded.due_date,
      display_order=excluded.display_order where public.contract_milestones.contract_id=p_contract_id;
  end loop;
  delete from public.contract_milestones cm where cm.contract_id=p_contract_id
    and not exists(select 1 from jsonb_array_elements(p_milestones) x where x->>'id'=cm.contract_milestone_id::text);
  update public.contract_item_approvals set client_approved_at=null,freelancer_approved_at=null
    where contract_id=p_contract_id and (client_approved_at is not null or freelancer_approved_at is not null);
  perform public.worksync_store_contract_version(p_contract_id,next_v,p_request_id,false);
  delete from public.worksync_workflow_write_context where backend_pid=pg_backend_pid()
    and transaction_id=txid_current() and object_id=p_contract_id and purpose='contract_version';
  return next_v;
end;
$$;
revoke all on function public.worksync_save_contract_version(uuid,integer,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.worksync_save_contract_version(uuid,integer,uuid,jsonb,jsonb) to authenticated;

-- Bind acceptance to the current version and disallow caller-supplied timestamps
-- or version numbers. Existing contracts_update guard still checks party identity.
create or replace function public.worksync_contract_version_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare internal_write boolean;
begin
  internal_write:=exists(select 1 from public.worksync_workflow_write_context x
    where x.backend_pid=pg_backend_pid() and x.transaction_id=txid_current()
      and x.object_id=old.contract_id and x.purpose='contract_version');
  if new.current_version is distinct from old.current_version and not internal_write then
    raise exception 'Contract version is database-managed' using errcode='42501'; end if;
  if not internal_write then
    if new.client_signed_version is distinct from old.client_signed_version
       or new.freelancer_signed_version is distinct from old.freelancer_signed_version then
      raise exception 'Acceptance versions are database-managed' using errcode='42501'; end if;
    if new.client_signed_at is distinct from old.client_signed_at then
      if new.client_signed_at is not null and public.worksync_contract_party(old.contract_id)<>'client' then
        raise exception 'Only the client can accept for the client' using errcode='42501'; end if;
      new.client_signed_at:=case when new.client_signed_at is null then null else clock_timestamp() end;
      new.client_signed_version:=case when new.client_signed_at is null then null else new.current_version end;
    end if;
    if new.freelancer_signed_at is distinct from old.freelancer_signed_at then
      if new.freelancer_signed_at is not null and public.worksync_contract_party(old.contract_id)<>'freelancer' then
        raise exception 'Only the freelancer can accept for the freelancer' using errcode='42501'; end if;
      new.freelancer_signed_at:=case when new.freelancer_signed_at is null then null else clock_timestamp() end;
      new.freelancer_signed_version:=case when new.freelancer_signed_at is null then null else new.current_version end;
    end if;
  end if;
  if new.status='active' and (new.client_signed_at is null or new.freelancer_signed_at is null
     or new.client_signed_version is distinct from new.current_version
     or new.freelancer_signed_version is distinct from new.current_version) then
    raise exception 'Both parties must accept the current version' using errcode='P0007'; end if;
  return new;
end;
$$;
create trigger worksync_contract_version_guard before update on public.contracts
for each row execute function public.worksync_contract_version_guard();

create or replace function public.worksync_guard_task_review_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.task_id is null or new.status is not distinct from old.status then return new; end if;
  if auth.role()='service_role' and old.status='submitted' and new.status='approved'
     and new.auto_reviewed_at is not null and new.reviewed_at is not null then return new; end if;
  if exists(select 1 from public.worksync_workflow_write_context x where x.backend_pid=pg_backend_pid()
    and x.transaction_id=txid_current() and x.object_id=new.submission_id and x.purpose='submission_review') then return new; end if;
  raise exception 'Task-linked submission reviews must use the existing review RPC' using errcode='42501';
end;
$$;
create trigger worksync_guard_task_submission_review
before update of status on public.project_submissions
for each row execute function public.worksync_guard_task_review_write();

-- Preserve the API's three-argument review RPC and add a private write marker
-- only around its status update. Its project, revision-limit, payout-hold,
-- latest-delivery, milestone, and notification logic remains the live logic.
create or replace function public.worksync_review_submission(p_submission uuid,p_action text,p_instructions text)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.project_submissions; p public.projects; revision_limit integer; used integer; recipient uuid; locked uuid;
begin
  select * into s from public.project_submissions where submission_id=p_submission;
  select * into p from public.projects where project_id=s.project_id;
  select contract_id into locked from public.contracts where order_id=p.order_id for update;
  select * into p from public.projects where project_id=s.project_id for update;
  if public.worksync_order_on_hold(p.order_id) then raise exception 'Delivery decisions are paused pending resolution'; end if;
  select * into s from public.project_submissions where submission_id=p_submission for update;
  if public.worksync_project_party(s.project_id) is distinct from 'client' or p.status::text not in ('active','in_progress','revision') or s.kind<>'delivery' or s.status<>'submitted' then raise exception 'Delivery cannot be reviewed'; end if;
  if s.milestone_id is null and exists(select 1 from public.milestones where project_id=s.project_id) then raise exception 'Choose a milestone for this delivery'; end if;
  if s.milestone_id is not null and not exists(select 1 from public.milestones where milestone_id=s.milestone_id and project_id=s.project_id and status::text not in ('approved','completed')) then raise exception 'Milestone unavailable or already approved'; end if;
  if exists(select 1 from public.project_submissions newer where newer.project_id=s.project_id and newer.milestone_id is not distinct from s.milestone_id and newer.kind='delivery' and newer.created_at>s.created_at) then raise exception 'Review the latest delivery'; end if;
  if p_action='revision' then
    if length(p_instructions)>5000 or coalesce(length(trim(p_instructions)),0)=0 then raise exception 'Valid revision instructions are required'; end if;
    select revisions_count into revision_limit from public.contracts where order_id=p.order_id;
    select count(*) into used from public.revision_requests where project_id=s.project_id;
    if revision_limit is null or used>=revision_limit then raise exception 'The agreed revision limit has been reached or is not set'; end if;
    insert into public.revision_requests(project_id,submission_id,requested_by,instructions,status) values(s.project_id,p_submission,auth.uid(),p_instructions,'open');
  elsif p_action<>'approve' then raise exception 'Invalid review action'; end if;
  insert into public.worksync_workflow_write_context values(pg_backend_pid(),txid_current(),p_submission,'submission_review');
  update public.project_submissions set status=case when p_action='approve' then 'approved' else 'revision_requested' end,reviewed_at=now() where submission_id=p_submission;
  delete from public.worksync_workflow_write_context where backend_pid=pg_backend_pid() and transaction_id=txid_current() and object_id=p_submission and purpose='submission_review';
  if s.milestone_id is not null then update public.milestones set status=case when p_action='approve' then 'approved'::public.milestone_status else 'revision_requested'::public.milestone_status end where milestone_id=s.milestone_id and project_id=s.project_id; end if;
  if p_action='revision' then update public.projects set status='revision',updated_at=now() where project_id=s.project_id; end if;
  if p_action='approve' and (s.milestone_id is null or not exists(select 1 from public.milestones where project_id=s.project_id and status::text not in ('approved','completed'))) then
    update public.projects set status='completed',completed_at=now(),updated_at=now() where project_id=s.project_id;
    update public.service_orders set status='completed',updated_at=now() where order_id=p.order_id;
    update public.contracts set status='completed',updated_at=now() where order_id=p.order_id;
  end if;
  select user_id into recipient from public.freelancer_profiles where freelancer_id=p.freelancer_id;
  insert into public.notifications(user_id,type,title,message,related_id,is_read) values(recipient,'project_update',case when p_action='approve' then 'Delivery approved' else 'Revision requested' end,'Open the project workspace for details.',p.order_id,false);
end;
$$;

-- Keep the legacy boolean overload functional and marker-protected as well.
create or replace function public.worksync_review_submission(p_submission_id uuid,p_approve boolean,p_instructions text default null)
returns public.project_submissions language plpgsql security definer set search_path = 'pg_catalog','public','auth' as $$
declare s public.project_submissions; p public.projects; revision_limit integer; used integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into s from public.project_submissions where submission_id=p_submission_id for update;
  if s.submission_id is null then raise exception 'Submission not found' using errcode='P0002'; end if;
  select * into p from public.projects where project_id=s.project_id for update;
  if not exists(select 1 from public.client_profiles where client_id=p.client_id and user_id=auth.uid()) then raise exception 'Only the project client may review submissions' using errcode='42501'; end if;
  if p.status::text not in ('active','revision') or s.status not in ('submitted','revision_requested') or p_approve is null then raise exception 'Submission is not eligible for review' using errcode='22023'; end if;
  if not p_approve and (p_instructions is null or length(btrim(p_instructions))=0 or length(p_instructions)>5000) then raise exception 'Revision instructions are required' using errcode='22023'; end if;
  if s.task_id is not null then
    if public.worksync_order_on_hold(p.order_id) then raise exception 'Delivery decisions are paused pending resolution' using errcode='42501'; end if;
    if exists(select 1 from public.project_submissions newer where newer.project_id=s.project_id
      and newer.milestone_id is not distinct from s.milestone_id and newer.kind='delivery'
      and newer.created_at>s.created_at) then raise exception 'Review the latest delivery' using errcode='22023'; end if;
    if not p_approve then
      select revisions_count into revision_limit from public.contracts c
        where c.order_id=p.order_id or c.application_id=p.application_id order by c.created_at limit 1;
      select count(*) into used from public.revision_requests where project_id=s.project_id;
      if revision_limit is null or used>=revision_limit then raise exception 'The agreed revision limit has been reached or is not set'; end if;
    end if;
  end if;
  if not p_approve then insert into public.revision_requests(project_id,submission_id,requested_by,instructions,status) values(p.project_id,p_submission_id,auth.uid(),p_instructions,'open'); end if;
  insert into public.worksync_workflow_write_context values(pg_backend_pid(),txid_current(),p_submission_id,'submission_review');
  update public.project_submissions set status=case when p_approve then 'approved' else 'revision_requested' end,reviewed_at=now() where submission_id=p_submission_id returning * into s;
  delete from public.worksync_workflow_write_context where backend_pid=pg_backend_pid() and transaction_id=txid_current() and object_id=p_submission_id and purpose='submission_review';
  if s.milestone_id is not null then update public.milestones set status=case when p_approve then 'approved'::public.milestone_status else 'revision_requested'::public.milestone_status end where milestone_id=s.milestone_id; end if;
  if not p_approve then update public.projects set status='revision',updated_at=now() where project_id=p.project_id; end if;
  return s;
end;
$$;

-- Keep the existing activation check, adding exact-version acceptance.
create or replace function public.worksync_guard_contract(p_contract_id uuid)
returns void language plpgsql security definer set search_path = 'pg_catalog','public','auth' as $$
declare c public.contracts; n bigint;
begin
  select * into c from public.contracts where contract_id=p_contract_id for update;
  if c.contract_id is null then raise exception 'Contract not found' using errcode='P0002'; end if;
  if auth.uid() is null or public.worksync_contract_party(p_contract_id) is null then
    raise exception 'Only a contract participant may activate this contract' using errcode='42501'; end if;
  select count(*) into n from (
    select 'budget' k union all select 'delivery' union all select 'revisions'
    union all select 'milestone:'||m.contract_milestone_id::text from public.contract_milestones m where m.contract_id=p_contract_id
  ) q left join public.contract_item_approvals a on a.contract_id=p_contract_id and a.item_key=q.k
  where a.client_approved_at is null or a.freelancer_approved_at is null;
  if n>0 then raise exception 'Required contract item approvals are incomplete' using errcode='P0007'; end if;
  if not exists(select 1 from public.service_orders so join public.client_profiles cp on cp.client_id=so.client_id where so.order_id=c.order_id)
     and not exists(select 1 from public.job_applications a join public.jobs j on j.job_id=a.job_id join public.client_profiles cp on cp.client_id=j.client_id where a.application_id=c.application_id) then
    raise exception 'Contract client is missing';
  end if;
  if not exists(select 1 from public.service_orders so join public.freelancer_profiles fp on fp.freelancer_id=so.freelancer_id where so.order_id=c.order_id)
     and not exists(select 1 from public.job_applications a join public.freelancer_profiles fp on fp.freelancer_id=a.freelancer_id where a.application_id=c.application_id) then
    raise exception 'Contract freelancer is missing';
  end if;
  if c.client_signed_at is null or c.freelancer_signed_at is null
     or c.client_signed_version is distinct from c.current_version
     or c.freelancer_signed_version is distinct from c.current_version then
    raise exception 'Both parties must accept the current contract version' using errcode='P0007'; end if;
end;
$$;
revoke all on function public.worksync_guard_contract(uuid) from public,anon,authenticated,service_role;

create or replace function public.worksync_contract_status_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare project_done boolean; ord uuid; marker_purpose text; expected_order_status text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if old.status::text in ('rejected','cancelled','completed') then raise exception 'Contract status is final' using errcode='22023'; end if;
  if new.status::text='active' then
    if not exists(select 1 from public.worksync_workflow_write_context x where x.backend_pid=pg_backend_pid()
      and x.transaction_id=txid_current() and x.object_id=old.contract_id and x.purpose='activation') then
      raise exception 'Use the contract activation RPC to activate an agreement' using errcode='42501'; end if;
    perform public.worksync_guard_contract(old.contract_id);
    if (select count(*) from public.projects p where
      ((old.order_id is not null and p.order_id=old.order_id) or
       (old.application_id is not null and p.application_id=old.application_id)) and p.status::text='active')<>1 then
      raise exception 'Activate through worksync_activate_contract so exactly one active project exists' using errcode='42501'; end if;
    return new;
  elsif new.status::text in ('pending_client','rejected') then
    marker_purpose:='service_response';
    expected_order_status:=case when new.status::text='pending_client' then 'accepted' else 'rejected' end;
    if old.order_id is null or not exists(select 1 from public.worksync_workflow_write_context x
      where x.backend_pid=pg_backend_pid() and x.transaction_id=txid_current()
        and x.object_id=old.order_id and x.purpose=marker_purpose)
       or not exists(select 1 from public.service_orders so
         where so.order_id=old.order_id and so.status::text=expected_order_status) then
      raise exception 'Use the authorized service-response workflow to change this contract status' using errcode='42501'; end if;
    return new;
  elsif new.status::text='cancelled' then
    if old.order_id is null or not exists(select 1 from public.worksync_workflow_write_context x
      where x.backend_pid=pg_backend_pid() and x.transaction_id=txid_current()
        and x.object_id=old.order_id and x.purpose='contract_cancel')
       or not exists(select 1 from public.service_orders so
         where so.order_id=old.order_id and so.status::text='cancelled') then
      raise exception 'Use the authorized cancellation workflow to cancel this contract' using errcode='42501'; end if;
    return new;
  elsif old.status::text='active' and new.status::text='completed' then
    select p.order_id into ord from public.projects p where
      (old.order_id is not null and p.order_id=old.order_id) or
      (old.application_id is not null and p.application_id=old.application_id) order by p.created_at limit 1;
    select exists(select 1 from public.projects p where
      ((old.order_id is not null and p.order_id=old.order_id) or
       (old.application_id is not null and p.application_id=old.application_id)) and p.status::text='completed') into project_done;
    if not project_done or public.worksync_order_on_hold(ord) then raise exception 'Project completion or payout hold prevents contract completion' using errcode='42501'; end if;
    if auth.role()<>'service_role' and public.worksync_contract_party(old.contract_id)<>'client' then raise exception 'Only the client may complete this contract' using errcode='42501'; end if;
    return new;
  end if;
  if old.status::text='active' then raise exception 'An active contract cannot return to negotiation' using errcode='22023'; end if;
  raise exception 'Contract status changes must use their authorized workflow' using errcode='42501';
end;
$$;
create trigger worksync_contract_status_guard before update of status on public.contracts
for each row execute function public.worksync_contract_status_guard();

-- Preserve the live completion exceptions while still requiring an already
-- completed project and a clear payout hold for both the client RPC and worker.
create or replace function public.worksync_guard_contract_update()
returns trigger language plpgsql security definer set search_path = 'pg_catalog','public','auth' as $$
declare v_party text; project_done boolean;
begin
  -- The migration backfill and trusted version writer may update only the
  -- signer-version markers while holding this private transaction marker.
  -- The version guard independently verifies database-managed version fields.
  if exists(select 1 from public.worksync_workflow_write_context x
       where x.backend_pid=pg_backend_pid() and x.transaction_id=txid_current()
         and x.object_id=old.contract_id and x.purpose='contract_version')
     and (to_jsonb(new)-'client_signed_version'-'freelancer_signed_version')
         is not distinct from (to_jsonb(old)-'client_signed_version'-'freelancer_signed_version') then
    return new;
  end if;
  if old.status::text='active' and new.status::text='cancelled'
     and (to_jsonb(new)-'status'-'updated_at')=(to_jsonb(old)-'status'-'updated_at')
     and old.order_id is not null
     and exists(select 1 from public.worksync_workflow_write_context x
       where x.backend_pid=pg_backend_pid() and x.transaction_id=txid_current()
         and x.object_id=old.order_id and x.purpose='contract_cancel')
     and exists(select 1 from public.service_orders so
       where so.order_id=old.order_id and so.status::text='cancelled') then
    return new;
  end if;
  if old.status::text='active' and new.status::text='completed'
     and (to_jsonb(new)-'status'-'updated_at')=(to_jsonb(old)-'status'-'updated_at') then
    select exists(select 1 from public.projects p where
      ((old.order_id is not null and p.order_id=old.order_id) or
       (old.application_id is not null and p.application_id=old.application_id))
      and p.status::text='completed') into project_done;
    if project_done and not public.worksync_order_on_hold(old.order_id)
      and (auth.role()='service_role' or public.worksync_contract_party(old.contract_id)='client') then return new; end if;
  end if;
  if public.worksync_is_admin() then return new; end if;
  v_party:=public.worksync_contract_party(old.contract_id);
  if v_party is null then raise exception 'Only a contract participant may edit this contract' using errcode='42501'; end if;
  if old.status::text in ('active','completed') then raise exception 'Finalized contracts cannot be edited' using errcode='42501'; end if;
  if new.contract_id is distinct from old.contract_id or new.order_id is distinct from old.order_id
     or new.application_id is distinct from old.application_id or new.created_at is distinct from old.created_at then
    raise exception 'Contract identity fields cannot be changed' using errcode='42501'; end if;
  if v_party='client' and new.freelancer_signed_at is distinct from old.freelancer_signed_at then
    raise exception 'A client cannot change the freelancer signature' using errcode='42501'; end if;
  if v_party='freelancer' and new.client_signed_at is distinct from old.client_signed_at then
    raise exception 'A freelancer cannot change the client signature' using errcode='42501'; end if;
  return new;
end;
$$;

-- Bind pre-existing signatures to version 1 only after the version and update
-- guards are installed. The private context bypasses participant-only UPDATE
-- checks for these two database-managed columns, then is removed in this same
-- transaction. No timestamps or existing signature values are changed.
insert into public.worksync_workflow_write_context(backend_pid,transaction_id,object_id,purpose)
select pg_backend_pid(),txid_current(),c.contract_id,'contract_version'
from public.contracts c
where c.client_signed_at is not null or c.freelancer_signed_at is not null
on conflict do nothing;
update public.contracts c set
  client_signed_version=case when c.client_signed_at is null then null else c.current_version end,
  freelancer_signed_version=case when c.freelancer_signed_at is null then null else c.current_version end
where c.client_signed_at is not null or c.freelancer_signed_at is not null;
delete from public.worksync_workflow_write_context
where backend_pid=pg_backend_pid() and transaction_id=txid_current()
  and purpose='contract_version';

-- Preserve the existing order/application path and all current contract guards,
-- but take dates from the accepted terms and keep existing dates on legacy retry.
create or replace function public.worksync_activate_contract(p_contract_id uuid)
returns public.projects language plpgsql security definer
set search_path = 'pg_catalog','public','auth' as $$
declare c public.contracts; so public.service_orders; a public.job_applications; j public.jobs;
  s public.services; cid uuid; fid uuid; oid uuid; pid uuid; p public.projects;
  terms_json jsonb:='{}'::jsonb; project_title text; st date; dl date; cm public.contract_milestones;
  matches integer; v public.contract_versions;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_contract_id::text,0));
  select * into c from public.contracts where contract_id=p_contract_id for update;
  if c.contract_id is null then raise exception 'Contract not found' using errcode='P0002'; end if;
  if c.status::text in ('rejected','cancelled') then raise exception 'Rejected or cancelled contracts cannot be activated' using errcode='22023'; end if;
  if c.order_id is not null then
    select * into so from public.service_orders where order_id=c.order_id for update;
    cid:=so.client_id; fid:=so.freelancer_id; oid:=so.order_id;
    select * into s from public.services where service_id=so.service_id;
  else
    select * into a from public.job_applications where application_id=c.application_id for update;
    select * into j from public.jobs where job_id=a.job_id;
    cid:=j.client_id; fid:=a.freelancer_id;
    select * into so from public.service_orders where application_id=c.application_id for update;
    if so.order_id is null then
      insert into public.service_orders(job_id,application_id,client_id,freelancer_id,status)
        values(a.job_id,a.application_id,cid,fid,'pending') returning * into so;
    end if;
    oid:=so.order_id;
  end if;
  perform public.worksync_guard_contract(p_contract_id);
  select * into v from public.contract_versions where contract_id=p_contract_id and version=c.current_version;
  if v.contract_id is null then raise exception 'Current contract snapshot is missing'; end if;
  terms_json:=public.worksync_safe_contract_json(c.terms);
  if not v.legacy then perform public.worksync_validate_contract_plan(terms_json,v.snapshot->'milestones'); end if;
  st:=coalesce(nullif(terms_json->>'startDate','')::date,current_date);
  dl:=coalesce(nullif(terms_json->>'deadline','')::date,st+c.delivery_time_days);
  project_title:=coalesce(nullif(trim(terms_json->>'projectTitle'),''),nullif(trim(j.title),''),nullif(trim(s.title),''),'WorkSync project');
  select count(*) into matches from public.projects x where
    (c.order_id is not null and x.order_id=oid) or
    (c.application_id is not null and x.application_id=c.application_id);
  if matches>1 then raise exception 'Contract maps to multiple projects' using errcode='23514'; end if;
  select * into p from public.projects x where
    (c.order_id is not null and x.order_id=oid) or
    (c.application_id is not null and x.application_id=c.application_id) for update;
  if c.status::text='completed' and p.project_id is null then raise exception 'Completed contract has no project'; end if;
  if p.project_id is not null and (c.status::text='completed' or p.status::text='completed') then return p; end if;
  if p.project_id is null then
    insert into public.projects(freelancer_id,client_id,title,description,budget,status,start_date,due_date,order_id,application_id)
    values(fid,cid,project_title,coalesce(nullif(terms_json->>'description',''),j.description,s.description,c.terms),
      c.final_price,'active',st,dl,case when c.order_id is not null then oid end,
      case when c.application_id is not null then c.application_id end) returning * into p;
  else
    update public.projects x set freelancer_id=fid,client_id=cid,title=project_title,
      description=coalesce(nullif(terms_json->>'description',''),x.description,j.description,s.description,c.terms),
      budget=c.final_price,status='active',
      start_date=coalesce(nullif(terms_json->>'startDate','')::date,x.start_date,st),
      due_date=coalesce(nullif(terms_json->>'deadline','')::date,x.due_date,dl),updated_at=now()
      where x.project_id=p.project_id returning * into p;
  end if;
  if v.legacy then
    insert into public.milestones(project_id,title,description,amount,due_date,display_order,status)
    select p.project_id,m.title,m.description,m.amount,m.due_date,m.display_order,'pending'::public.milestone_status
    from public.contract_milestones m where m.contract_id=p_contract_id and not exists(
      select 1 from public.milestones x where x.project_id=p.project_id and x.title=m.title and x.display_order=m.display_order);
  else
    for cm in select * from public.contract_milestones where contract_id=p_contract_id order by display_order,contract_milestone_id loop
      select count(*) into matches from public.milestones pm where pm.project_id=p.project_id
        and (pm.source_contract_milestone_id=cm.contract_milestone_id or
          (pm.title=cm.title and pm.display_order=cm.display_order));
      if matches>1 then raise exception 'Contract milestone maps ambiguously to project milestones' using errcode='23514'; end if;
      if matches=1 then
        update public.milestones pm set source_contract_milestone_id=cm.contract_milestone_id
          where pm.project_id=p.project_id and pm.source_contract_milestone_id is null
            and pm.title=cm.title and pm.display_order=cm.display_order;
      else
        insert into public.milestones(project_id,title,description,amount,due_date,display_order,status,source_contract_milestone_id)
        values(p.project_id,cm.title,cm.description,cm.amount,cm.due_date,cm.display_order,
          'pending'::public.milestone_status,cm.contract_milestone_id);
      end if;
    end loop;
  end if;
  insert into public.worksync_workflow_write_context values(pg_backend_pid(),txid_current(),p_contract_id,'activation');
  update public.contracts set status='active'::public.contract_status,updated_at=now() where contract_id=p_contract_id;
  delete from public.worksync_workflow_write_context where backend_pid=pg_backend_pid()
    and transaction_id=txid_current() and object_id=p_contract_id and purpose='activation';
  update public.service_orders set status='converted',updated_at=now() where order_id=oid;
  return p;
end;
$$;
grant execute on function public.worksync_activate_contract(uuid) to authenticated,service_role;

-- Task milestone mapping is explicit, never inferred by title alone.
alter table public.milestones add column source_contract_milestone_id uuid;
alter table public.milestones add constraint milestones_source_contract_milestone_id_fkey
  foreign key (source_contract_milestone_id) references public.contract_milestones(contract_milestone_id) not valid;
alter table public.milestones validate constraint milestones_source_contract_milestone_id_fkey;
create unique index milestones_contract_source_unique
  on public.milestones(project_id,source_contract_milestone_id)
  where source_contract_milestone_id is not null;

create or replace function public.worksync_set_project_task_status(p_task_id uuid,p_status text,p_note text default null)
returns public.project_tasks language plpgsql security definer set search_path = '' as $$
declare t public.project_tasks; party text; prev text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into t from public.project_tasks where task_id=p_task_id for update;
  if t.task_id is null then raise exception 'Task not found' using errcode='P0002'; end if;
  party:=public.worksync_project_party(t.project_id);
  if party is distinct from 'freelancer' then raise exception 'Only the assigned freelancer may update task progress' using errcode='42501'; end if;
  if p_status not in ('todo','in_progress') or not (
    (t.status='todo' and p_status='in_progress') or (t.status='in_progress' and p_status='todo')
    or t.status=p_status) then raise exception 'Invalid task transition; completion and review are server-controlled' using errcode='22023'; end if;
  if p_note is not null and length(p_note)>5000 then raise exception 'Task note is too long' using errcode='22023'; end if;
  if t.status=p_status then return t; end if;
  prev:=t.status; update public.project_tasks set status=p_status,updated_at=now() where task_id=p_task_id returning * into t;
  insert into public.project_task_history(task_id,actor_id,from_status,to_status,note) values(t.task_id,auth.uid(),prev,p_status,p_note);
  return t;
end;
$$;
revoke all on function public.worksync_set_project_task_status(uuid,text,text) from public,anon;
grant execute on function public.worksync_set_project_task_status(uuid,text,text) to authenticated;

-- System auto-approval is deliberately not client task approval. A client may
-- later confirm the task itself without changing the submission or payment.
create or replace function public.worksync_confirm_auto_approved_task(p_task_id uuid,p_note text default null)
returns public.project_tasks language plpgsql security definer set search_path = '' as $$
declare t public.project_tasks; s public.project_submissions;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into t from public.project_tasks where task_id=p_task_id for update;
  if t.task_id is null or t.status<>'auto_approved' then raise exception 'Task is not awaiting client confirmation' using errcode='22023'; end if;
  if public.worksync_project_party(t.project_id) is distinct from 'client' then raise exception 'Only the project client may confirm task completion' using errcode='42501'; end if;
  if p_note is not null and length(p_note)>5000 then raise exception 'Task note is too long' using errcode='22023'; end if;
  select * into s from public.project_submissions where task_id=t.task_id and status='approved' and auto_reviewed_at is not null order by created_at desc limit 1;
  if s.submission_id is null then raise exception 'No service auto-approved delivery is linked to this task' using errcode='22023'; end if;
  update public.project_tasks set status='completed',completed_at=now(),updated_at=now() where task_id=t.task_id returning * into t;
  insert into public.project_task_history(task_id,actor_id,from_status,to_status,note,submission_id)
    values(t.task_id,auth.uid(),'auto_approved','completed',p_note,s.submission_id);
  return t;
end;
$$;
revoke all on function public.worksync_confirm_auto_approved_task(uuid,text) from public,anon;
grant execute on function public.worksync_confirm_auto_approved_task(uuid,text) to authenticated;

-- Wrapper reuses the existing upload-ticket and project submission validation
-- RPC in the same transaction, then links the task. Any failure rolls both back.
create or replace function public.worksync_submit_task_work(
  p_id uuid,p_project uuid,p_milestone uuid,p_task_id uuid,p_body text,p_link text,p_kind text,p_path text,p_name text
) returns void language plpgsql security definer set search_path = '' as $$
declare t public.project_tasks; party text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_kind<>'delivery' then raise exception 'Tasks support delivery submissions only' using errcode='22023'; end if;
  select * into t from public.project_tasks where task_id=p_task_id and project_id=p_project for update;
  if t.task_id is null or t.status not in ('in_progress','revision_requested') then raise exception 'Task is unavailable for submission' using errcode='22023'; end if;
  if t.milestone_id is distinct from p_milestone then raise exception 'Submission milestone must match the accepted task plan' using errcode='22023'; end if;
  party:=public.worksync_project_party(p_project);
  if party is distinct from 'freelancer' then raise exception 'Only the project freelancer may submit task work' using errcode='42501'; end if;
  perform public.worksync_submit_work(p_id,p_project,p_milestone,p_body,p_link,p_kind,p_path,p_name);
  insert into public.worksync_workflow_write_context values(pg_backend_pid(),txid_current(),p_id,'task_submission');
  update public.project_submissions set task_id=p_task_id where submission_id=p_id and project_id=p_project
    and author_id=auth.uid() and task_id is null and status='submitted';
  if not found then raise exception 'Unable to attach task to submission' using errcode='22023'; end if;
  delete from public.worksync_workflow_write_context where backend_pid=pg_backend_pid()
    and transaction_id=txid_current() and object_id=p_id and purpose='task_submission';
end;
$$;
revoke all on function public.worksync_submit_task_work(uuid,uuid,uuid,uuid,text,text,text,text,text) from public,anon;
grant execute on function public.worksync_submit_task_work(uuid,uuid,uuid,uuid,text,text,text,text,text) to authenticated;

create or replace function public.worksync_guard_task_submission_link()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.project_tasks;
begin
  if new.task_id is not distinct from old.task_id then return new; end if;
  if old.task_id is not null or new.task_id is null or not exists(
    select 1 from public.worksync_workflow_write_context x where x.backend_pid=pg_backend_pid()
      and x.transaction_id=txid_current() and x.object_id=new.submission_id and x.purpose='task_submission') then
    raise exception 'Task links are assigned only by the validated task submission RPC' using errcode='42501'; end if;
  select * into t from public.project_tasks where task_id=new.task_id for update;
  if t.project_id<>new.project_id or new.author_id is distinct from auth.uid() or new.kind<>'delivery' then
    raise exception 'Task submission must match the project, freelancer, and delivery type' using errcode='42501'; end if;
  return new;
end;
$$;
create trigger worksync_guard_task_submission_link before update of task_id on public.project_submissions
for each row execute function public.worksync_guard_task_submission_link();

create or replace function public.worksync_apply_task_submission_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.project_tasks; old_s text; client_review boolean;
begin
  if new.task_id is null then return new; end if;
  select * into t from public.project_tasks where task_id=new.task_id for update;
  if t.project_id<>new.project_id then raise exception 'Task belongs to another project' using errcode='23514'; end if;
  if tg_op='UPDATE' and old.task_id is null and new.task_id is not null then
    if t.status not in ('in_progress','revision_requested') then raise exception 'Task is not ready for delivery'; end if;
    old_s:=t.status;
    update public.project_tasks set status='in_review',updated_at=now() where task_id=t.task_id;
    insert into public.project_task_history(task_id,actor_id,from_status,to_status,submission_id)
      values(t.task_id,auth.uid(),old_s,'in_review',new.submission_id);
    return new;
  end if;
  if old.status is not distinct from new.status then return new; end if;
  if old.status not in ('submitted','revision_requested')
     or new.status not in ('approved','revision_requested') then
    raise exception 'Invalid task submission status transition' using errcode='22023'; end if;
  if auth.role()='service_role' and new.status='approved' and new.auto_reviewed_at is not null
     and new.reviewed_at is not null then
    update public.project_tasks set status='auto_approved',updated_at=now() where task_id=t.task_id;
    insert into public.project_task_history(task_id,from_status,to_status,submission_id)
      values(t.task_id,t.status,'auto_approved',new.submission_id);
    return new;
  end if;
  client_review:=auth.uid() is not null and public.worksync_project_party(new.project_id)='client';
  if not client_review or public.worksync_order_on_hold((select order_id from public.projects where project_id=new.project_id)) then
    raise exception 'Only an eligible client review may change a task submission' using errcode='42501'; end if;
  if t.status not in ('in_review','auto_approved','revision_requested') then raise exception 'Task is not awaiting review' using errcode='22023'; end if;
  old_s:=t.status;
  if new.status='approved' then
    update public.project_tasks set status='completed',completed_at=now(),updated_at=now() where task_id=t.task_id;
    insert into public.project_task_history(task_id,actor_id,from_status,to_status,submission_id)
      values(t.task_id,auth.uid(),old_s,'completed',new.submission_id);
  else
    update public.project_tasks set status='revision_requested',updated_at=now() where task_id=t.task_id;
    insert into public.project_task_history(task_id,actor_id,from_status,to_status,submission_id)
      values(t.task_id,auth.uid(),old_s,'revision_requested',new.submission_id);
  end if;
  return new;
end;
$$;
create trigger worksync_apply_task_submission_transition after update of task_id,status on public.project_submissions
for each row execute function public.worksync_apply_task_submission_transition();

-- Activation already creates/locks the project, copies milestones, sets status,
-- and converts the existing order inside one transaction. This AFTER trigger is
-- part of that transaction; unique project/version/task keys make retries safe.
create or replace function public.worksync_seed_contract_tasks()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.contracts; v public.contract_versions; terms_json jsonb; pid uuid; p public.projects;
  col jsonb; task jsonb; co integer:=0; to_i integer; cm_id uuid; pm_id uuid; task_count integer;
begin
  -- UPDATE OF status also fires when callers assign the existing value. A
  -- completed activation transaction seeds once; retries on an already-active
  -- contract must not repeat plan traversal and task/milestone lookups.
  if new.status::text<>'active' or old.status::text='active' then return new; end if;
  select * into c from public.contracts where contract_id=new.contract_id;
  select * into v from public.contract_versions where contract_id=c.contract_id and version=c.current_version;
  if v.contract_id is null then raise exception 'Current contract snapshot is missing'; end if;
  if v.legacy then return new; end if;
  terms_json:=v.snapshot->'terms';
  -- worksync_activate_contract validates this exact locked current snapshot
  -- before creating/updating the project. The status guard permits activation
  -- only within that RPC's transaction, so repeating full JSON validation here
  -- adds no protection and needlessly traverses the plan a second time.
  select count(*) into task_count from public.projects x where
    (c.order_id is not null and x.order_id=c.order_id) or
    (c.application_id is not null and x.application_id=c.application_id);
  if task_count<>1 then raise exception 'Contract must resolve to exactly one project' using errcode='23514'; end if;
  select * into p from public.projects x where
    (c.order_id is not null and x.order_id=c.order_id) or
    (c.application_id is not null and x.application_id=c.application_id) for update;
  pid:=p.project_id;
  if c.order_id is not null then
    update public.service_orders set status='converted',updated_at=now()
      where order_id=c.order_id and status::text<>'converted';
  end if;
  if p.start_date is null or terms_json->>'startDate' is not null then
    update public.projects set start_date=coalesce(nullif(terms_json->>'startDate','')::date,start_date) where project_id=pid;
  end if;
  if p.due_date is null or terms_json->>'deadline' is not null then
    update public.projects set due_date=coalesce(nullif(terms_json->>'deadline','')::date,due_date) where project_id=pid;
  end if;
  for col in select value from jsonb_array_elements(terms_json->'plan'->'content'->'columns') loop
    co:=co+1;
    if col->>'type'='done' then continue; end if;
    to_i:=0;
    for task in select value from jsonb_array_elements(col->'tasks') loop
      to_i:=to_i+1; pm_id:=null;
      if nullif(task->>'milestoneId','') is not null then
        cm_id:=(task->>'milestoneId')::uuid;
        select milestone_id into pm_id from public.milestones
          where project_id=pid and source_contract_milestone_id=cm_id;
        if pm_id is null then
          select count(*) into task_count from public.milestones pm join public.contract_milestones cm
            on cm.contract_id=c.contract_id and cm.contract_milestone_id=cm_id
             and cm.title=pm.title and cm.display_order=pm.display_order
            where pm.project_id=pid;
          if task_count<>1 then raise exception 'Task milestone cannot be mapped uniquely to project milestone'; end if;
          update public.milestones pm set source_contract_milestone_id=cm_id
            from public.contract_milestones cm where cm.contract_milestone_id=cm_id
             and cm.contract_id=c.contract_id and cm.title=pm.title and cm.display_order=pm.display_order
             and pm.project_id=pid;
          select milestone_id into pm_id from public.milestones where project_id=pid and source_contract_milestone_id=cm_id;
        end if;
      end if;
      insert into public.project_tasks(project_id,source_version,source_key,stage_id,stage_name,stage_order,
        title,description,priority,milestone_id,due_date,display_order)
      values(pid,c.current_version,task->>'id',col->>'id',col->>'name',co,task->>'title',
        coalesce(task->>'description',''),task->>'priority',pm_id,nullif(task->>'dueDate','')::date,to_i)
      on conflict(project_id,source_version,source_key) do nothing;
    end loop;
  end loop;
  return new;
end;
$$;
create trigger worksync_seed_tasks_after_contract_activation after update of status on public.contracts
for each row execute function public.worksync_seed_contract_tasks();

-- Public is never an execution audience for these SECURITY DEFINER helpers.
revoke all on function public.worksync_safe_contract_json(text) from public,anon,authenticated,service_role;
revoke all on function public.worksync_validate_contract_plan(jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.worksync_store_contract_version(uuid,integer,uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.worksync_invalidate_and_version_contract(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.worksync_capture_contract_version() from public,anon,authenticated,service_role;
revoke all on function public.worksync_capture_milestone_statement() from public,anon,authenticated,service_role;
revoke all on function public.worksync_capture_milestone_insert() from public,anon,authenticated,service_role;
revoke all on function public.worksync_capture_milestone_delete() from public,anon,authenticated,service_role;
revoke all on function public.worksync_contract_version_guard() from public,anon,authenticated,service_role;
revoke all on function public.worksync_guard_task_review_write() from public,anon,authenticated,service_role;
revoke all on function public.worksync_contract_status_guard() from public,anon,authenticated,service_role;
revoke all on function public.worksync_seed_contract_tasks() from public,anon,authenticated,service_role;
revoke all on function public.worksync_guard_task_submission_link() from public,anon,authenticated,service_role;
revoke all on function public.worksync_apply_task_submission_transition() from public,anon,authenticated,service_role;
revoke all on function public.worksync_reject_contract_version_mutation() from public,anon,authenticated,service_role;
revoke all on function public.worksync_reset_contract_confirmations() from public,anon,authenticated,service_role;
revoke all on function public.worksync_cancel_order_internal(uuid) from public,anon,authenticated,service_role;
revoke all on function public.worksync_respond_service(uuid,boolean) from public,anon;
grant execute on function public.worksync_respond_service(uuid,boolean) to authenticated;
revoke all on function public.worksync_activate_contract(uuid) from public,anon;
grant execute on function public.worksync_activate_contract(uuid) to authenticated,service_role;
revoke all on function public.confirm_contract_agreement(uuid) from public,anon;
grant execute on function public.confirm_contract_agreement(uuid) to authenticated,service_role;
revoke all on function public.worksync_draft_milestones(uuid,text,uuid,text,text,numeric,date) from public,anon;
grant execute on function public.worksync_draft_milestones(uuid,text,uuid,text,text,numeric,date) to authenticated,service_role;
revoke all on function public.worksync_review_submission(uuid,text,text) from public,anon;
grant execute on function public.worksync_review_submission(uuid,text,text) to authenticated,service_role;
revoke all on function public.worksync_review_submission(uuid,boolean,text) from public,anon;
grant execute on function public.worksync_review_submission(uuid,boolean,text) to authenticated,service_role;

commit;
