-- PREPARED, NOT APPLIED.
-- Follow-up for the already-installed contract workflow. Does not recreate tables, triggers, or policies.
begin;

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
      -- Tasks without a selected milestone remain unassigned.
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

commit;
