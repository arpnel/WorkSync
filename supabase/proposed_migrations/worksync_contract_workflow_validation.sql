-- READ ONLY checks for review. This file contains SELECT statements only.
-- Run PRE sections before the proposed migration. Run POST sections only after
-- an explicitly approved migration has been applied. Static reports do not
-- prove transactional workflow behavior; see the staging test checklist below.

-- ---------------------------------------------------------------------------
-- PRE 1: estimates for the tables touched by the replacement migration.
-- These are planner estimates, not exact counts, and pg_total_relation_size is
-- metadata inspection rather than a row scan.
select c.relname,c.reltuples::bigint as estimated_rows,pg_total_relation_size(c.oid) as total_bytes
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('contracts','contract_milestones','contract_item_approvals','project_submissions',
  'projects','milestones','project_payouts','revision_requests','project_plans','job_applications')
order by c.relname;

-- PRE 2a: enum values used by contract transitions.
select e.enumlabel
from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace
where n.nspname='public' and t.typname='contract_status' order by e.enumsortorder;

-- PRE 2b: every replaced/dependent overload, security configuration, and grants.
-- PostgreSQL 17.6 was queried read-only: pg_get_function_identity_arguments()
-- returns the named signatures below (not type-only output). found_exact_signature
-- makes a future missing/signature-format mismatch explicit.
with target_functions(name,identity_args) as (values
 ('worksync_activate_contract','p_contract_id uuid'),
 ('worksync_guard_contract','p_contract_id uuid'),
 ('worksync_guard_contract_update',''),
 ('worksync_reset_contract_confirmations',''),
 ('worksync_cancel_order_internal','p_order uuid'),
 ('confirm_contract_agreement','p_contract_id uuid'),
 ('worksync_draft_milestones','p_order uuid, p_action text, p_milestone uuid, p_title text, p_description text, p_amount numeric, p_due date'),
 ('worksync_review_submission','p_submission uuid, p_action text, p_instructions text'),
 ('worksync_review_submission','p_submission_id uuid, p_approve boolean, p_instructions text'),
 ('worksync_submit_work','p_id uuid, p_project uuid, p_milestone uuid, p_body text, p_link text, p_kind text, p_path text, p_name text'),
 ('worksync_submit_work','p_project_id uuid, p_milestone_id uuid, p_body text, p_link text, p_attachment_path text, p_attachment_name text, p_kind text'),
 ('worksync_settle_project','p_project uuid, p_payment uuid, p_mode text'),
 ('worksync_respond_service','p_order uuid, p_accept boolean')
)
select tf.name,tf.identity_args,(p.oid is not null) as found_exact_signature,
       p.oid::regprocedure as exact_signature,
       p.prosecdef as security_definer,p.proconfig,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_role_execute,
       coalesce((select bool_or(a.grantee=0 and a.privilege_type='EXECUTE')
                 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),false) as public_execute,
       pg_get_functiondef(p.oid) as current_definition
from target_functions tf
left join pg_proc p on p.pronamespace='public'::regnamespace
 and p.proname=tf.name and pg_get_function_identity_arguments(p.oid)=tf.identity_args
order by tf.name,tf.identity_args;

-- PRE 2c: planned new RPC signatures must not already exist. Any returned row
-- is a name/signature collision that needs resolution before applying the draft.
with planned(name,signature) as (values
 ('worksync_save_contract_version','uuid,integer,uuid,jsonb,jsonb'),
 ('worksync_set_project_task_status','uuid,text,text'),
 ('worksync_confirm_auto_approved_task','uuid,text'),
 ('worksync_submit_task_work','uuid,uuid,uuid,uuid,text,text,text,text,text')
)
select p.name,p.signature,to_regprocedure('public.'||p.name||'('||p.signature||')') as conflicting_function
from planned p
where to_regprocedure('public.'||p.name||'('||p.signature||')') is not null;

-- PRE 2d: detect collisions with planned trigger and relation names.
select n.nspname as schema_name,c.relname as table_name,t.tgname
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and t.tgname in (
 'worksync_contract_versions_immutable','worksync_contract_version_capture',
 'worksync_contract_milestone_update_version','worksync_contract_milestone_insert_version',
 'worksync_contract_milestone_delete_version','worksync_contract_version_guard',
 'worksync_contract_status_guard','worksync_guard_task_submission_review',
 'worksync_guard_task_submission_link','worksync_apply_task_submission_transition',
 'worksync_seed_tasks_after_contract_activation');
