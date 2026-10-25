-- PREPARED, NOT APPLIED. Requires 202609300004_milestone_settlement.sql,
-- 202610210002_philippine_tax_records.sql, and 202610250004_hybrid_r2_large_uploads.sql.
-- Review and provider reconciliation rules remain server-side and transactional.
begin;
set local lock_timeout='3s';
lock table public.contracts,public.projects,public.payments,public.project_payouts,
 public.milestones,public.project_submissions,public.project_cancellations,public.project_disputes
 in access exclusive mode nowait;

-- Existing projects only stored a calendar date. Preserve that entire date as their deadline.
alter table public.projects add column if not exists deadline_at timestamptz;
 update public.projects set deadline_at=((due_date::date+1)::timestamp-interval '1 microsecond') at time zone 'Asia/Manila'
 where deadline_at is null and due_date is not null;

create or replace function public.worksync_set_project_deadline_at()
returns trigger language plpgsql security definer set search_path='' as $$
declare signed_at timestamptz; delivery_days integer;
begin
 if tg_op='INSERT' or new.deadline_at is null or new.due_date is distinct from old.due_date then
  select c.freelancer_signed_at,c.delivery_time_days into signed_at,delivery_days
  from public.contracts c where c.order_id=new.order_id;
  if signed_at is not null and delivery_days is not null then
   new.deadline_at:=signed_at+make_interval(days=>delivery_days);
  elsif new.due_date is not null then
    new.deadline_at:=((new.due_date::date+1)::timestamp-interval '1 microsecond') at time zone 'Asia/Manila';
  end if;
 end if;
 return new;
end; $$;
revoke all on function public.worksync_set_project_deadline_at() from public,anon,authenticated;
drop trigger if exists worksync_set_project_deadline_at on public.projects;
create trigger worksync_set_project_deadline_at before insert or update of due_date,deadline_at
 on public.projects for each row execute function public.worksync_set_project_deadline_at();

create table if not exists public.project_review_email_events (
 event_id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(project_id) on delete cascade,
 submission_id uuid not null references public.project_submissions(submission_id) on delete cascade,
 event_type text not null check(event_type in ('submission_initial','standard_overdue_start','reminder_24h','reminder_48h')),
 scheduled_at timestamptz not null,
 available_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','sending','sent','cancelled')),
 attempts integer not null default 0,
 claimed_at timestamptz,
 notification_created_at timestamptz,
 sent_at timestamptz,
 last_error text,
 created_at timestamptz not null default now(),
 unique(submission_id,event_type)
);
create index if not exists project_review_email_queue on public.project_review_email_events(status,available_at,scheduled_at);
alter table public.project_review_email_events enable row level security;
revoke all on public.project_review_email_events from public,anon,authenticated;
grant select,insert,update on public.project_review_email_events to service_role;

