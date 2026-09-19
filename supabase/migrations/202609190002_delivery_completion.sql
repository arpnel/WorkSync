-- Reconcile with the deployed review overload before applying. Preserves the app signature.
-- Completes standard work after one final approval and milestone work after all approvals.
begin;
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
 if p_action='revision' then
 if coalesce(length(trim(p_instructions)),0)=0 then raise exception 'Explain the requested changes'; end if;
 select revisions_count into revision_limit from public.contracts where order_id=p.order_id;
 select count(*) into used from public.revision_requests where project_id=s.project_id;
 if revision_limit is null or used>=revision_limit then raise exception 'The agreed revision limit has been reached or is not set'; end if;
 insert into public.revision_requests(project_id,submission_id,requested_by,instructions) values(s.project_id,s.submission_id,auth.uid(),p_instructions);
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
commit;
