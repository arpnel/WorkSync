-- PREPARATION ONLY. Reconcile with deployed WorkSync schema before applying.
-- Existing assumptions: UUID identifiers; projects statuses active/completed;
-- jobs open; applications pending; service_orders accepted/completed.
-- Existing saved_services must expose (user_id, service_id).
-- Apply after inspecting enum/check constraints and existing permissive policies.
begin;
-- contracts.order_id is already unique in the supplied schema.
create or replace function public.worksync_contract_party(p_contract uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when c.user_id=auth.uid() then 'client' when f.user_id=auth.uid() then 'freelancer' end
 from public.contracts a join public.service_orders o using(order_id) join public.client_profiles c using(client_id) join public.freelancer_profiles f using(freelancer_id) where a.contract_id=p_contract;
$$;
revoke all on function public.worksync_contract_party(uuid) from public;
grant execute on function public.worksync_contract_party(uuid) to authenticated;
-- Reuse existing contract_item_approvals, including its timestamps and unique key.
alter table public.contract_item_approvals enable row level security;
create policy contract_approvals_participant on public.contract_item_approvals for all to authenticated using(public.worksync_contract_party(contract_id) is not null) with check(public.worksync_contract_party(contract_id) is not null);
revoke all on public.contract_item_approvals from anon,authenticated;
grant select,insert,update on public.contract_item_approvals to authenticated;

create table if not exists public.admin_members (
 user_id uuid primary key references public."Users"(user_id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.admin_members enable row level security;
create or replace function public.worksync_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.admin_members where user_id = auth.uid());
$$;
revoke all on function public.worksync_is_admin() from public;
grant execute on function public.worksync_is_admin() to authenticated;
-- Membership is provisioned by trusted SQL/service role only, never user metadata.
revoke all on public.admin_members from anon, authenticated;

create table if not exists public.saved_jobs (
 user_id uuid not null references public."Users"(user_id) on delete cascade,
 job_id uuid not null references public.jobs(job_id) on delete cascade,
 created_at timestamptz not null default now(), primary key(user_id,job_id)
);
alter table public.saved_jobs enable row level security;
create policy saved_jobs_owner on public.saved_jobs for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,delete on public.saved_jobs to authenticated;
-- Do not recreate saved_services. Required unique key and own-row RLS are in setup notes.

create table if not exists public.listing_reports (
 report_id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references public."Users"(user_id),
 listing_type text not null check(listing_type in ('service','job')),
 service_id uuid references public.services(service_id), job_id uuid references public.jobs(job_id),
 owner_id uuid not null references public."Users"(user_id),
 reason text not null check(reason in ('Scam','Spam','Misleading listing','Inappropriate content','Suspicious behavior','Payment concern','Intellectual property concern','Prohibited content','Other')),
 description text not null default '' check(length(description)<=5000),
 status text not null default 'pending' check(status in ('pending','under_review','resolved','dismissed')),
 admin_notes text not null default '', reviewed_by uuid references public."Users"(user_id),
 created_at timestamptz not null default now(), reviewed_at timestamptz,
 check((listing_type='service' and service_id is not null and job_id is null) or (listing_type='job' and job_id is not null and service_id is null))
);
create index if not exists listing_reports_queue on public.listing_reports(status,created_at desc);
create index if not exists listing_reports_reporter on public.listing_reports(reporter_id,created_at desc);
alter table public.listing_reports enable row level security;
create policy listing_reports_read on public.listing_reports for select to authenticated using(reporter_id=auth.uid() or public.worksync_is_admin());
grant select on public.listing_reports to authenticated;

create table if not exists public.admin_audit_log (
 audit_id uuid primary key default gen_random_uuid(), admin_id uuid not null references public."Users"(user_id),
 action text not null, target_id uuid not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;
create policy admin_audit_read on public.admin_audit_log for select to authenticated using(public.worksync_is_admin());
grant select on public.admin_audit_log to authenticated;

create or replace function public.worksync_report_listing(p_kind text,p_listing uuid,p_reason text,p_description text) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner uuid; result uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_kind='service' then select f.user_id into owner from public.services s join public.freelancer_profiles f using(freelancer_id) where s.service_id=p_listing;
 elsif p_kind='job' then select c.user_id into owner from public.jobs j join public.client_profiles c using(client_id) where j.job_id=p_listing;
 else raise exception 'Invalid listing type'; end if;
 if owner is null or owner=auth.uid() then raise exception 'Listing unavailable or owned by you'; end if;
 insert into public.listing_reports(reporter_id,listing_type,service_id,job_id,owner_id,reason,description)
 values(auth.uid(),p_kind,case when p_kind='service' then p_listing end,case when p_kind='job' then p_listing end,owner,p_reason,coalesce(p_description,'')) returning report_id into result;
 return result;
end; $$;

create or replace function public.worksync_apply_for_job(p_job uuid,p_proposal text,p_price numeric,p_days integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare freelancer uuid; owner uuid; job_status text; result uuid;
begin
 select freelancer_id into freelancer from public.freelancer_profiles where user_id=auth.uid();
 select c.user_id,j.status::text into owner,job_status from public.jobs j join public.client_profiles c using(client_id) where j.job_id=p_job for update of j;
 if exists(select 1 from public.jobs where job_id=p_job and is_archived) or not public.worksync_listing_visible('job',p_job) then raise exception 'This listing is unavailable'; end if;
 if freelancer is null or owner is null or owner=auth.uid() or job_status<>'open' then raise exception 'Only a freelancer may apply to an open job owned by another user'; end if;
 if coalesce(length(trim(p_proposal)),0)=0 or length(p_proposal)>10000 or p_price<=0 or p_days<1 or p_price is null or p_days is null then raise exception 'Invalid proposal, price or delivery'; end if;
 if exists(select 1 from public.job_applications where job_id=p_job and freelancer_id=freelancer) then raise exception 'You have already applied to this job'; end if;
 insert into public.job_applications(job_id,freelancer_id,proposal,proposed_price,estimated_days,status)
 values(p_job,freelancer,p_proposal,p_price,p_days,'pending') returning application_id into result;
 insert into public.notifications(user_id,type,title,message,related_id,is_read) values(owner,'job_application','New job application','A freelancer applied to your job.',p_job,false);
 return result;
end; $$;

create or replace function public.worksync_project_party(p_project uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when c.user_id=auth.uid() then 'client' when f.user_id=auth.uid() then 'freelancer' end
 from public.projects p join public.client_profiles c using(client_id) join public.freelancer_profiles f using(freelancer_id) where p.project_id=p_project;
$$;
create table if not exists public.project_submissions (
 submission_id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(project_id),
 milestone_id uuid references public.milestones(milestone_id), author_id uuid not null references public."Users"(user_id),
 body text not null default '' check(length(body)<=10000), link text check(link is null or link ~ '^https?://'),
 attachment_path text, attachment_name text,
 kind text not null check(kind in ('progress','delivery')),
 status text not null default 'submitted' check(status in ('submitted','revision_requested','approved')),
 created_at timestamptz not null default now(), reviewed_at timestamptz,
 check(length(trim(body))>0 or link is not null or attachment_path is not null)
);
create index if not exists project_submissions_history on public.project_submissions(project_id,created_at desc);
alter table public.project_submissions enable row level security;
create policy project_submissions_read on public.project_submissions for select to authenticated using(public.worksync_project_party(project_id) is not null);
grant select on public.project_submissions to authenticated;
create table if not exists public.revision_requests (
 revision_id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(project_id),
 submission_id uuid not null unique references public.project_submissions(submission_id),
 requested_by uuid not null references public."Users"(user_id), instructions text not null check(length(trim(instructions)) between 1 and 5000),
 status text not null default 'open' check(status in ('open','addressed')), created_at timestamptz not null default now()
);
create index if not exists revision_requests_project on public.revision_requests(project_id,created_at desc);
alter table public.revision_requests enable row level security;
create policy revision_requests_read on public.revision_requests for select to authenticated using(public.worksync_project_party(project_id) is not null);
grant select on public.revision_requests to authenticated;

create or replace function public.worksync_submit_work(p_id uuid,p_project uuid,p_milestone uuid,p_body text,p_link text,p_kind text,p_path text,p_name text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.projects; recipient uuid; milestone_type boolean; locked uuid;
begin
 select * into p from public.projects where project_id=p_project;
 select contract_id into locked from public.contracts where order_id=p.order_id for update;
 select * into p from public.projects where project_id=p_project for update;
 if p_link is not null and p_link !~ '^https?://' then raise exception 'Use an HTTP or HTTPS link'; end if;
 if length(p_body)>10000 then raise exception 'Submission text is too long'; end if;
 if p_kind='delivery' and public.worksync_order_on_hold(p.order_id) then raise exception 'Delivery is paused pending resolution'; end if;
 if public.worksync_project_party(p_project) is distinct from 'freelancer' or p.status::text not in ('active','in_progress') then raise exception 'Only the project freelancer can submit active work'; end if;
 select s.service_type::text='milestone' into milestone_type from public.service_orders o join public.services s using(service_id) where o.order_id=p.order_id;
 if milestone_type and p_milestone is null then raise exception 'Choose a milestone'; end if;
 if p_milestone is not null and not exists(select 1 from public.milestones where milestone_id=p_milestone and project_id=p_project and status::text<>'completed') then raise exception 'Milestone unavailable'; end if;
 if p_kind='delivery' and exists(select 1 from public.project_submissions where project_id=p_project and milestone_id is not distinct from p_milestone and kind='delivery' and status='submitted') then raise exception 'Wait for the client to review your current delivery'; end if;
 if p_path is not null and (p_path not like p_project::text||'/'||auth.uid()::text||'/'||p_id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='project-attachments' and name=p_path)) then raise exception 'Invalid attachment'; end if;
 insert into public.project_submissions(submission_id,project_id,milestone_id,author_id,body,link,kind,attachment_path,attachment_name) values(p_id,p_project,p_milestone,auth.uid(),p_body,p_link,p_kind,p_path,p_name);
 if p_kind='delivery' then
 update public.revision_requests r set status='addressed' from public.project_submissions s where r.submission_id=s.submission_id and r.project_id=p_project and s.milestone_id is not distinct from p_milestone and r.status='open';
 end if;
 select user_id into recipient from public.client_profiles where client_id=p.client_id;
 insert into public.notifications(user_id,type,title,message,related_id,is_read) values(recipient,'project_update','Project work submitted','New work is ready in your project workspace.',p.order_id,false);
end; $$;

create or replace function public.worksync_review_submission(p_submission uuid,p_action text,p_instructions text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.project_submissions; p public.projects; revision_limit integer; used integer; recipient uuid; locked uuid;
begin
 select * into s from public.project_submissions where submission_id=p_submission;
 select * into p from public.projects where project_id=s.project_id;
 select contract_id into locked from public.contracts where order_id=p.order_id for update;
 select * into p from public.projects where project_id=s.project_id for update;
 if public.worksync_order_on_hold(p.order_id) then raise exception 'Delivery decisions are paused pending resolution'; end if;
 select * into s from public.project_submissions where submission_id=p_submission for update;
 if public.worksync_project_party(s.project_id) is distinct from 'client' or p.status::text not in ('active','in_progress') or s.kind<>'delivery' or s.status<>'submitted' then raise exception 'Delivery cannot be reviewed'; end if;
 if p_action='revision' then
 select revisions_count into revision_limit from public.contracts where order_id=p.order_id;
 select count(*) into used from public.revision_requests where project_id=s.project_id;
 if revision_limit is null or used>=revision_limit then raise exception 'The agreed revision limit has been reached or is not set'; end if;
 insert into public.revision_requests(project_id,submission_id,requested_by,instructions) values(s.project_id,s.submission_id,auth.uid(),p_instructions);
 update public.project_submissions set status='revision_requested',reviewed_at=now() where submission_id=p_submission;
 elsif p_action='approve' then
 update public.project_submissions set status='approved',reviewed_at=now() where submission_id=p_submission;
 if s.milestone_id is not null then update public.milestones set status='completed' where milestone_id=s.milestone_id and project_id=s.project_id; end if;
 if s.milestone_id is null or not exists(select 1 from public.milestones where project_id=s.project_id and status::text<>'completed') then
 update public.projects set status='completed',completed_at=now(),updated_at=now() where project_id=s.project_id;
 update public.service_orders set status='completed',updated_at=now() where order_id=p.order_id;
 update public.contracts set status='completed',updated_at=now() where order_id=p.order_id;
 end if;
 else raise exception 'Invalid review action'; end if;
 select user_id into recipient from public.freelancer_profiles where freelancer_id=p.freelancer_id;
 insert into public.notifications(user_id,type,title,message,related_id,is_read) values(recipient,'project_update',case when p_action='approve' then 'Delivery approved' else 'Revision requested' end,'Open the project workspace for details.',p.order_id,false);
end; $$;

create or replace function public.worksync_leave_review(p_project uuid,p_rating integer,p_comment text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.projects; party text; recipient uuid;
begin
 select * into p from public.projects where project_id=p_project for update;
 party:=public.worksync_project_party(p_project);
 if party is null or p.status::text<>'completed' then raise exception 'Only participants may review a completed project'; end if;
 if p_rating not between 1 and 5 or p_rating is null or length(p_comment)>5000 then raise exception 'Invalid rating or comment'; end if;
 if exists(select 1 from public.reviews where project_id=p_project and reviewer_role::text=party) then raise exception 'You already reviewed this project'; end if;
 if party='client' then
 insert into public.reviews(project_id,client_id,freelancer_id,reviewer_role,rating,comment) values(p_project,p.client_id,p.freelancer_id,'client',p_rating,p_comment);
 select user_id into recipient from public.freelancer_profiles where freelancer_id=p.freelancer_id;
 else
 insert into public.reviews(project_id,client_id,freelancer_id,reviewer_role,rating,comment) values(p_project,p.client_id,p.freelancer_id,'freelancer',p_rating,p_comment);
 select user_id into recipient from public.client_profiles where client_id=p.client_id;
 end if;
 insert into public.notifications(user_id,type,title,message,related_id,is_read) values(recipient,'review','New project review','Your project partner left a review.',p.order_id,false);
end; $$;

-- Private submissions: no public URLs. Participant reads only; immutable linked files.
insert into storage.buckets(id,name,public,file_size_limit) values('project-attachments','project-attachments',false,10485760) on conflict(id) do nothing;
create policy project_files_read on storage.objects for select to authenticated using(bucket_id='project-attachments' and exists(select 1 from public.project_submissions s where s.attachment_path=name and public.worksync_project_party(s.project_id) is not null));
create policy project_files_insert on storage.objects for insert to authenticated with check(bucket_id='project-attachments' and (storage.foldername(name))[2]=auth.uid()::text and exists(select 1 from public.projects p where p.project_id::text=(storage.foldername(name))[1] and public.worksync_project_party(p.project_id)='freelancer' and p.status::text in ('active','in_progress')));
create policy project_files_cleanup on storage.objects for delete to authenticated using(bucket_id='project-attachments' and (storage.foldername(name))[2]=auth.uid()::text and not exists(select 1 from public.project_submissions s where s.attachment_path=name));

-- All mutation routines run as definer but validate auth.uid() internally.
revoke all on function public.worksync_report_listing(text,uuid,text,text),public.worksync_apply_for_job(uuid,text,numeric,integer),public.worksync_project_party(uuid),public.worksync_submit_work(uuid,uuid,uuid,text,text,text,text,text),public.worksync_review_submission(uuid,text,text),public.worksync_leave_review(uuid,integer,text) from public;
grant execute on function public.worksync_report_listing(text,uuid,text,text),public.worksync_apply_for_job(uuid,text,numeric,integer),public.worksync_project_party(uuid),public.worksync_submit_work(uuid,uuid,uuid,text,text,text,text,text),public.worksync_review_submission(uuid,text,text),public.worksync_leave_review(uuid,integer,text) to authenticated;
commit;