select c.relname as conflicting_relation
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('worksync_workflow_write_context','contract_versions','project_tasks','project_task_history');

-- PRE 3: existing trigger definitions, RLS state, and policies on affected tables.
select c.relname as table_name,t.tgname,pg_get_triggerdef(t.oid) as trigger_definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal and c.relname in
 ('contracts','contract_milestones','contract_item_approvals','project_submissions',
  'projects','milestones','project_payouts','revision_requests','service_orders')
order by c.relname,t.tgname;
select c.relname,c.relrowsecurity,c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('contracts','contract_milestones','contract_item_approvals','project_submissions',
  'projects','milestones','project_payouts','revision_requests') order by c.relname;
select tablename,policyname,cmd,roles,qual,with_check from pg_policies
where schemaname='public' and tablename in
 ('contracts','contract_milestones','contract_item_approvals','project_submissions',
  'projects','milestones','project_payouts','revision_requests')
order by tablename,policyname;

-- PRE 4: current project source ambiguity. No results are expected; these
-- checks do not prove future writes remain unique or activation resolution safe.
select order_id,count(*) as projects from public.projects where order_id is not null
 group by order_id having count(*)>1;
select application_id,count(*) as projects from public.projects where application_id is not null
 group by application_id having count(*)>1;

-- ---------------------------------------------------------------------------
-- POST 1: report missing current snapshots, current snapshot/live-field mismatch,
-- milestone-set mismatch, and stale/inconsistent signature markers. These are
-- reports only; investigate each row manually rather than repairing in place.
-- Verified against the replacement: contract_versions has a legacy boolean;
-- snapshot keys are finalPrice, deliveryDays, revisionsCount, terms, taskPlan,
-- milestones. Legacy backfill stores the original terms text as a JSON string;
-- new non-legacy snapshots store parsed JSON terms.
select c.contract_id,c.current_version
from public.contracts c left join public.contract_versions v
 on v.contract_id=c.contract_id and v.version=c.current_version
where v.contract_id is null;

with live_milestones as (
 select c.contract_id,coalesce(jsonb_agg(jsonb_build_object(
   'id',m.contract_milestone_id,'title',m.title,'description',m.description,
   'amount',m.amount,'dueDate',m.due_date,'displayOrder',m.display_order
 ) order by m.display_order,m.contract_milestone_id)
   filter (where m.contract_milestone_id is not null),'[]'::jsonb) as milestone_json
 from public.contracts c left join public.contract_milestones m on m.contract_id=c.contract_id
 group by c.contract_id
)
select c.contract_id,c.current_version,v.legacy,
       v.snapshot->'finalPrice' as snapshot_price,to_jsonb(c.final_price) as live_price,
       v.snapshot->'deliveryDays' as snapshot_delivery_days,to_jsonb(c.delivery_time_days) as live_delivery_days,
       v.snapshot->'revisionsCount' as snapshot_revisions,to_jsonb(c.revisions_count) as live_revisions,
       v.snapshot->'terms' as snapshot_terms,
       case when v.legacy then to_jsonb(c.terms) else public.worksync_safe_contract_json(c.terms) end as expected_terms,
       v.snapshot->'milestones' as snapshot_milestones,lm.milestone_json as live_milestones
from public.contracts c
join public.contract_versions v on v.contract_id=c.contract_id and v.version=c.current_version
join live_milestones lm on lm.contract_id=c.contract_id
where v.snapshot->'finalPrice' is distinct from to_jsonb(c.final_price)
   or v.snapshot->'deliveryDays' is distinct from to_jsonb(c.delivery_time_days)
   or v.snapshot->'revisionsCount' is distinct from to_jsonb(c.revisions_count)
   or v.snapshot->'terms' is distinct from
      case when v.legacy then to_jsonb(c.terms) else public.worksync_safe_contract_json(c.terms) end
   or v.snapshot->'milestones' is distinct from lm.milestone_json;

select contract_id,current_version,client_signed_at,client_signed_version,
       freelancer_signed_at,freelancer_signed_version
