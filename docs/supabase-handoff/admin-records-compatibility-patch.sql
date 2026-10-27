-- PREPARED, NOT APPLIED. Based on the deployed definition supplied 2026-09-30.
-- Adds seven missing UI modules. Existing moderation feeds and aliases retain their payloads.
-- Review and run explicitly in Supabase SQL Editor; no tables, policies or grants changed.
begin;
create or replace function public.worksync_admin_records(
 p_module text default 'all', p_search text default null, p_offset integer default 0
) returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','public','auth' as $function$
declare
 v_limit int:=50; v_offset int:=greatest(coalesce(p_offset,0),0);
 v_module text:=lower(coalesce(nullif(btrim(p_module),''),'all'));
 v_search text:=nullif(lower(btrim(coalesce(p_search,''))),'');
 v_result jsonb; result jsonb; stats jsonb;
begin
 if not public.worksync_is_admin() then
  raise exception 'Administrator access required' using errcode='42501';
 end if;
 if v_module in ('overview','users','jobs','services','projects','verification','transactions') then
 with records as (
 select u.user_id as id,coalesce(p.display_name,u.email,'User') as title,
 case when public.worksync_marketplace_active(u.user_id) then 'active' else 'suspended' end as status,
 u.created_at,concat('Role: ',u.role::text,E'\nEmail: ',u.email,E'\nModeration: ',m.reason,E'\nChanged: ',m.changed_at,E'\nExpires: ',m.expires_at) as detail,u.user_id as owner_id,null::text[] as document_paths
 from public."Users" u left join public.profiles p using(user_id) left join public.account_moderation m using(user_id) where v_module='users'
 union all
 select j.job_id,j.title,case when not public.worksync_listing_visible('job',j.job_id) then 'hidden' else j.status::text end,j.created_at,concat(j.description,E'\nBudget: PHP ',j.budget_min,' - ',j.budget_max),c.user_id,null::text[] from public.jobs j join public.client_profiles c using(client_id) where v_module='jobs'
 union all
 select s.service_id,s.title,case when not public.worksync_listing_visible('service',s.service_id) then 'hidden' else s.status::text end,s.created_at,concat(s.description,E'\nPrice: PHP ',s.price),f.user_id,null::text[] from public.services s join public.freelancer_profiles f using(freelancer_id) where v_module='services'
 union all
 select p.project_id,p.title,p.status::text,p.created_at,concat('Budget: PHP ',p.budget,E'\nDeadline: ',p.due_date,E'\nOrder: ',p.order_id,E'\nClient profile: ',p.client_id,E'\nFreelancer profile: ',p.freelancer_id),null::uuid,null::text[] from public.projects p where v_module='projects'
 union all
 select v.request_id,coalesce(p.display_name,'Verification request'),v.status,v.created_at,concat('Applicant: ',v.user_id,E'\nReview notes: ',v.notes),v.user_id,v.document_paths from public.verification_requests v left join public.profiles p using(user_id) where v_module='verification'
 union all
 select a.audit_id,a.action,'recorded',a.created_at,concat('Admin: ',a.admin_id,E'\nTarget: ',a.target_id,E'\n',a.details::text),a.admin_id,null::text[] from public.admin_audit_log a where v_module in ('audit','overview')
 union all
 select t.payment_id,coalesce(t.transaction_reference,t.payment_id::text),coalesce(t.status::text,'unspecified'),t.created_at,concat('Recorded amount: PHP ',t.amount,E'\nMethod: ',t.payment_method,E'\nOrder: ',t.order_id,E'\nProject: ',t.project_id),t.payer_id,null::text[] from public.payments t where v_module='transactions'
 ), filtered as (select * from records where coalesce(p_search,'')='' or title ilike '%'||p_search||'%' or status ilike '%'||p_search||'%' or id::text=p_search),
 paged as (select * from filtered order by created_at desc nulls last,id limit v_limit offset v_offset)
 select jsonb_build_object('records',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),'limit',v_limit,'offset',v_offset) into result;
 if v_module='overview' then
 select jsonb_build_object('users',(select count(*) from public."Users"),'clients',(select count(*) from public.client_profiles),'freelancers',(select count(*) from public.freelancer_profiles),'services',(select count(*) from public.services),'open_jobs',(select count(*) from public.jobs where status::text='open'),'active_projects',(select count(*) from public.projects where status::text in ('active','in_progress')),'completed_projects',(select count(*) from public.projects where status::text='completed'),'pending_reports',(select count(*) from public.listing_reports where status in ('pending','under_review'))) into stats;
 result:=result||jsonb_build_object('stats',stats);
 end if;

 return result;
 end if;
 if v_module not in ('all','reports','listing_reports','listings','listing_moderation','accounts','account_moderation','disputes','audit','audit_log') then
  raise exception 'Unsupported admin module' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(row_data order by sort_at desc),'[]'::jsonb) into v_result from (
  select row_data,sort_at from (
   select jsonb_build_object('record_type','listing_report','report',to_jsonb(r)) row_data,r.created_at sort_at
    from public.listing_reports r where v_module in ('all','reports','listing_reports')
   union all select jsonb_build_object('record_type','listing_moderation','moderation',to_jsonb(m)),m.updated_at
    from public.listing_moderation m where v_module in ('all','listings','listing_moderation')
   union all select jsonb_build_object('record_type','account_moderation','moderation',to_jsonb(m),'user',to_jsonb(u)),m.changed_at
    from public.account_moderation m join public."Users" u on u.user_id=m.user_id where v_module in ('all','accounts','account_moderation')
   union all select jsonb_build_object('record_type','dispute','dispute',to_jsonb(d)),d.created_at
    from public.project_disputes d where v_module in ('all','disputes')
   union all select jsonb_build_object('record_type','audit','audit',to_jsonb(a)),a.created_at
    from public.admin_audit_log a where v_module in ('all','audit','audit_log')
  ) combined where v_search is null or lower(row_data::text) like '%'||v_search||'%'
  order by sort_at desc limit v_limit offset v_offset
 ) page;
 return jsonb_build_object('records',coalesce(v_result,'[]'::jsonb),'limit',v_limit,'offset',v_offset);
end;$function$;
commit;
