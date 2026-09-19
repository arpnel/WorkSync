begin;
create table if not exists public.listing_moderation (
 listing_type text not null check(listing_type in ('job','service')), listing_id uuid not null,
 hidden boolean not null default false, notes text not null, reviewed_by uuid not null references public."Users"(user_id),
 updated_at timestamptz not null default now(), primary key(listing_type,listing_id)
);
alter table public.listing_moderation enable row level security;
create or replace function public.worksync_listing_visible(p_kind text,p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.listing_moderation where listing_type=p_kind and listing_id=p_id and hidden);
$$;
revoke all on function public.worksync_listing_visible(text,uuid) from public;
grant execute on function public.worksync_listing_visible(text,uuid) to anon,authenticated;
-- Restrictive policies supplement (never replace) deployed owner/public read policies.
create policy services_moderation_visibility on public.services as restrictive for select to authenticated using(public.worksync_listing_visible('service',service_id) or public.worksync_is_admin() or exists(select 1 from public.freelancer_profiles f where f.freelancer_id=services.freelancer_id and f.user_id=auth.uid()));
create policy jobs_moderation_visibility on public.jobs as restrictive for select to authenticated using(public.worksync_listing_visible('job',job_id) or public.worksync_is_admin() or exists(select 1 from public.client_profiles c where c.client_id=jobs.client_id and c.user_id=auth.uid()));
create policy services_moderation_anon on public.services as restrictive for select to anon using(public.worksync_listing_visible('service',service_id));
create policy jobs_moderation_anon on public.jobs as restrictive for select to anon using(public.worksync_listing_visible('job',job_id));

create table if not exists public.verification_requests (
 request_id uuid primary key default gen_random_uuid(), user_id uuid not null references public."Users"(user_id),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 document_paths text[] not null check(cardinality(document_paths) between 1 and 3),
 notes text not null default '', reviewed_by uuid references public."Users"(user_id),
 created_at timestamptz not null default now(), reviewed_at timestamptz
);
create unique index if not exists verification_pending_user on public.verification_requests(user_id) where status='pending';
alter table public.verification_requests enable row level security;
create policy verification_read on public.verification_requests for select to authenticated using(user_id=auth.uid() or public.worksync_is_admin());
create policy verification_create on public.verification_requests for insert to authenticated with check(user_id=auth.uid() and status='pending' and reviewed_by is null and reviewed_at is null and notes='');
grant select,insert on public.verification_requests to authenticated;

create or replace function public.worksync_admin_records(p_module text,p_search text default '',p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; stats jsonb;
begin
 if not public.worksync_is_admin() then raise exception 'Administrator access required'; end if;
 if p_module not in ('overview','users','jobs','services','projects','reports','verification','audit','transactions') then raise exception 'Unknown module'; end if;
 with records as (
 select u.user_id as id,coalesce(p.display_name,u.email,'User') as title,
 case when public.worksync_marketplace_active(u.user_id) then 'active' else 'suspended' end as status,
 u.created_at,concat('Role: ',u.role::text,E'\nEmail: ',u.email,E'\nModeration: ',m.reason,E'\nChanged: ',m.changed_at,E'\nExpires: ',m.expires_at) as detail,u.user_id as owner_id,null::text[] as document_paths
 from public."Users" u left join public.profiles p using(user_id) left join public.account_moderation m using(user_id) where p_module='users'
 union all
 select j.job_id,j.title,case when not public.worksync_listing_visible('job',j.job_id) then 'hidden' else j.status::text end,j.created_at,concat(j.description,E'\nBudget: PHP ',j.budget_min,' - ',j.budget_max),c.user_id,null::text[] from public.jobs j join public.client_profiles c using(client_id) where p_module='jobs'
 union all
 select s.service_id,s.title,case when not public.worksync_listing_visible('service',s.service_id) then 'hidden' else s.status::text end,s.created_at,concat(s.description,E'\nPrice: PHP ',s.price),f.user_id,null::text[] from public.services s join public.freelancer_profiles f using(freelancer_id) where p_module='services'
 union all
 select p.project_id,p.title,p.status::text,p.created_at,concat('Budget: PHP ',p.budget,E'\nDeadline: ',p.due_date,E'\nOrder: ',p.order_id,E'\nClient profile: ',p.client_id,E'\nFreelancer profile: ',p.freelancer_id),null::uuid,null::text[] from public.projects p where p_module='projects'
 union all
 select r.report_id,concat(r.listing_type,' report: ',r.reason),r.status,r.created_at,concat('Listing: ',coalesce(r.service_id,r.job_id),E'\nReporter: ',r.reporter_id,E'\n',r.description,E'\nAdmin notes: ',r.admin_notes),r.owner_id,null::text[] from public.listing_reports r where p_module='reports'
 union all
 select v.request_id,coalesce(p.display_name,'Verification request'),v.status,v.created_at,concat('Applicant: ',v.user_id,E'\nReview notes: ',v.notes),v.user_id,v.document_paths from public.verification_requests v left join public.profiles p using(user_id) where p_module='verification'
 union all
 select a.audit_id,a.action,'recorded',a.created_at,concat('Admin: ',a.admin_id,E'\nTarget: ',a.target_id,E'\n',a.details::text),a.admin_id,null::text[] from public.admin_audit_log a where p_module in ('audit','overview')
 union all
 select t.payment_id,coalesce(t.transaction_reference,t.payment_id::text),coalesce(t.status::text,'unspecified'),t.created_at,concat('Recorded amount: PHP ',t.amount,E'\nMethod: ',t.payment_method,E'\nOrder: ',t.order_id,E'\nProject: ',t.project_id),t.payer_id,null::text[] from public.payments t where p_module='transactions'
 ), filtered as (select * from records where coalesce(p_search,'')='' or title ilike '%'||p_search||'%' or status ilike '%'||p_search||'%' or id::text=p_search),
 paged as (select * from filtered order by created_at desc nulls last,id limit 25 offset greatest(p_offset,0))
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),'total',(select count(*) from filtered)) into result;
 if p_module='overview' then
 select jsonb_build_object('users',(select count(*) from public."Users"),'clients',(select count(*) from public.client_profiles),'freelancers',(select count(*) from public.freelancer_profiles),'services',(select count(*) from public.services),'open_jobs',(select count(*) from public.jobs where status::text='open'),'active_projects',(select count(*) from public.projects where status::text in ('active','in_progress')),'completed_projects',(select count(*) from public.projects where status::text='completed'),'pending_reports',(select count(*) from public.listing_reports where status in ('pending','under_review'))) into stats;
 result:=result||jsonb_build_object('stats',stats);
 end if;
 return result;
