-- Pending deployment: reconcile deployed RPC signatures and status constraints first.
-- Uses existing tables; fixes revised work and milestone delivery transitions.
begin;
create or replace function public.worksync_submit_work(p_id uuid,p_project uuid,p_milestone uuid,p_body text,p_link text,p_kind text,p_path text,p_name text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.projects; recipient uuid; milestone_type boolean; locked uuid;
begin
 select * into p from public.projects where project_id=p_project;
 select contract_id into locked from public.contracts where order_id=p.order_id for update;
 select * into p from public.projects where project_id=p_project for update;
 if p_kind is null or p_kind not in ('progress','delivery') then raise exception 'Invalid submission type'; end if;
 if coalesce(length(trim(p_body)),0)=0 and p_link is null and p_path is null then raise exception 'Add notes, a link, or an attachment'; end if;
 if p_link is not null and p_link !~ '^https?://' then raise exception 'Use an HTTP or HTTPS link'; end if;
 if length(p_body)>10000 then raise exception 'Submission text is too long'; end if;
 if p_kind='delivery' and public.worksync_order_on_hold(p.order_id) then raise exception 'Delivery is paused pending resolution'; end if;
 if public.worksync_project_party(p_project) is distinct from 'freelancer' or p.status::text not in ('active','in_progress','revision') then raise exception 'Only the project freelancer can submit active work'; end if;
 select s.service_type::text='milestone' into milestone_type from public.service_orders o join public.services s using(service_id) where o.order_id=p.order_id;
 if (milestone_type or exists(select 1 from public.milestones where project_id=p_project)) and p_milestone is null then raise exception 'Choose a milestone'; end if;
 if p_milestone is not null and not exists(select 1 from public.milestones where milestone_id=p_milestone and project_id=p_project and status::text not in ('approved','completed')) then raise exception 'Milestone unavailable'; end if;
 if p_kind='delivery' and exists(select 1 from public.project_submissions where project_id=p_project and milestone_id is not distinct from p_milestone and kind='delivery' and status='submitted') then raise exception 'Wait for the client to review your current delivery'; end if;
 if p_path is not null and (p_path not like p_project::text||'/'||auth.uid()::text||'/'||p_id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='project-attachments' and name=p_path)) then raise exception 'Invalid attachment'; end if;
 insert into public.project_submissions(submission_id,project_id,milestone_id,author_id,body,link,kind,attachment_path,attachment_name) values(p_id,p_project,p_milestone,auth.uid(),p_body,p_link,p_kind,p_path,p_name);
 if p_kind='delivery' then
 update public.milestones set status='submitted' where milestone_id=p_milestone and project_id=p_project;
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
 if public.worksync_project_party(s.project_id) is distinct from 'client' or p.status::text not in ('active','in_progress','revision') or s.kind<>'delivery' or s.status<>'submitted' then raise exception 'Delivery cannot be reviewed'; end if;
 if s.milestone_id is null and exists(select 1 from public.milestones where project_id=s.project_id) then raise exception 'Choose a milestone for this delivery'; end if;
 if s.milestone_id is not null and not exists(select 1 from public.milestones where milestone_id=s.milestone_id and project_id=s.project_id and status::text not in ('approved','completed')) then raise exception 'Milestone unavailable or already approved'; end if;
 if exists(select 1 from public.project_submissions newer where newer.project_id=s.project_id and newer.milestone_id is not distinct from s.milestone_id and newer.kind='delivery' and newer.created_at>s.created_at) then raise exception 'Review the latest delivery'; end if;
 if p_action='revision' then
 if length(p_instructions)>5000 then raise exception 'Keep revision instructions within 5,000 characters'; end if;
 if coalesce(length(trim(p_instructions)),0)=0 then raise exception 'Explain the requested changes'; end if;
 select revisions_count into revision_limit from public.contracts where order_id=p.order_id;
 select count(*) into used from public.revision_requests where project_id=s.project_id;
 if revision_limit is null or used>=revision_limit then raise exception 'The agreed revision limit has been reached or is not set'; end if;
 insert into public.revision_requests(project_id,submission_id,requested_by,instructions) values(s.project_id,s.submission_id,auth.uid(),p_instructions);
 update public.milestones set status='revision_requested' where milestone_id=s.milestone_id and project_id=s.project_id;
 update public.project_submissions set status='revision_requested',reviewed_at=now() where submission_id=p_submission;
 elsif p_action='approve' then
 update public.project_submissions set status='approved',reviewed_at=now() where submission_id=p_submission;
 if s.milestone_id is not null then update public.milestones set status='approved' where milestone_id=s.milestone_id and project_id=s.project_id; end if;
 if s.milestone_id is null or not exists(select 1 from public.milestones where project_id=s.project_id and status::text not in ('approved','completed')) then
 update public.projects set status='completed',completed_at=now(),updated_at=now() where project_id=s.project_id;
 update public.service_orders set status='completed',updated_at=now() where order_id=p.order_id;
 update public.contracts set status='completed',updated_at=now() where order_id=p.order_id;
 end if;
 else raise exception 'Invalid review action'; end if;
 select user_id into recipient from public.freelancer_profiles where freelancer_id=p.freelancer_id;
 insert into public.notifications(user_id,type,title,message,related_id,is_read) values(recipient,'project_update',case when p_action='approve' then 'Delivery approved' else 'Revision requested' end,'Open the project workspace for details.',p.order_id,false);
end; $$;


revoke all on function public.worksync_review_submission(uuid,text,text) from public,anon;
grant execute on function public.worksync_review_submission(uuid,text,text) to authenticated;

revoke all on function public.worksync_submit_work(uuid,uuid,uuid,text,text,text,text,text) from public,anon;
grant execute on function public.worksync_submit_work(uuid,uuid,uuid,text,text,text,text,text) to authenticated;
NOTIFY pgrst, 'reload schema';
commit;
