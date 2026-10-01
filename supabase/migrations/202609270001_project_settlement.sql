-- SUPERSEDED UNAPPLIED DRAFT: use reviewed 202609300001_payment_readiness.sql instead.
-- Do not replay this historical draft against the supplied production schema.
-- PREPARED, NOT APPLIED. Verify live function bodies/grants before deployment.
-- Full-project settlement only: milestone deliveries are reviewed separately, payout waits for all.
begin;
alter table public.payments add column if not exists settlement_checked_at timestamptz;
create table public.freelancer_payout_accounts (
 user_id uuid not null references public."Users"(user_id),
 mode text not null check (mode in ('test','live')),
 encrypted_destination text not null,
 bank_label text not null,
 account_last4 text not null check (length(account_last4)=4),
 updated_at timestamptz not null default now(),
 primary key(user_id,mode)
);
alter table public.freelancer_payout_accounts enable row level security;
revoke all on public.freelancer_payout_accounts from public,anon,authenticated;
grant all on public.freelancer_payout_accounts to service_role;

create table public.project_payouts (
 payout_id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(project_id),
 payment_id uuid not null references public.payments(payment_id),
 recipient_id uuid not null references public."Users"(user_id),
 mode text not null check (mode in ('test','live')),
 amount numeric not null check(amount>0),
 status text not null default 'awaiting_account' check(status in ('awaiting_account','ready','processing','pending','paid','failed','needs_review')),
 encrypted_destination text,
 provider_batch_id text,
 provider_transfer_id text unique,
 claimed_at timestamptz,
 paid_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(project_id,mode), unique(payment_id)
);
create index project_payouts_worker_queue on public.project_payouts(mode,status,updated_at);
create index payments_settlement_queue on public.payments(settlement_checked_at);
alter table public.project_payouts enable row level security;
revoke all on public.project_payouts from public,anon,authenticated;
grant all on public.project_payouts to service_role;
-- Clients can only read a safe projection through the authenticated API.
alter table public.project_submissions add column if not exists auto_reviewed_at timestamptz;