from public.contracts
where (client_signed_at is not null and client_signed_version is distinct from current_version)
   or (freelancer_signed_at is not null and freelancer_signed_version is distinct from current_version)
   or (client_signed_at is null and client_signed_version is not null)
   or (freelancer_signed_at is null and freelancer_signed_version is not null);

-- POST 2a: each non-legacy current snapshot must carry the schemaVersion 1
-- wrapper and accepted task plan. This catches missing plans, not just bad paths.
select v.contract_id,v.version,v.snapshot->'terms' as terms,v.snapshot->'taskPlan' as task_plan
from public.contract_versions v join public.contracts c
 on c.contract_id=v.contract_id and c.current_version=v.version
where not v.legacy and (
  v.snapshot->'terms'->>'schemaVersion' is distinct from '1'
  or jsonb_typeof(v.snapshot->'taskPlan'->'content'->'columns') is distinct from 'array'
  or jsonb_typeof(v.snapshot->'terms'->'plan'->'content'->'columns') is distinct from 'array'
);

-- POST 2b: malformed columns/tasks, duplicate stage/task IDs, and invalid date
-- syntax or date ordering. The extracted schema is the replacement's taskPlan:
-- {name,description,content:{columns:[{id,name,type,tasks:[{id,title,
-- description,priority,dueDate?,milestoneId?}]}]}}.
with current_plans as (
 select v.contract_id,v.version,v.snapshot->'taskPlan' as plan,
        v.snapshot->'milestones' as milestones,v.snapshot->'terms' as terms
 from public.contract_versions v join public.contracts c
   on c.contract_id=v.contract_id and c.current_version=v.version
 where not v.legacy
), columns as (
 select p.*,col.value as col, col.ordinality::integer as column_order
 from current_plans p
 cross join lateral jsonb_array_elements(
   case when jsonb_typeof(p.plan->'content'->'columns')='array'
        then p.plan->'content'->'columns' else '[]'::jsonb end
 ) with ordinality col(value,ordinality)
), tasks as (
 select c.contract_id,c.version,c.terms,c.milestones,c.col->>'id' as stage_id,
        c.col->>'name' as stage_name,c.col->>'type' as stage_type,c.column_order,
        t.value as task,t.ordinality::integer as task_order
 from columns c
 cross join lateral jsonb_array_elements(
   case when jsonb_typeof(c.col->'tasks')='array' then c.col->'tasks' else '[]'::jsonb end
 ) with ordinality t(value,ordinality)
), plan_issues as (
 select p.contract_id,p.version,'invalid plan columns or stage metadata'::text as issue
 from current_plans p
 where jsonb_typeof(p.plan->'content'->'columns') is distinct from 'array'
    or jsonb_array_length(case when jsonb_typeof(p.plan->'content'->'columns')='array'
       then p.plan->'content'->'columns' else '[]'::jsonb end) not between 2 and 21
 union all
 select p.contract_id,p.version,'task count is not between 1 and 120 or Done column count is not one'
 from current_plans p
 where (select count(*) from columns c where c.contract_id=p.contract_id and c.version=p.version
          and c.col->>'type'='done')<>1
    or (select count(*) from tasks t where t.contract_id=p.contract_id and t.version=p.version) not between 1 and 120
    or exists(select 1 from columns c where c.contract_id=p.contract_id and c.version=p.version
      and jsonb_array_length(case when jsonb_typeof(c.col->'tasks')='array'
        then c.col->'tasks' else '[]'::jsonb end)>25)
 union all
 select p.contract_id,p.version,'contract startDate/deadline is invalid or out of order'
 from current_plans p where
   (nullif(p.terms->>'startDate','') is not null and not pg_input_is_valid(p.terms->>'startDate','date'))
   or (nullif(p.terms->>'deadline','') is not null and not pg_input_is_valid(p.terms->>'deadline','date'))
   or case when pg_input_is_valid(nullif(p.terms->>'startDate',''),'date')
             and pg_input_is_valid(nullif(p.terms->>'deadline',''),'date')
      then (p.terms->>'deadline')::date<(p.terms->>'startDate')::date else false end
 union all
 select c.contract_id,c.version,'malformed/duplicate stage id, name, type, or tasks array'
 from columns c where nullif(btrim(c.col->>'id'),'') is null
   or length(c.col->>'id')>80 or nullif(btrim(c.col->>'name'),'') is null
   or length(c.col->>'name')>80 or c.col->>'type' is null or c.col->>'type' not in ('stage','done')
   or jsonb_typeof(c.col->'tasks') is distinct from 'array'
 union all
 select c.contract_id,c.version,'Done is not the sole final empty column'
 from columns c where c.col->>'type'='done' and
   (c.column_order<>(select max(x.column_order) from columns x where x.contract_id=c.contract_id and x.version=c.version)
   or jsonb_array_length(case when jsonb_typeof(c.col->'tasks')='array'
      then c.col->'tasks' else '[]'::jsonb end)<>0)
 union all
 select x.contract_id,x.version,'duplicate stage id'
 from columns x group by x.contract_id,x.version,x.col->>'id' having count(*)>1
 union all
 select t.contract_id,t.version,'malformed task id, title, description, priority, or ordering'
 from tasks t where nullif(btrim(t.task->>'id'),'') is null or length(t.task->>'id')>80
   or nullif(btrim(t.task->>'title'),'') is null or length(t.task->>'title')>160
   or coalesce(length(t.task->>'description'),0)>1000
   or t.task->>'priority' is null or t.task->>'priority' not in ('low','medium','high') or t.stage_type='done'
 union all
 select x.contract_id,x.version,'duplicate task id or task id collides with stage id'
 from (
   select contract_id,version,task->>'id' as id from tasks
   union all select contract_id,version,col->>'id' from columns
 ) x group by x.contract_id,x.version,x.id having count(*)>1
 union all
 select t.contract_id,t.version,'task dueDate is invalid or outside contract date bounds'
 from tasks t where t.task ? 'dueDate' and nullif(t.task->>'dueDate','') is not null
   and (not pg_input_is_valid(t.task->>'dueDate','date')
     or case when pg_input_is_valid(t.task->>'dueDate','date')
                  and pg_input_is_valid(nullif(t.terms->>'startDate',''),'date')
       then (t.task->>'dueDate')::date<(t.terms->>'startDate')::date else false end
     or case when pg_input_is_valid(t.task->>'dueDate','date')
                  and pg_input_is_valid(nullif(t.terms->>'deadline',''),'date')
       then (t.task->>'dueDate')::date>(t.terms->>'deadline')::date else false end)
 union all
 select t.contract_id,t.version,'task milestoneId is not present in this snapshot'
 from tasks t where nullif(t.task->>'milestoneId','') is not null
   and not exists(select 1 from jsonb_array_elements(
     case when jsonb_typeof(t.milestones)='array' then t.milestones else '[]'::jsonb end
   ) m where m->>'id'=t.task->>'milestoneId')
 union all
 select t.contract_id,t.version,'task missing milestoneId although contract has milestones'
 from tasks t where jsonb_array_length(case when jsonb_typeof(t.milestones)='array'
    then t.milestones else '[]'::jsonb end)>0 and nullif(t.task->>'milestoneId','') is null
)
select distinct contract_id,version,issue from plan_issues order by contract_id,version,issue;

