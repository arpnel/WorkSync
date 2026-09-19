-- Run in Supabase SQL Editor as one transaction. No columns are added.
-- Updates review behavior and repairs already-approved standard deliveries.
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

-- Serialize repair against delivery, project and contract writes.
lock table public.contracts, public.projects, public.project_submissions,
  public.milestones, public.service_orders in share row exclusive mode;

-- Only repair standard projects with an approved latest delivery and no hold.
do $$
declare candidate record;
begin
  for candidate in
    select p.project_id, p.order_id, latest.reviewed_at
    from public.projects p
    join public.service_orders o on o.order_id = p.order_id
    cross join lateral (
      select s.status, s.milestone_id, s.reviewed_at
      from public.project_submissions s
      where s.project_id = p.project_id and s.kind = 'delivery'
      order by s.created_at desc, s.submission_id desc
      limit 1
    ) latest
    where p.status::text in ('active', 'in_progress', 'revision')
      and o.status::text not in ('cancelled', 'canceled', 'rejected')
      and latest.status = 'approved'
      and latest.milestone_id is null
      and not exists (
        select 1 from public.milestones m where m.project_id = p.project_id
      )
      and not public.worksync_order_on_hold(p.order_id)
  loop
    update public.projects
      set status = 'completed', completed_at = coalesce(candidate.reviewed_at, now()), updated_at = now()
      where project_id = candidate.project_id;
    update public.service_orders set status = 'completed', updated_at = now()
      where order_id = candidate.order_id;
    update public.contracts set status = 'completed', updated_at = now()
      where order_id = candidate.order_id;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