create table if not exists public.project_overdue_actions (
 project_id uuid primary key references public.projects(project_id),
 payment_id uuid not null unique references public.payments(payment_id),
 deadline_at timestamptz not null,
 refund_id uuid unique references public.project_refunds(refund_id),
 refund_confirmed_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.project_overdue_milestones (
 project_id uuid not null references public.projects(project_id),
 milestone_id uuid not null references public.milestones(milestone_id),
 amount numeric not null check(amount>0),
 overdue_at timestamptz not null default now(),
 primary key(project_id,milestone_id)
);
create table if not exists public.project_refund_milestones (
 refund_id uuid not null references public.project_refunds(refund_id),
 project_id uuid not null references public.projects(project_id),
 milestone_id uuid not null references public.milestones(milestone_id),
 amount numeric not null check(amount>0),
 primary key(refund_id,milestone_id)
);
alter table public.project_overdue_actions enable row level security;
alter table public.project_overdue_milestones enable row level security;
alter table public.project_refund_milestones enable row level security;
revoke all on public.project_overdue_actions,public.project_overdue_milestones,public.project_refund_milestones from public,anon,authenticated;
grant select,insert,update on public.project_overdue_actions,public.project_overdue_milestones,public.project_refund_milestones to service_role;

create or replace function public.worksync_review_due(p_project uuid,p_milestone uuid,p_submitted timestamptz)
returns timestamptz language sql stable security definer set search_path='' as $$
 select case when p_milestone is null then p.deadline_at+interval '72 hours'
  else p_submitted+interval '72 hours' end
 from public.projects p where p.project_id=p_project;
$$;
revoke all on function public.worksync_review_due(uuid,uuid,timestamptz) from public,anon,authenticated;

create or replace function public.worksync_settlement_version() returns integer
language sql immutable security definer set search_path='' as $$ select 3 $$;
revoke all on function public.worksync_settlement_version() from public,anon,authenticated;
grant execute on function public.worksync_settlement_version() to service_role;

create or replace function public.worksync_payout_work_approved(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.projects p join public.freelancer_profiles f using(freelancer_id)
 where p.project_id=p_id and (
  (exists(select 1 from public.milestones m where m.project_id=p_id)
   and (select sum(m.amount) from public.milestones m where m.project_id=p_id)=p.budget
   and exists(select 1 from public.milestones m where m.project_id=p_id and m.status::text in ('approved','completed'))
   and not exists(select 1 from public.milestones m where m.project_id=p_id and
    (m.status::text not in ('approved','completed','overdue') or
     (m.status::text in ('approved','completed') and not coalesce((select s.status='approved' and s.author_id=f.user_id
      from public.project_submissions s where s.project_id=p_id and s.milestone_id=m.milestone_id and s.kind='delivery'
      order by s.created_at desc,s.submission_id desc limit 1),false)))))
  or (not exists(select 1 from public.milestones where project_id=p_id)
   and coalesce((select s.status='approved' and s.author_id=f.user_id from public.project_submissions s
    where s.project_id=p_id and s.milestone_id is null and s.kind='delivery'
    order by s.created_at desc,s.submission_id desc limit 1),false))));
$$;
revoke all on function public.worksync_payout_work_approved(uuid) from public,anon,authenticated;
grant execute on function public.worksync_payout_work_approved(uuid) to service_role;

create or replace function public.worksync_queue_project_review_emails()
returns trigger language plpgsql security definer set search_path='' as $$
declare p public.projects; client_user uuid; deadline timestamptz;
begin
 if new.kind<>'delivery' or new.status<>'submitted' then return new; end if;
 select * into p from public.projects where project_id=new.project_id;
 select user_id into client_user from public.client_profiles where client_id=p.client_id;
 if client_user is null then return new; end if;
 insert into public.project_review_email_events(project_id,submission_id,event_type,scheduled_at)
 values(p.project_id,new.submission_id,'submission_initial',new.created_at)
 on conflict(submission_id,event_type) do nothing;
 if new.milestone_id is null then
  deadline:=p.deadline_at;
  if deadline is not null then
   insert into public.project_review_email_events(project_id,submission_id,event_type,scheduled_at)
    values(p.project_id,new.submission_id,'standard_overdue_start',greatest(deadline,new.created_at))
   on conflict(submission_id,event_type) do nothing;
    if deadline+interval '24 hours'>new.created_at then
     insert into public.project_review_email_events(project_id,submission_id,event_type,scheduled_at)
      values(p.project_id,new.submission_id,'reminder_24h',deadline+interval '24 hours')
      on conflict(submission_id,event_type) do nothing;
    end if;
    if deadline+interval '48 hours'>new.created_at then
     insert into public.project_review_email_events(project_id,submission_id,event_type,scheduled_at)
      values(p.project_id,new.submission_id,'reminder_48h',deadline+interval '48 hours')
      on conflict(submission_id,event_type) do nothing;
    end if;
  end if;
 else
  insert into public.project_review_email_events(project_id,submission_id,event_type,scheduled_at)
  values(p.project_id,new.submission_id,'reminder_24h',new.created_at+interval '24 hours'),
   (p.project_id,new.submission_id,'reminder_48h',new.created_at+interval '48 hours')
  on conflict(submission_id,event_type) do nothing;
 end if;
 return new;
end; $$;
revoke all on function public.worksync_queue_project_review_emails() from public,anon,authenticated;
drop trigger if exists worksync_queue_project_review_emails on public.project_submissions;
create trigger worksync_queue_project_review_emails after insert on public.project_submissions
 for each row execute function public.worksync_queue_project_review_emails();

create or replace function public.worksync_cancel_project_review_emails()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from 'submitted' then
  update public.project_review_email_events set status='cancelled'
  where submission_id=new.submission_id and status in ('pending','sending');
 end if;
 return new;
end; $$;
revoke all on function public.worksync_cancel_project_review_emails() from public,anon,authenticated;
drop trigger if exists worksync_cancel_project_review_emails on public.project_submissions;
create trigger worksync_cancel_project_review_emails after update of status on public.project_submissions
 for each row when (new.status is distinct from old.status)
 execute function public.worksync_cancel_project_review_emails();

create or replace function public.worksync_claim_project_review_emails(p_limit integer default 100)
returns table(event_id uuid,submission_id uuid,project_id uuid,milestone_id uuid,event_type text,
 recipient_user_id uuid,project_title text,milestone_title text,order_id uuid,
 scheduled_at timestamptz,response_deadline timestamptz,auto_accept_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare e record; s public.project_submissions; p public.projects; recipient uuid; deadline timestamptz; acceptance timestamptz;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 if p_limit is null or p_limit<1 or p_limit>250 then raise exception 'Choose a batch size from 1 to 250'; end if;
 update public.project_review_email_events set status='pending',claimed_at=null,available_at=now()
 where status='sending' and claimed_at<now()-interval '15 minutes';
 for e in select q.event_id,q.submission_id,q.project_id,q.event_type,q.scheduled_at,q.notification_created_at
  from public.project_review_email_events q
  where q.status='pending' and q.scheduled_at<=now() and q.available_at<=now()
   order by case when q.event_type='submission_initial' then 0 else 1 end,q.scheduled_at,q.event_id
   limit p_limit for update skip locked
 loop
  select * into s from public.project_submissions where project_submissions.submission_id=e.submission_id;
  select * into p from public.projects where projects.project_id=e.project_id;
  if s.submission_id is null or s.kind<>'delivery' or s.status<>'submitted'
    or p.status::text not in ('active','in_progress','revision') or public.worksync_order_on_hold(p.order_id)
    or exists(select 1 from public.project_submissions newer where newer.project_id=s.project_id and newer.kind='delivery'
      and newer.milestone_id is not distinct from s.milestone_id
      and (newer.created_at>s.created_at or (newer.created_at=s.created_at and newer.submission_id>s.submission_id))) then
   update public.project_review_email_events set status='cancelled' where project_review_email_events.event_id=e.event_id;
   continue;
  end if;
  acceptance:=public.worksync_review_due(p.project_id,s.milestone_id,s.created_at);
   deadline:=case when s.milestone_id is null then p.deadline_at else acceptance end;
  if e.event_type<>'submission_initial' and acceptance<=now() then
   update public.project_review_email_events set status='cancelled' where project_review_email_events.event_id=e.event_id;
   continue;
  end if;
  select cp.user_id into recipient from public.client_profiles cp where cp.client_id=p.client_id;
  if recipient is null then
   update public.project_review_email_events set status='cancelled' where project_review_email_events.event_id=e.event_id;
   continue;
  end if;
  if e.event_type<>'submission_initial' and e.notification_created_at is null then
   insert into public.notifications(user_id,type,title,message,related_id,is_read)
   values(recipient,'project_update',case e.event_type
     when 'standard_overdue_start' then 'Project review grace period started'
     when 'reminder_24h' then 'Project work is waiting for your review'
     else 'Final reminder: project work is awaiting review' end,
    case when s.milestone_id is null then 'Review the submitted project work. Automatic acceptance is scheduled for '||acceptance::text||'.'
     else 'Review the submitted milestone. Automatic acceptance is scheduled for '||acceptance::text||'.' end,p.order_id,false);
  end if;
  update public.project_review_email_events set status='sending',claimed_at=now(),attempts=attempts+1,
   notification_created_at=case when e.event_type='submission_initial' then notification_created_at else coalesce(notification_created_at,now()) end
  where project_review_email_events.event_id=e.event_id;
  event_id:=e.event_id; submission_id:=s.submission_id; project_id:=p.project_id; milestone_id:=s.milestone_id;
  event_type:=e.event_type; recipient_user_id:=recipient; project_title:=p.title; order_id:=p.order_id;
  select m.title into milestone_title from public.milestones m where m.milestone_id=s.milestone_id;
  scheduled_at:=e.scheduled_at;
  response_deadline:=deadline;
  auto_accept_at:=acceptance;
  return next;
 end loop;
end; $$;
revoke all on function public.worksync_claim_project_review_emails(integer) from public,anon,authenticated;
grant execute on function public.worksync_claim_project_review_emails(integer) to service_role;

create or replace function public.worksync_finish_project_review_email(p_event uuid,p_sent boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 if p_sent then
  update public.project_review_email_events set status='sent',sent_at=now(),last_error=null
  where event_id=p_event and status='sending';
 else
  update public.project_review_email_events set status='pending',claimed_at=null,
   available_at=now()+least(interval '1 hour',interval '5 minutes'*greatest(1,attempts)),last_error='delivery_failed'
  where event_id=p_event and status='sending';
 end if;
end; $$;
revoke all on function public.worksync_finish_project_review_email(uuid,boolean) from public,anon,authenticated;
grant execute on function public.worksync_finish_project_review_email(uuid,boolean) to service_role;

create or replace function public.worksync_guard_project_delivery_after_overdue()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind='delivery' and new.milestone_id is not null and exists(
  select 1 from public.project_overdue_milestones x where x.project_id=new.project_id and x.milestone_id=new.milestone_id
 ) then raise exception 'This milestone was closed when the project overdue period ended'; end if;
 return new;
end; $$;
revoke all on function public.worksync_guard_project_delivery_after_overdue() from public,anon,authenticated;
drop trigger if exists worksync_guard_project_delivery_after_overdue on public.project_submissions;
create trigger worksync_guard_project_delivery_after_overdue before insert on public.project_submissions
 for each row execute function public.worksync_guard_project_delivery_after_overdue();

create or replace function public.worksync_settle_project(p_project uuid,p_payment uuid,p_mode text)
returns void language plpgsql security definer set search_path='' as $$
declare p public.projects; s public.project_submissions; m public.milestones; pay public.payments;
 recipient uuid; payer uuid; destination text; latest uuid; has_milestones boolean; auto_from timestamptz;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 if p_mode is null or p_mode not in ('test','live') then raise exception 'Invalid payment mode'; end if;
 perform public.worksync_lock_project_money(p_project);
 select * into p from public.projects where project_id=p_project;
 if p.order_id is null or p.status::text not in ('active','in_progress','revision','completed') or public.worksync_order_on_hold(p.order_id) then return; end if;
 select * into pay from public.payments where payment_id=p_payment for update;
 if not public.worksync_payment_matches_project(p_project,p_payment,p_mode)
  or not exists(select 1 from public.contracts where order_id=p.order_id and status::text in ('active','completed'))
  or exists(select 1 from public.project_refunds where payment_id=p_payment) then return; end if;
 select user_id into recipient from public.freelancer_profiles where freelancer_id=p.freelancer_id;
 select user_id into payer from public.client_profiles where client_id=p.client_id;
 if recipient is null or payer is null then return; end if;
 has_milestones:=exists(select 1 from public.milestones where project_id=p_project);
 if has_milestones and ((select sum(amount) from public.milestones where project_id=p_project) is distinct from p.budget
  or exists(select 1 from public.milestones where project_id=p_project and (amount is null or amount<=0 or amount<>round(amount,2) or amount::text in ('NaN','Infinity','-Infinity')))) then return; end if;
 select enabled_at into auto_from from public.project_payment_preferences where project_id=p_project and auto_accept;
 if p.status::text<>'completed' then
 for s in select * from public.project_submissions where project_id=p_project and kind='delivery' and status='submitted' order by created_at,submission_id for update loop
  if s.author_id is distinct from recipient then continue; end if;
  select submission_id into latest from public.project_submissions where project_id=p_project and kind='delivery' and milestone_id is not distinct from s.milestone_id order by created_at desc,submission_id desc limit 1;
  if latest is distinct from s.submission_id then continue; end if;
  if (has_milestones and s.milestone_id is null) or (not has_milestones and s.milestone_id is not null) then continue; end if;
  if s.milestone_id is not null and not exists(select 1 from public.milestones where milestone_id=s.milestone_id and project_id=p_project and status::text not in ('approved','completed','overdue')) then continue; end if;
  if not coalesce(auto_from<=s.created_at,false) and public.worksync_review_due(p_project,s.milestone_id,s.created_at)>now() then continue; end if;
  if public.worksync_review_due(p_project,s.milestone_id,s.created_at) is null then continue; end if;
  update public.project_submissions set status='approved',reviewed_at=now(),auto_reviewed_at=now() where submission_id=s.submission_id and status='submitted';
  if not found then continue; end if;
  if s.milestone_id is not null then update public.milestones set status='approved' where milestone_id=s.milestone_id; end if;
  insert into public.notifications(user_id,type,title,message,related_id,is_read)
   select u,'project_update','Delivery automatically accepted','The client review period ended without a response. Verified payout processing follows the existing payment checks.',p.order_id,false
   from unnest(array[payer,recipient]) u;
 end loop;
 end if;

 if has_milestones and p.deadline_at is not null and p.deadline_at+interval '72 hours'<=now() then
  insert into public.project_overdue_actions(project_id,payment_id,deadline_at)
  values(p_project,p_payment,p.deadline_at) on conflict(project_id) do nothing;
  insert into public.project_overdue_milestones(project_id,milestone_id,amount)
  select m.project_id,m.milestone_id,m.amount from public.milestones m
  where m.project_id=p_project and m.status::text not in ('approved','completed','overdue')
   and not exists(select 1 from public.project_submissions s where s.project_id=p_project and s.milestone_id=m.milestone_id and s.kind='delivery')
  on conflict(project_id,milestone_id) do nothing;
  update public.milestones m set status='overdue'
   where m.project_id=p_project and exists(select 1 from public.project_overdue_milestones x where x.project_id=m.project_id and x.milestone_id=m.milestone_id)
    and m.status::text not in ('approved','completed','overdue');
 end if;

 select encrypted_destination into destination from public.freelancer_payout_accounts where user_id=recipient and mode=p_mode;
 if has_milestones then
  for m in select * from public.milestones where project_id=p_project and status::text in ('approved','completed') order by display_order,milestone_id loop
   if not public.worksync_delivery_approved(p_project,m.milestone_id) then continue; end if;
   insert into public.project_payouts(project_id,payment_id,recipient_id,mode,amount,status,encrypted_destination,milestone_id)
   values(p_project,p_payment,recipient,p_mode,m.amount,case when destination is null then 'awaiting_account' else 'ready' end,destination,m.milestone_id)
   on conflict(project_id,milestone_id,mode) where milestone_id is not null do nothing;
  end loop;
 elsif public.worksync_delivery_approved(p_project,null) then
  insert into public.project_payouts(project_id,payment_id,recipient_id,mode,amount,status,encrypted_destination)
  values(p_project,p_payment,recipient,p_mode,pay.amount,case when destination is null then 'awaiting_account' else 'ready' end,destination)
  on conflict(project_id,mode) where milestone_id is null do nothing;
 end if;
 update public.project_payouts set encrypted_destination=destination,status='ready',updated_at=now()
  where project_id=p_project and mode=p_mode and status='awaiting_account' and destination is not null;
 if public.worksync_payout_work_approved(p_project) and p.status::text<>'completed' then
  update public.projects set status='completed',completed_at=now(),updated_at=now() where project_id=p_project;
  update public.contracts set status='completed',updated_at=now() where order_id=p.order_id;
  insert into public.notifications(user_id,type,title,message,related_id,is_read)
   select u,'project_update','Project completed','All submitted work was accepted. Any eligible unsubmitted milestones are being processed for refund.',p.order_id,false
   from unnest(array[payer,recipient]) u;
 end if;
end; $$;
revoke all on function public.worksync_settle_project(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.worksync_settle_project(uuid,uuid,text) to service_role;

-- Preserve the cancellation refund flow while adding a separate overdue-milestone path.
create or replace function public.worksync_claim_project_refund(p_payment uuid,p_mode text)
returns setof public.project_refunds language plpgsql security definer set search_path='' as $$
declare pay public.payments; p public.projects; refund_amount numeric; refund_row public.project_refunds; overdue boolean;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 select * into pay from public.payments where payment_id=p_payment;
 if pay.project_id is null then return; end if;
 perform public.worksync_lock_project_money(pay.project_id);
 select * into p from public.projects where project_id=pay.project_id for update;
 select * into pay from public.payments where payment_id=p_payment for update;
 if not public.worksync_payment_matches_project(pay.project_id,p_payment,p_mode)
  or exists(select 1 from public.project_refunds where payment_id=p_payment)
  or exists(select 1 from public.project_disputes where project_id=pay.project_id and status<>'resolved') then return; end if;
 overdue:=exists(select 1 from public.project_overdue_actions a where a.project_id=p.project_id and a.payment_id=p_payment)
  and p.deadline_at is not null and p.deadline_at+interval '72 hours'<=now()
  and not public.worksync_order_on_hold(p.order_id);
 if overdue then
  if exists(select 1 from public.milestones m where m.project_id=p.project_id and m.status::text not in ('approved','completed','overdue'))
   or exists(select 1 from public.project_submissions s where s.project_id=p.project_id and s.kind='delivery'
     and s.status<>'approved' and s.submission_id=(select n.submission_id from public.project_submissions n where n.project_id=s.project_id and n.milestone_id is not distinct from s.milestone_id and n.kind='delivery' order by n.created_at desc,n.submission_id desc limit 1))
   or exists(select 1 from public.project_payouts r where r.payment_id=p_payment and r.status not in ('paid','cancelled')) then return; end if;
  if not exists(select 1 from public.project_overdue_milestones x where x.project_id=p.project_id) then return; end if;
  select coalesce(sum(x.amount),0) into refund_amount from public.project_overdue_milestones x where x.project_id=p.project_id;
  if refund_amount<=0 or refund_amount<>round(refund_amount,2) or refund_amount>pay.amount then return; end if;
  if refund_amount+coalesce((select sum(coalesce((to_jsonb(r)->>'gross_amount')::numeric,r.amount)) from public.project_payouts r where r.payment_id=p_payment and r.status<>'cancelled'),0)<>pay.amount then return; end if;
  if refund_amount<1 then
   insert into public.project_refunds(payment_id,project_id,mode,amount,status) values(p_payment,p.project_id,p_mode,refund_amount,'needs_review') returning * into refund_row;
  else
   insert into public.project_refunds(payment_id,project_id,mode,amount) values(p_payment,p.project_id,p_mode,refund_amount) returning * into refund_row;
  end if;
  insert into public.project_refund_milestones(refund_id,project_id,milestone_id,amount)
   select refund_row.refund_id,x.project_id,x.milestone_id,x.amount from public.project_overdue_milestones x where x.project_id=p.project_id;
  update public.project_overdue_actions set refund_id=refund_row.refund_id where project_id=p.project_id;
  if refund_row.status='needs_review' then return; end if;
  return next refund_row; return;
 end if;
 if not exists(select 1 from public.project_cancellations where order_id=pay.order_id and status='accepted') then return; end if;
 -- Existing cancellation path reserves all not-yet-paid outflows before refunding the remainder.
 update public.project_payouts set status='cancelled',updated_at=now()
  where payment_id=p_payment and status in ('awaiting_account','ready');
 select pay.amount-coalesce(sum(coalesce((to_jsonb(r)->>'gross_amount')::numeric,r.amount)),0)
  into refund_amount from public.project_payouts r where r.payment_id=p_payment and r.status<>'cancelled';
 if refund_amount<=0 or refund_amount<>round(refund_amount,2) then return; end if;
 if refund_amount<1 then
  insert into public.project_refunds(payment_id,project_id,mode,amount,status) values(p_payment,p.project_id,p_mode,refund_amount,'needs_review');
  return;
 end if;
 return query insert into public.project_refunds(payment_id,project_id,mode,amount) values(p_payment,p.project_id,p_mode,refund_amount) returning *;
end; $$;
revoke all on function public.worksync_claim_project_refund(uuid,text) from public,anon,authenticated;
grant execute on function public.worksync_claim_project_refund(uuid,text) to service_role;

-- Service-role state changes are limited to outcomes already committed by the settlement worker.
create or replace function public.worksync_guard_contract() returns trigger
language plpgsql security definer set search_path='' as $$
declare client_user uuid; freelancer_user uuid; order_state text;
begin
 if auth.role()='service_role' and new.order_id=old.order_id and new.contract_id=old.contract_id
  and (to_jsonb(new)-'status'-'updated_at')=(to_jsonb(old)-'status'-'updated_at') then
  if new.status::text='completed' and exists(select 1 from public.projects p where p.order_id=new.order_id and p.status::text='completed')
   and not public.worksync_order_on_hold(new.order_id) then return new; end if;
  if new.status::text='cancelled' and exists(
    select 1 from public.project_overdue_actions a join public.project_refunds r on r.refund_id=a.refund_id
    join public.projects p on p.project_id=a.project_id where p.order_id=new.order_id and p.status::text='cancelled' and r.status='refunded'
     and not exists(select 1 from public.milestones m where m.project_id=p.project_id and m.status::text in ('approved','completed'))
   ) then return new; end if;
 end if;
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select c.user_id,f.user_id,o.status::text into client_user,freelancer_user,order_state
 from public.service_orders o join public.client_profiles c using(client_id) join public.freelancer_profiles f using(freelancer_id) where o.order_id=new.order_id;
 if new.status::text='cancelled' and order_state='cancelled' and (to_jsonb(new)-'status'-'updated_at')=(to_jsonb(old)-'status'-'updated_at') and (
  ((auth.uid()=client_user or auth.uid()=freelancer_user) and exists(select 1 from public.project_cancellations where order_id=new.order_id and status='accepted')) or
  (public.worksync_is_admin() and exists(select 1 from public.project_disputes d join public.projects p using(project_id) where p.order_id=new.order_id and d.status='resolved' and d.resolution_action='cancel_project'))) then return new; end if;
 if auth.uid() is distinct from client_user and auth.uid() is distinct from freelancer_user then raise exception 'Only contract participants may update an agreement'; end if;
 if new.order_id is distinct from old.order_id or new.contract_id is distinct from old.contract_id then raise exception 'Contract identity cannot change'; end if;
 if exists(select 1 from public.projects where order_id=new.order_id and status::text in ('active','in_progress','completed','cancelled')) then
  if auth.uid()=client_user and new.status::text='completed' and exists(select 1 from public.projects where order_id=new.order_id and status::text='completed') and (to_jsonb(new)-'status'-'updated_at')=(to_jsonb(old)-'status'-'updated_at') then return new; end if;
  raise exception 'This agreement is locked';
 end if;
 if new.status is distinct from old.status then raise exception 'Contract status is managed by the project workflow'; end if;
 if not public.worksync_marketplace_active(client_user) or not public.worksync_marketplace_active(freelancer_user) then raise exception 'A participant is suspended from new agreements'; end if;
 if public.worksync_order_on_hold(new.order_id) then raise exception 'Resolve the pending cancellation or dispute first'; end if;
 if order_state<>'accepted' then raise exception 'Accept the request before agreeing to a contract'; end if;
 if auth.uid()=client_user and new.freelancer_signed_at is distinct from old.freelancer_signed_at and new.freelancer_signed_at is not null then raise exception 'You cannot sign for the freelancer'; end if;
 if auth.uid()=freelancer_user and new.client_signed_at is distinct from old.client_signed_at and new.client_signed_at is not null then raise exception 'You cannot sign for the client'; end if;
 if (new.final_price,new.delivery_time_days,new.revisions_count,new.terms) is distinct from (old.final_price,old.delivery_time_days,old.revisions_count,old.terms) then
  new.client_signed_at:=null; new.freelancer_signed_at:=null;
  update public.contract_item_approvals set client_approved_at=null,freelancer_approved_at=null where contract_id=old.contract_id;
 end if;
 if new.client_signed_at is not null and new.freelancer_signed_at is not null and (new.final_price is null or new.final_price<=0 or new.delivery_time_days is null or new.delivery_time_days<1 or new.revisions_count is null or new.revisions_count<0) then raise exception 'Agree on a positive budget, delivery days and a revision limit'; end if;
 if new.client_signed_at is not null and new.freelancer_signed_at is not null and exists(select 1 from (values('budget'),('delivery'),('revisions')) as required(key) where not exists(select 1 from public.contract_item_approvals a where a.contract_id=new.contract_id and a.item_key=required.key and a.client_approved_at is not null and a.freelancer_approved_at is not null)) then raise exception 'Both participants must approve all terms before final confirmation'; end if;
 if new.client_signed_at is not null and new.freelancer_signed_at is not null and exists(select 1 from public.service_orders o join public.services s using(service_id) where o.order_id=new.order_id and s.service_type::text='milestone') then
  if coalesce((select sum(m.amount) from public.milestones m join public.projects p using(project_id) where p.order_id=new.order_id),0)<>new.final_price then raise exception 'Milestones must add up to the agreed budget'; end if;
  if exists(select 1 from public.milestones m join public.projects p using(project_id) where p.order_id=new.order_id and not exists(select 1 from public.contract_item_approvals a where a.contract_id=new.contract_id and a.item_key='milestone:'||m.milestone_id::text and a.client_approved_at is not null and a.freelancer_approved_at is not null)) then raise exception 'Both participants must approve every milestone before signing'; end if;
 end if;
 if new.client_signed_at is not null and new.freelancer_signed_at is not null then new.status:='active'; end if;
 return new;
end; $$;

create or replace function public.worksync_project_refund_outcome_notice()
returns trigger language plpgsql security definer set search_path='' as $$
declare p public.projects; c_user uuid; f_user uuid; names text; uid_text text;
begin
 if new.status is distinct from 'refunded' or old.status='refunded' then return new; end if;
 if not exists(select 1 from public.project_overdue_actions a where a.refund_id=new.refund_id) then return new; end if;
 select * into p from public.projects where project_id=new.project_id for update;
 select user_id into c_user from public.client_profiles where client_id=p.client_id;
 select user_id into f_user from public.freelancer_profiles where freelancer_id=p.freelancer_id;
 select coalesce(string_agg(m.title,', ' order by m.display_order),'remaining milestones') into names
  from public.project_refund_milestones x join public.milestones m using(milestone_id) where x.refund_id=new.refund_id;
 if not exists(select 1 from public.milestones m where m.project_id=p.project_id and m.status::text in ('approved','completed')) then
  update public.projects set status='cancelled',updated_at=now() where project_id=p.project_id and status::text not in ('completed','cancelled');
  update public.contracts set status='cancelled',updated_at=now() where order_id=p.order_id and status::text not in ('completed','cancelled');
 end if;
 for uid_text in select unnest(array[c_user::text,f_user::text]) loop
  if uid_text is null then continue; end if;
  insert into public.notifications(user_id,type,title,message,related_id,is_read)
  values(uid_text::uuid,'project_update','Overdue milestone refund completed',
   'The client refund for '||coalesce(names,'remaining milestones')||' was confirmed by the payment provider.',p.order_id,false);
 end loop;
 update public.project_overdue_actions set refund_confirmed_at=new.refunded_at where refund_id=new.refund_id;
 return new;
end; $$;
revoke all on function public.worksync_project_refund_outcome_notice() from public,anon,authenticated;
drop trigger if exists worksync_project_refund_outcome_notice on public.project_refunds;
create trigger worksync_project_refund_outcome_notice after update of status on public.project_refunds
 for each row when (new.status='refunded' and old.status is distinct from new.status)
 execute function public.worksync_project_refund_outcome_notice();

create or replace function public.worksync_project_review_deadline(p_project uuid,p_submission uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('reviewDeadline',case when s.milestone_id is null then p.deadline_at else s.created_at+interval '72 hours' end,
  'autoAcceptAt',public.worksync_review_due(p.project_id,s.milestone_id,s.created_at),
  'milestoneTitle',m.title,'projectTitle',p.title,'orderId',p.order_id)
 from public.projects p join public.project_submissions s on s.project_id=p.project_id
 left join public.milestones m on m.milestone_id=s.milestone_id
 where p.project_id=p_project and s.submission_id=p_submission and s.kind='delivery';
$$;
revoke all on function public.worksync_project_review_deadline(uuid,uuid) from public,anon,authenticated;
grant execute on function public.worksync_project_review_deadline(uuid,uuid) to service_role;

notify pgrst,'reload schema';
commit;