-- POST 2c: milestone snapshot integrity (IDs, order, amount budget, and dates).
with current_versions as (
 select v.contract_id,v.version,v.snapshot->'milestones' as milestones,
        v.snapshot->'terms' as terms
 from public.contract_versions v join public.contracts c
   on c.contract_id=v.contract_id and c.current_version=v.version
 where not v.legacy
), milestone_rows as (
 select cv.contract_id,cv.version,cv.terms,m.value as milestone
 from current_versions cv cross join lateral jsonb_array_elements(
   case when jsonb_typeof(cv.milestones)='array' then cv.milestones else '[]'::jsonb end
 ) m(value)
)
select contract_id,version,'duplicate milestone id' as issue
from (select contract_id,version,milestone->>'id' as key from milestone_rows) x
group by contract_id,version,key having count(*)>1 or nullif(key,'') is null
union all
select contract_id,version,'duplicate or missing milestone displayOrder' as issue
from (select contract_id,version,milestone->>'displayOrder' as key from milestone_rows) x
group by contract_id,version,key having count(*)>1 or nullif(key,'') is null
union all
select contract_id,version,'malformed milestone fields, amount, or dueDate' as issue
from milestone_rows
where nullif(btrim(milestone->>'title'),'') is null or length(milestone->>'title')>200
   or coalesce(length(milestone->>'description'),0)>5000
   or not pg_input_is_valid(milestone->>'displayOrder','integer')
   or case when pg_input_is_valid(milestone->>'displayOrder','integer')
      then (milestone->>'displayOrder')::integer<1 else false end
   or nullif(milestone->>'amount','') is null
   or not pg_input_is_valid(milestone->>'amount','numeric')
   or case when pg_input_is_valid(milestone->>'amount','numeric')
      then (milestone->>'amount')::numeric<=0 else false end
   or (nullif(milestone->>'dueDate','') is not null and not pg_input_is_valid(milestone->>'dueDate','date'))
   or case when pg_input_is_valid(nullif(milestone->>'dueDate',''),'date')
              and pg_input_is_valid(nullif(terms->>'startDate',''),'date')
     then (milestone->>'dueDate')::date<(terms->>'startDate')::date else false end
   or case when pg_input_is_valid(nullif(milestone->>'dueDate',''),'date')
              and pg_input_is_valid(nullif(terms->>'deadline',''),'date')
     then (milestone->>'dueDate')::date>(terms->>'deadline')::date else false end;

