-- PREPARED, NOT APPLIED. Requires 202609300002_freelancer_capacity.sql,
-- 202609140012_resolution_workflows.sql, and 202610150001_support_tickets.sql.
-- Capacity starts at 10. Eligible freelancers may request an admin-reviewed increase.
begin;

alter table public.support_tickets drop constraint if exists support_tickets_category_check;
alter table public.support_tickets add constraint support_tickets_category_check
 check(category in ('Account','Payments','Projects','Technical issue','Safety concern','Other','Capacity increase'));
create unique index if not exists support_capacity_one_open_request
 on public.support_tickets(requester_id)
 where category='Capacity increase' and status not in ('resolved','closed');

create table if not exists public.freelancer_capacity_eligibility_notices (
 freelancer_id uuid primary key references public.freelancer_profiles(freelancer_id) on delete cascade,
 user_id uuid not null references public."Users"(user_id) on delete cascade,
 created_at timestamptz not null default now(),
 email_sent_at timestamptz,
 email_attempts integer not null default 0,
 last_email_error text
);
alter table public.freelancer_capacity_eligibility_notices enable row level security;
revoke all on public.freelancer_capacity_eligibility_notices from public,anon,authenticated;
grant select,update on public.freelancer_capacity_eligibility_notices to service_role;

create or replace function public.worksync_freelancer_capacity_eligible(p_freelancer uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select
   (select count(*) from public.projects p
    where p.freelancer_id=p_freelancer and p.status::text='completed') >= 10
   and coalesce((select avg(r.rating)::numeric from public.reviews r
    where r.freelancer_id=p_freelancer and r.reviewer_role::text='client'),0) >= 4
   and not exists(
    select 1 from public.project_disputes d join public.projects p using(project_id)
    where p.freelancer_id=p_freelancer and d.status<>'resolved'
   );
$$;
revoke all on function public.worksync_freelancer_capacity_eligible(uuid) from public,anon,authenticated;

create or replace function public.worksync_notify_capacity_eligibility()
returns trigger language plpgsql security definer set search_path='' as $$
declare fid uuid; uid uuid; inserted integer;
begin
 if tg_table_name='projects' then
  fid:=coalesce(new.freelancer_id,old.freelancer_id);
 elsif tg_table_name='reviews' then
  fid:=coalesce(new.freelancer_id,old.freelancer_id);
 elsif tg_table_name='project_disputes' then
  select p.freelancer_id into fid from public.projects p where p.project_id=coalesce(new.project_id,old.project_id);
 end if;
 if fid is null or not public.worksync_freelancer_capacity_eligible(fid) then return new; end if;
 select f.user_id into uid from public.freelancer_profiles f where f.freelancer_id=fid;
 if uid is null then return new; end if;
 insert into public.freelancer_capacity_eligibility_notices(freelancer_id,user_id)
 values(fid,uid) on conflict(freelancer_id) do nothing;
 get diagnostics inserted = row_count;
 if inserted=1 then
  insert into public.notifications(user_id,type,title,message,related_id,is_read)
  values(uid,'capacity_eligible','You can request more project capacity',
   'You have completed at least 10 projects, have an average client rating of 4 or higher, and have no open disputes. Submit a Capacity increase support ticket to request an admin-reviewed limit increase.',null,false);
 end if;
 return new;
end; $$;
revoke all on function public.worksync_notify_capacity_eligibility() from public,anon,authenticated;

drop trigger if exists worksync_capacity_eligibility_project on public.projects;
create trigger worksync_capacity_eligibility_project
 after update of status on public.projects
 for each row when (new.status::text='completed' and old.status::text is distinct from new.status::text)
 execute function public.worksync_notify_capacity_eligibility();
drop trigger if exists worksync_capacity_eligibility_review on public.reviews;
create trigger worksync_capacity_eligibility_review after insert on public.reviews
 for each row execute function public.worksync_notify_capacity_eligibility();
drop trigger if exists worksync_capacity_eligibility_dispute on public.project_disputes;
create trigger worksync_capacity_eligibility_dispute after update of status on public.project_disputes
 for each row when (new.status is distinct from old.status)
 execute function public.worksync_notify_capacity_eligibility();

with eligible as (
 select f.freelancer_id,f.user_id from public.freelancer_profiles f
 where public.worksync_freelancer_capacity_eligible(f.freelancer_id)
), new_notices as (
 insert into public.freelancer_capacity_eligibility_notices(freelancer_id,user_id)
 select freelancer_id,user_id from eligible on conflict(freelancer_id) do nothing
 returning user_id
)
insert into public.notifications(user_id,type,title,message,related_id,is_read)
select user_id,'capacity_eligible','You can request more project capacity',
 'You have completed at least 10 projects, have an average client rating of 4 or higher, and have no open disputes. Submit a Capacity increase support ticket to request an admin-reviewed limit increase.',null,false
from new_notices;

create or replace function public.worksync_submit_support_ticket(p_category text,p_subject text,p_description text)
returns uuid language plpgsql security definer set search_path='' as $$
declare ticket uuid; fid uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to submit a support ticket'; end if;
 if p_category not in ('Account','Payments','Projects','Technical issue','Safety concern','Other','Capacity increase') then raise exception 'Choose a valid category'; end if;
 if length(trim(p_subject)) not between 4 and 120 then raise exception 'Subject must be between 4 and 120 characters'; end if;
 if length(trim(p_description)) not between 20 and 4000 then raise exception 'Details must be between 20 and 4000 characters'; end if;
 if p_category='Capacity increase' then
  select f.freelancer_id into fid from public.freelancer_profiles f where f.user_id=auth.uid();
  if fid is null or not public.worksync_freelancer_capacity_eligible(fid) then
   raise exception 'Capacity increase requests are available after meeting the eligibility requirements';
  end if;
  if exists(select 1 from public.support_tickets t where t.requester_id=auth.uid() and t.category='Capacity increase' and t.status not in ('resolved','closed')) then
   raise exception 'You already have an open capacity increase request';
  end if;
 end if;
 insert into public.support_tickets(requester_id,category,subject,description)
 values(auth.uid(),p_category,trim(p_subject),trim(p_description)) returning ticket_id into ticket;
 return ticket;
end; $$;

create or replace function public.worksync_admin_support_tickets(p_status text default null)
returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.worksync_is_admin() then raise exception 'Administrator access required'; end if;
 if p_status is not null and p_status not in ('open','in_progress','waiting_on_user','resolved','closed') then raise exception 'Invalid ticket status'; end if;
 return query
 select jsonb_build_object(
  'ticket_id',t.ticket_id,'category',t.category,'subject',t.subject,'description',t.description,
  'status',t.status,'priority',t.priority,'created_at',t.created_at,'requester_email',u.email,
  'admin_response',t.admin_response,
  'current_project_limit',case when t.category='Capacity increase' and f.freelancer_id is not null
    then public.worksync_freelancer_project_limit(f.freelancer_id) else null end
 )
 from public.support_tickets t join public."Users" u on u.user_id=t.requester_id
 left join public.freelancer_profiles f on f.user_id=t.requester_id
 where p_status is null or t.status=p_status
 order by case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,t.created_at asc;
end; $$;

create or replace function public.worksync_admin_decide_capacity_ticket(
 p_ticket uuid,p_new_limit integer,p_response text
) returns void language plpgsql security definer set search_path='' as $$
declare t public.support_tickets; fid uuid; old_limit integer;
begin
 if not public.worksync_is_admin() then raise exception 'Administrator access required'; end if;
 if coalesce(length(trim(p_response)),0) not between 1 and 4000 then raise exception 'A response is required and must be at most 4000 characters'; end if;
 select * into t from public.support_tickets where ticket_id=p_ticket and category='Capacity increase' for update;
 if not found then raise exception 'Capacity request ticket not found'; end if;
 if t.status in ('resolved','closed') then raise exception 'This capacity request has already been resolved'; end if;
 select f.freelancer_id into fid from public.freelancer_profiles f where f.user_id=t.requester_id;
 if fid is null then raise exception 'The requester no longer has a freelancer profile'; end if;
 if p_new_limit is not null then
  old_limit:=public.worksync_freelancer_project_limit(fid);
  if p_new_limit<=old_limit or p_new_limit>100 then raise exception 'The approved limit must be higher than the current limit and no more than 100'; end if;
  if not public.worksync_freelancer_capacity_eligible(fid) then raise exception 'This freelancer no longer meets the capacity increase requirements'; end if;
  insert into public.freelancer_project_capacity_limits(freelancer_id,project_limit,updated_by,reason)
  values(fid,p_new_limit,auth.uid(),trim(p_response))
  on conflict(freelancer_id) do update set project_limit=excluded.project_limit,updated_by=excluded.updated_by,reason=excluded.reason,updated_at=now();
 end if;
 update public.support_tickets set status='resolved',admin_response=trim(p_response),assigned_to=auth.uid(),updated_at=now(),responded_at=now(),resolved_at=now()
 where ticket_id=p_ticket;
 insert into public.admin_audit_log(admin_id,action,target_id,details)
 values(auth.uid(),case when p_new_limit is null then 'capacity_request:declined' else 'capacity_request:approved' end,p_ticket,
  jsonb_build_object('freelancer_id',fid,'new_limit',p_new_limit,'response',trim(p_response)));
 insert into public.notifications(user_id,type,title,message,related_id,is_read)
 values(t.requester_id,'capacity_request_update',case when p_new_limit is null then 'Capacity request reviewed' else 'Project capacity increased' end,trim(p_response),p_ticket,false);
end; $$;

revoke all on function public.worksync_submit_support_ticket(text,text,text),public.worksync_admin_decide_capacity_ticket(uuid,integer,text) from public;
grant execute on function public.worksync_submit_support_ticket(text,text,text) to authenticated;
grant execute on function public.worksync_admin_decide_capacity_ticket(uuid,integer,text) to authenticated;
notify pgrst,'reload schema';
commit;