end; $$;

create or replace function public.worksync_admin_action(p_module text,p_id uuid,p_action text,p_notes text) returns void
language plpgsql security definer set search_path='' as $$
declare recipient uuid; current_state text;
begin
 if not public.worksync_is_admin() then raise exception 'Administrator access required'; end if;
 if length(trim(p_notes)) not between 1 and 5000 then raise exception 'Review notes are required (up to 5000 characters)'; end if;
 if p_module='reports' and p_action in ('under_review','resolved','dismissed') then
 select reporter_id,status into recipient,current_state from public.listing_reports where report_id=p_id for update;
 if recipient is null or current_state in ('resolved','dismissed') then raise exception 'Report unavailable or already closed'; end if;
 update public.listing_reports set status=p_action,admin_notes=p_notes,reviewed_by=auth.uid(),reviewed_at=now() where report_id=p_id;
 elsif p_module='verification' and p_action in ('approved','rejected') then
 select user_id,status into recipient,current_state from public.verification_requests where request_id=p_id for update;
 if recipient is null or current_state<>'pending' then raise exception 'Verification unavailable or already reviewed'; end if;
 update public.verification_requests set status=p_action,notes=p_notes,reviewed_by=auth.uid(),reviewed_at=now() where request_id=p_id;
 -- Reconcile freelancer_profiles.verification_status enum before applying this mapping.
 if p_action='approved' then update public.freelancer_profiles set verification_status='verified' where user_id=recipient;
 else update public.freelancer_profiles set verification_status='rejected' where user_id=recipient; end if;
 elsif p_module in ('jobs','services') and p_action in ('hide','restore') then
 if p_module='jobs' then select c.user_id into recipient from public.jobs j join public.client_profiles c using(client_id) where j.job_id=p_id;
 else select f.user_id into recipient from public.services s join public.freelancer_profiles f using(freelancer_id) where s.service_id=p_id; end if;
 if recipient is null then raise exception 'Listing not found'; end if;
 insert into public.listing_moderation(listing_type,listing_id,hidden,notes,reviewed_by) values(case when p_module='jobs' then 'job' else 'service' end,p_id,p_action='hide',p_notes,auth.uid())
 on conflict(listing_type,listing_id) do update set hidden=excluded.hidden,notes=excluded.notes,reviewed_by=excluded.reviewed_by,updated_at=now();
 else raise exception 'Unsupported action'; end if;
 insert into public.admin_audit_log(admin_id,action,target_id,details) values(auth.uid(),p_module||':'||p_action,p_id,jsonb_build_object('notes',p_notes,'previous_status',current_state));
 insert into public.notifications(user_id,type,title,message,related_id,is_read) values(recipient,'admin_update','Review update',p_notes,p_id,false);
end; $$;

insert into storage.buckets(id,name,public,file_size_limit) values('verification-documents','verification-documents',false,10485760) on conflict(id) do nothing;
create policy verification_files_read on storage.objects for select to authenticated using(bucket_id='verification-documents' and ((storage.foldername(name))[1]=auth.uid()::text or (public.worksync_is_admin() and exists(select 1 from public.verification_requests v where name=any(v.document_paths)))));
create policy verification_files_insert on storage.objects for insert to authenticated with check(bucket_id='verification-documents' and (storage.foldername(name))[1]=auth.uid()::text);
create policy verification_files_cleanup on storage.objects for delete to authenticated using(bucket_id='verification-documents' and (storage.foldername(name))[1]=auth.uid()::text and not exists(select 1 from public.verification_requests v where name=any(v.document_paths)));
create or replace function public.worksync_guard_verification() returns trigger
language plpgsql security definer set search_path='' as $$
declare path text;
begin
 if new.user_id is distinct from auth.uid() then raise exception 'Own verification requests only'; end if;
 foreach path in array new.document_paths loop
 if path not like auth.uid()::text||'/%' or not exists(select 1 from storage.objects where bucket_id='verification-documents' and name=path) then raise exception 'Invalid verification document'; end if;
 end loop;
 return new;
end; $$;
create trigger worksync_guard_verification before insert on public.verification_requests for each row execute function public.worksync_guard_verification();
revoke all on function public.worksync_admin_records(text,text,integer),public.worksync_admin_action(text,uuid,text,text),public.worksync_guard_verification() from public;
grant execute on function public.worksync_admin_records(text,text,integer),public.worksync_admin_action(text,uuid,text,text) to authenticated;
commit;