-- The replacement validator requires exact numeric equality when a new
-- contract version has one or more milestones; it does not round or permit a
-- partial allocation. Report any mismatch against the snapshot's agreed price.
with versions_with_milestones as (
 select v.contract_id,v.version,v.snapshot->>'finalPrice' as final_price,
        v.snapshot->'milestones' as milestones
 from public.contract_versions v join public.contracts c
   on c.contract_id=v.contract_id and c.current_version=v.version
 where not v.legacy
), allocations as (
 select v.contract_id,v.version,v.final_price,count(m.value) as milestone_count,
        coalesce(sum(case when pg_input_is_valid(m.value->>'amount','numeric')
          then (m.value->>'amount')::numeric else 0::numeric end),0::numeric) as amount_total
 from versions_with_milestones v
 left join lateral jsonb_array_elements(case when jsonb_typeof(v.milestones)='array'
   then v.milestones else '[]'::jsonb end) m(value) on true
 group by v.contract_id,v.version,v.final_price
)
select contract_id,version,final_price,amount_total,milestone_count
from allocations
where milestone_count>0 and (
  not pg_input_is_valid(final_price,'numeric')
  or case when pg_input_is_valid(final_price,'numeric')
     then amount_total<>(final_price)::numeric else false end
);

-- POST 2d: persisted task/submission/source-milestone integrity and uniqueness.
select project_id,source_version,source_key,count(*) as duplicates
from public.project_tasks group by project_id,source_version,source_key having count(*)>1;
select s.submission_id,s.project_id,s.task_id,t.project_id as task_project_id
from public.project_submissions s left join public.project_tasks t on t.task_id=s.task_id
where s.task_id is not null and (t.task_id is null or s.project_id is distinct from t.project_id);
select project_id,source_contract_milestone_id,count(*) as duplicates
from public.milestones where source_contract_milestone_id is not null
 group by project_id,source_contract_milestone_id having count(*)>1;

-- POST 3a: explicit function execution expectations. Empty results mean grants
-- match the replacement draft. This checks PUBLIC ACL separately from named roles.
with expected(name,signature,allow_public,allow_anon,allow_authenticated,allow_service_role) as (values
 ('worksync_save_contract_version','uuid,integer,uuid,jsonb,jsonb',false,false,true,false),
 ('worksync_set_project_task_status','uuid,text,text',false,false,true,false),
 ('worksync_confirm_auto_approved_task','uuid,text',false,false,true,false),
 ('worksync_submit_task_work','uuid,uuid,uuid,uuid,text,text,text,text,text',false,false,true,false),
 ('worksync_cancel_order_internal','uuid',false,false,false,false),
 ('worksync_respond_service','uuid,boolean',false,false,true,null),
 ('worksync_activate_contract','uuid',false,false,true,true),
 ('confirm_contract_agreement','uuid',false,false,true,true),
 ('worksync_review_submission','uuid,text,text',false,false,true,true),
 ('worksync_review_submission','uuid,boolean,text',false,false,true,true)
), actual as (
 select e.*,p.oid,
   coalesce((select bool_or(a.grantee=0 and a.privilege_type='EXECUTE')
     from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),false) as actual_public,
   has_function_privilege('anon',p.oid,'EXECUTE') as actual_anon,
   has_function_privilege('authenticated',p.oid,'EXECUTE') as actual_authenticated,
   has_function_privilege('service_role',p.oid,'EXECUTE') as actual_service_role
 from expected e left join pg_proc p on p.pronamespace='public'::regnamespace
  and p.proname=e.name and regexp_replace(oidvectortypes(p.proargtypes),',\s*',',','g')=e.signature
)
select name,signature,allow_public,actual_public,allow_anon,actual_anon,
       allow_authenticated,actual_authenticated,allow_service_role,actual_service_role