create or replace function public.worksync_settle_project(p_project uuid,p_payment uuid,p_mode text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.projects; s public.project_submissions; pay public.payments; c public.contracts;
 recipient uuid; payer uuid; due timestamptz; latest uuid; destination text;
begin
 if p_mode not in ('test','live') then raise exception 'Invalid payment mode'; end if;
 select * into p from public.projects where project_id=p_project;
 if p.order_id is null then return; end if;
 select * into c from public.contracts where order_id=p.order_id for update;
 select * into p from public.projects where project_id=p_project for update;
 if p.status::text not in ('active','in_progress','revision','completed') or public.worksync_order_on_hold(p.order_id) then return; end if;
 if c.client_signed_at is null or c.freelancer_signed_at is null or c.final_price<>p.budget then return; end if;
 select user_id into payer from public.client_profiles where client_id=p.client_id;
 select user_id into recipient from public.freelancer_profiles where freelancer_id=p.freelancer_id;
 select * into pay from public.payments where payment_id=p_payment and project_id=p_project for update;
 if pay.payment_id is null or pay.status::text<>'paid' or pay.payer_id<>payer or pay.amount<>p.budget or pay.transaction_reference is null then return; end if;
 -- p_payment and p_mode are supplied by the service worker after provider reconciliation.
 if p.status::text<>'completed' then
   for s in select * from public.project_submissions where project_id=p_project and kind='delivery' and status='submitted' order by created_at,submission_id for update loop
     if s.author_id<>recipient then continue; end if;
     select submission_id into latest from public.project_submissions where project_id=p_project and kind='delivery' and milestone_id is not distinct from s.milestone_id order by created_at desc,submission_id desc limit 1;
     if latest<>s.submission_id then continue; end if;
     if s.milestone_id is null and exists(select 1 from public.milestones where project_id=p_project) then continue; end if;
     if s.milestone_id is not null and not exists(select 1 from public.milestones where milestone_id=s.milestone_id and project_id=p_project and status::text not in ('approved','completed','cancelled')) then continue; end if;
     due:=greatest(s.created_at,least(s.created_at+interval '7 days',coalesce(p.due_date::timestamptz,s.created_at+interval '7 days')));
     if due>now() then continue; end if;
     update public.project_submissions set status='approved',reviewed_at=now(),auto_reviewed_at=now() where submission_id=s.submission_id;
     if s.milestone_id is not null then update public.milestones set status='approved' where milestone_id=s.milestone_id; end if;
     insert into public.notifications(user_id,type,title,message,related_id,is_read)
       select u,'project_update','Delivery automatically approved','The submission review period ended. Payout follows once all project work is approved.',p.order_id,false from unnest(array[payer,recipient]) u;
   end loop;
   if (exists(select 1 from public.milestones where project_id=p_project) and not exists(select 1 from public.milestones where project_id=p_project and status::text not in ('approved','completed')))
      or (not exists(select 1 from public.milestones where project_id=p_project) and exists(select 1 from public.project_submissions where project_id=p_project and kind='delivery' and status='approved')) then
     update public.projects set status='completed',completed_at=now(),updated_at=now() where project_id=p_project;
     update public.service_orders set status='completed',updated_at=now() where order_id=p.order_id;
     update public.contracts set status='completed',updated_at=now() where contract_id=c.contract_id;
   else return;
   end if;
 end if;
 -- Never pay a completed project with no approved deliverable.
 if not exists(select 1 from public.project_submissions where project_id=p_project and kind='delivery' and status='approved') then return; end if;
 select encrypted_destination into destination from public.freelancer_payout_accounts where user_id=recipient and mode=p_mode;
 insert into public.project_payouts(project_id,payment_id,recipient_id,mode,amount,status,encrypted_destination)
 values(p_project,p_payment,recipient,p_mode,pay.amount,case when destination is null then 'awaiting_account' else 'ready' end,destination)
 on conflict(project_id,mode) do nothing;
 update public.project_payouts set encrypted_destination=destination,status='ready',updated_at=now()
 where project_id=p_project and mode=p_mode and status='awaiting_account' and destination is not null;
end; $$;
revoke all on function public.worksync_settle_project(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.worksync_settle_project(uuid,uuid,text) to service_role;

-- Serialize the transfer claim with cancellation/dispute/review routines via the contract lock.
create or replace function public.worksync_claim_payout(p_id uuid) returns setof public.project_payouts
language plpgsql security definer set search_path='' as $$
declare r public.project_payouts; p public.projects; locked uuid;
begin
 select * into r from public.project_payouts where payout_id=p_id;
 select * into p from public.projects where project_id=r.project_id;
 select contract_id into locked from public.contracts where order_id=p.order_id for update;
 select * into p from public.projects where project_id=r.project_id for update;
 select * into r from public.project_payouts where payout_id=p_id for update;
 if r.status<>'ready' or r.encrypted_destination is null or p.status::text<>'completed' or public.worksync_order_on_hold(p.order_id) then return; end if;
 if not exists(select 1 from public.payments where payment_id=r.payment_id and project_id=p.project_id and status::text='paid' and amount=r.amount) then return; end if;
 return query update public.project_payouts set status='processing',claimed_at=now(),updated_at=now() where payout_id=p_id returning *;
end; $$;
revoke all on function public.worksync_claim_payout(uuid) from public,anon,authenticated;
grant execute on function public.worksync_claim_payout(uuid) to service_role;

create or replace function public.worksync_guard_contract() returns trigger
language plpgsql security definer set search_path='' as $$
declare client_user uuid; freelancer_user uuid; order_state text;
begin
 -- Narrow service-only completion path for automatic review. Other fields remain immutable.
 if auth.role()='service_role' and new.status::text='completed'
 and (to_jsonb(new)-'status'-'updated_at')=(to_jsonb(old)-'status'-'updated_at')
 and exists(select 1 from public.projects p where p.order_id=new.order_id and p.status::text='completed')
 and not public.worksync_order_on_hold(new.order_id) then return new; end if;
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

-- Match resolution eligibility to the current converted-order and revision stages.
create or replace function public.worksync_request_cancellation(p_order uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.service_orders; c public.contracts; result uuid; immediate boolean; recipient uuid;
begin
 select * into c from public.contracts where order_id=p_order for update;
 select * into o from public.service_orders where order_id=p_order for update;
 if public.worksync_order_party(p_order) is null or o.status::text not in ('pending','accepted','active','in_progress','converted') then raise exception 'This order cannot be cancelled'; end if;
 if coalesce(length(trim(p_reason)),0) not between 1 and 5000 then raise exception 'A cancellation reason is required'; end if;
 if public.worksync_order_on_hold(p_order) then raise exception 'Resolve the existing dispute or cancellation request first'; end if;
 -- An unconfirmed request can end immediately; a signed agreement requires the other participant.
 immediate:=not exists(select 1 from public.projects where order_id=p_order and status::text in ('active','in_progress','revision')) and not(c.client_signed_at is not null and c.freelancer_signed_at is not null);
 insert into public.project_cancellations(order_id,requested_by,reason,status,responded_by,responded_at,cancelled_at)
 values(p_order,auth.uid(),p_reason,case when immediate then 'accepted' else 'requested' end,case when immediate then auth.uid() end,case when immediate then now() end,case when immediate then now() end) returning cancellation_id into result;
 if immediate then perform public.worksync_cancel_order_internal(p_order); end if;
 for recipient in select user_id from public.client_profiles where client_id=o.client_id union select user_id from public.freelancer_profiles where freelancer_id=o.freelancer_id loop
 insert into public.notifications(user_id,type,title,message,related_id,is_read) values(recipient,'project_update',case when immediate then 'Order cancelled' else 'Cancellation requested' end,p_reason,p_order,false);
 end loop;
 return result;
end; $$;
create or replace function public.worksync_open_dispute(p_id uuid,p_project uuid,p_milestone uuid,p_category text,p_description text,p_path text,p_name text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.projects; locked uuid; recipient uuid;
begin
 select * into p from public.projects where project_id=p_project;
 select contract_id into locked from public.contracts where order_id=p.order_id for update;
 select * into p from public.projects where project_id=p_project for update;
 if public.worksync_project_party(p_project) is null or p.status::text not in ('active','in_progress','revision') then raise exception 'Disputes require an active project and participant access'; end if;
 if public.worksync_order_on_hold(p.order_id) then raise exception 'There is already an open resolution request'; end if;
 if p_milestone is not null and not exists(select 1 from public.milestones where project_id=p_project and milestone_id=p_milestone and status::text<>'completed') then raise exception 'Choose an unfinished milestone from this project'; end if;
 if p_path is not null and (p_path not like p_project::text||'/'||auth.uid()::text||'/'||p_id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='project-attachments' and name=p_path)) then raise exception 'Invalid dispute evidence'; end if;
 insert into public.project_disputes(dispute_id,project_id,milestone_id,opened_by,category,description,evidence_path,evidence_name) values(p_id,p_project,p_milestone,auth.uid(),p_category,p_description,p_path,p_name);
 for recipient in select user_id from public.client_profiles where client_id=p.client_id union select user_id from public.freelancer_profiles where freelancer_id=p.freelancer_id loop
 insert into public.notifications(user_id,type,title,message,related_id,is_read) values(recipient,'project_update','Project dispute opened','Delivery decisions are paused while the dispute is reviewed.',p.order_id,false);
 end loop;
end; $$;
commit;