from actual where oid is null or actual_public is distinct from allow_public
   or actual_anon is distinct from allow_anon
   or actual_authenticated is distinct from allow_authenticated
   or (allow_service_role is not null and actual_service_role is distinct from allow_service_role);

-- POST 3b: new-table SELECT/RLS expectations and direct-write restrictions.
-- The replacement revokes ALL from service_role on these tables too; its
-- SECURITY DEFINER functions write as their owner, so service_role should have
-- no direct table privileges. OID-based checks return NULL for missing tables,
-- while c.oid IS NULL reports the missing relation without name-resolution errors.
with expected(table_name,authenticated_select,authenticated_insert,authenticated_update,authenticated_delete,authenticated_truncate,
              anon_select,anon_insert,anon_update,anon_delete,anon_truncate,service_insert,service_update,service_delete,service_truncate) as (values
 ('contract_versions',true,false,false,false,false,false,false,false,false,false,false,false,false,false),
 ('project_tasks',true,false,false,false,false,false,false,false,false,false,false,false,false,false),
 ('project_task_history',true,false,false,false,false,false,false,false,false,false,false,false,false,false),
 ('worksync_workflow_write_context',false,false,false,false,false,false,false,false,false,false,false,false,false,false)
)
select e.table_name,c.relrowsecurity as rls_enabled,
 has_table_privilege('authenticated',c.oid,'SELECT') as auth_select,
 has_table_privilege('authenticated',c.oid,'INSERT') as auth_insert,
 has_table_privilege('authenticated',c.oid,'UPDATE') as auth_update,
 has_table_privilege('authenticated',c.oid,'DELETE') as auth_delete,
 has_table_privilege('authenticated',c.oid,'TRUNCATE') as auth_truncate,
 has_table_privilege('anon',c.oid,'SELECT') as anon_select,
 has_table_privilege('anon',c.oid,'INSERT') as anon_insert,
 has_table_privilege('anon',c.oid,'UPDATE') as anon_update,
 has_table_privilege('anon',c.oid,'DELETE') as anon_delete,
 has_table_privilege('anon',c.oid,'TRUNCATE') as anon_truncate,
 has_table_privilege('service_role',c.oid,'INSERT') as service_insert,
 has_table_privilege('service_role',c.oid,'UPDATE') as service_update,
 has_table_privilege('service_role',c.oid,'DELETE') as service_delete,
 has_table_privilege('service_role',c.oid,'TRUNCATE') as service_truncate
from expected e left join pg_class c on c.oid=to_regclass('public.'||e.table_name)
where c.oid is null or c.relrowsecurity is distinct from true
   or has_table_privilege('authenticated',c.oid,'SELECT') is distinct from e.authenticated_select
   or has_table_privilege('authenticated',c.oid,'INSERT') is distinct from e.authenticated_insert
   or has_table_privilege('authenticated',c.oid,'UPDATE') is distinct from e.authenticated_update
   or has_table_privilege('authenticated',c.oid,'DELETE') is distinct from e.authenticated_delete
   or has_table_privilege('authenticated',c.oid,'TRUNCATE') is distinct from e.authenticated_truncate
   or has_table_privilege('anon',c.oid,'SELECT') is distinct from e.anon_select
   or has_table_privilege('anon',c.oid,'INSERT') is distinct from e.anon_insert
   or has_table_privilege('anon',c.oid,'UPDATE') is distinct from e.anon_update
   or has_table_privilege('anon',c.oid,'DELETE') is distinct from e.anon_delete
   or has_table_privilege('anon',c.oid,'TRUNCATE') is distinct from e.anon_truncate
   or has_table_privilege('service_role',c.oid,'INSERT') is distinct from e.service_insert
   or has_table_privilege('service_role',c.oid,'UPDATE') is distinct from e.service_update
   or has_table_privilege('service_role',c.oid,'DELETE') is distinct from e.service_delete
   or has_table_privilege('service_role',c.oid,'TRUNCATE') is distinct from e.service_truncate;

-- POST 3c: compare actual index definitions (columns/order/predicate/uniqueness)
-- with the exact definitions in the replacement SQL. Empty results are expected.
with expected(table_name,index_name,definition) as (values
 ('project_tasks','project_tasks_project_stage_order_idx',
  'CREATE INDEX project_tasks_project_stage_order_idx ON public.project_tasks USING btree (project_id, stage_order, display_order, task_id)'),
 ('project_task_history','project_task_history_task_created_idx',
  'CREATE INDEX project_task_history_task_created_idx ON public.project_task_history USING btree (task_id, created_at DESC)'),
 ('project_submissions','project_submissions_task_id_idx',
  'CREATE INDEX project_submissions_task_id_idx ON public.project_submissions USING btree (task_id) WHERE (task_id IS NOT NULL)'),
 ('milestones','milestones_contract_source_unique',
  'CREATE UNIQUE INDEX milestones_contract_source_unique ON public.milestones USING btree (project_id, source_contract_milestone_id) WHERE (source_contract_milestone_id IS NOT NULL)')
), actual as (
 select e.*,i.indexdef as catalog_definition,
        pg_get_indexdef(ix.indexrelid) as pg_get_indexdef_definition
 from expected e
 left join pg_indexes i on i.schemaname='public' and i.tablename=e.table_name and i.indexname=e.index_name
 left join pg_class tbl on tbl.oid=to_regclass('public.'||e.table_name)
 left join pg_index ix on ix.indrelid=tbl.oid and ix.indexrelid=to_regclass('public.'||e.index_name)
)
select table_name,index_name,definition,catalog_definition,pg_get_indexdef_definition
from actual
where catalog_definition is null or pg_get_indexdef_definition is null
   or regexp_replace(lower(catalog_definition),'\s+',' ','g')<>regexp_replace(lower(definition),'\s+',' ','g')
   or regexp_replace(lower(pg_get_indexdef_definition),'\s+',' ','g')<>regexp_replace(lower(definition),'\s+',' ','g');

-- ---------------------------------------------------------------------------
-- STAGING TEST PLAN ONLY, NOT EXECUTABLE TESTS. These cases still require a
-- disposable staging database and transaction assertions; no staging branch
-- is currently provisioned. Do not treat this checklist as test results.
-- 1. Material terms edit increments exactly one version, atomically clears both
--    signature timestamps/version markers and item approvals; re-acceptance binds
--    each party to that exact new version. Reject attempts to forge the other
--    party's signature, current_version, signer-version fields, or status.
-- 2. Direct participant changes to pending/rejected/cancelled contract statuses
--    fail. worksync_respond_service keeps the service_order and contract response
--    states synchronized; authorized cancellation and dispute-resolution paths
--    still cancel the related order, project, milestones, and contract together.
-- 3. One multi-row milestone operation produces one final snapshot; invalid
--    plan/milestone references abort all changes and leave prior state intact.
-- 4. Activation from order and application paths seeds the accepted plan once,
--    maps milestones to the same source project, preserves accepted dates, and
--    retry neither duplicates nor reattaches project/task rows.
-- 5. Task-linked submission uses existing upload validation; client approval
--    completes the task/history atomically; revision request reopens it and
--    preserves existing submission/milestone/revision-limit behavior. The
--    boolean review overload must accept a valid revision_requested resubmission
--    without the task-transition trigger rejecting it.
-- 6. Service-role worksync_settle_project auto-review sets auto_approved and
--    history without recording client approval or completing the task; later
--    client confirmation completes the task separately. Payment/payout output
--    matches baseline behavior.
-- 7. Legacy contract terms remain explicitly legacy, activate through the
--    existing path, and do not silently seed an incomplete task board.
