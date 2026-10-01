-- PREPARED, NOT APPLIED. Requires 202609300001_payment_readiness.sql.
-- Disable settlement while deploying this migration and its matching application.
-- Full upfront collection; one payout per approved milestone; no provider calls in SQL.
begin;
set local lock_timeout='3s';
lock table public.contracts,public.projects,public.payments,public.project_payouts,
 public.milestones,public.project_submissions,public.project_cancellations,public.project_disputes
 in access exclusive mode nowait;
alter table public.project_payouts add column if not exists milestone_id uuid references public.milestones(milestone_id);
-- Existing full-project milestone payouts require explicit reconciliation, never conversion or deletion.
do $$ begin
 if exists(select 1 from public.project_payouts r where r.milestone_id is null and exists(select 1 from public.milestones m where m.project_id=r.project_id)) then
  raise exception 'Existing full-project payouts for milestone projects require reconciliation before this migration';
 end if;
end; $$;
alter table public.project_payouts drop constraint if exists project_payouts_project_id_mode_key;
alter table public.project_payouts drop constraint if exists project_payouts_payment_id_key;
alter table public.project_payouts drop constraint if exists project_payouts_status_check;
alter table public.project_payouts add constraint project_payouts_status_check check(status in ('awaiting_account','ready','processing','pending','paid','failed','needs_review','cancelled'));
create unique index if not exists project_payouts_standard_unique on public.project_payouts(project_id,mode) where milestone_id is null;
create unique index if not exists project_payouts_milestone_unique on public.project_payouts(project_id,milestone_id,mode) where milestone_id is not null;
create index if not exists project_payouts_funding on public.project_payouts(payment_id,status);

create table if not exists public.project_payment_preferences (
 project_id uuid primary key references public.projects(project_id),
 auto_accept boolean not null default false,
 enabled_at timestamptz,
 changed_by uuid not null references public."Users"(user_id),
 updated_at timestamptz not null default now()
);
create table if not exists public.project_refunds (
 refund_id uuid primary key default gen_random_uuid(),
 payment_id uuid not null unique references public.payments(payment_id),
 project_id uuid not null references public.projects(project_id),
 mode text not null check(mode in ('test','live')),
 amount numeric not null check(amount>0 and amount=round(amount,2) and amount::text not in ('NaN','Infinity','-Infinity')),
 status text not null default 'processing' check(status in ('processing','pending','refunded','failed','needs_review')),
 provider_refund_id text unique,
 claimed_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 refunded_at timestamptz
);
create index if not exists project_refunds_queue on public.project_refunds(mode,status,updated_at);
alter table public.project_payment_preferences enable row level security;
alter table public.project_refunds enable row level security;
revoke all on public.project_payment_preferences,public.project_refunds from public,anon,authenticated;
grant all on public.project_payment_preferences,public.project_refunds to service_role;

create or replace function public.worksync_lock_project_money(p_project uuid) returns void
language plpgsql security definer set search_path='' as $$
declare oid uuid;
begin
 select order_id into oid from public.projects where project_id=p_project;
 perform 1 from public.contracts where order_id=oid for update;
 perform 1 from public.projects where project_id=p_project for update;
end; $$;
revoke all on function public.worksync_lock_project_money(uuid) from public,anon,authenticated;

create or replace function public.worksync_payment_matches_project(p_project uuid,p_payment uuid,p_mode text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.payments pay join public.projects p on p.project_id=pay.project_id
 join public.client_profiles cp on cp.client_id=p.client_id join public.contracts c on c.order_id=p.order_id
 where p.project_id=p_project and pay.payment_id=p_payment and pay.order_id=p.order_id
 and pay.payer_id=cp.user_id and c.client_signed_at is not null and c.freelancer_signed_at is not null
 and c.final_price=p.budget and pay.amount=p.budget and pay.amount>0 and pay.amount=round(pay.amount,2)
 and pay.amount::text not in ('NaN','Infinity','-Infinity') and pay.status='paid' and pay.provider='paymongo'
 and pay.currency='PHP' and p_mode in ('test','live') and pay.livemode=(p_mode='live')
 and pay.provider_payment_id is not null and pay.transaction_reference is not null);
$$;
revoke all on function public.worksync_payment_matches_project(uuid,uuid,text) from public,anon,authenticated;

create or replace function public.worksync_delivery_approved(p_project uuid,p_milestone uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select s.status='approved' and s.author_id=f.user_id
 from public.project_submissions s join public.projects p on p.project_id=s.project_id
 join public.freelancer_profiles f using(freelancer_id)
 where s.project_id=p_project and s.milestone_id is not distinct from p_milestone and s.kind='delivery'
 order by s.created_at desc,s.submission_id desc limit 1),false);
$$;
revoke all on function public.worksync_delivery_approved(uuid,uuid) from public,anon,authenticated;

-- Only the signed-in client can opt in. Applies to deliveries created after opt-in.
create or replace function public.worksync_set_auto_accept(p_project uuid,p_enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.projects; actor uuid:=auth.uid();
begin
 if actor is null or p_enabled is null then raise exception 'Client sign-in required' using errcode='42501'; end if;
 perform public.worksync_lock_project_money(p_project);
 select * into p from public.projects where project_id=p_project;
 if not exists(select 1 from public.client_profiles where client_id=p.client_id and user_id=actor) then raise exception 'Only the assigned client may change automatic acceptance' using errcode='42501'; end if;
 if p.status::text not in ('active','in_progress','revision') or public.worksync_order_on_hold(p.order_id)
  or exists(select 1 from public.project_refunds where project_id=p_project) then raise exception 'Automatic acceptance cannot change for this project'; end if;
 insert into public.project_payment_preferences(project_id,auto_accept,enabled_at,changed_by)
 values(p_project,p_enabled,case when p_enabled then clock_timestamp() end,actor)
 on conflict(project_id) do update set auto_accept=excluded.auto_accept,
 enabled_at=case when not excluded.auto_accept then null when project_payment_preferences.auto_accept then project_payment_preferences.enabled_at else excluded.enabled_at end,
 changed_by=actor,updated_at=clock_timestamp();
 return jsonb_build_object('autoAccept',p_enabled);
end; $$;
revoke all on function public.worksync_set_auto_accept(uuid,boolean) from public,anon;
grant execute on function public.worksync_set_auto_accept(uuid,boolean) to authenticated;

create or replace function public.worksync_claim_project_refund(p_payment uuid,p_mode text) returns setof public.project_refunds
language plpgsql security definer set search_path='' as $$
declare pay public.payments; remainder numeric;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 select * into pay from public.payments where payment_id=p_payment;
 if pay.project_id is null then return; end if;
 perform public.worksync_lock_project_money(pay.project_id);
 select * into pay from public.payments where payment_id=p_payment for update;
 if not public.worksync_payment_matches_project(pay.project_id,p_payment,p_mode) then return; end if;
 if not exists(select 1 from public.project_cancellations where order_id=pay.order_id and status='accepted')
  or exists(select 1 from public.project_disputes where project_id=pay.project_id and status<>'resolved')
  or exists(select 1 from public.project_refunds where payment_id=p_payment) then return; end if;
 -- Claimed/failed/ambiguous transfers remain reserved; never assume failure means returned funds.
 update public.project_payouts set status='cancelled',updated_at=now() where payment_id=p_payment and status in ('awaiting_account','ready');
 select pay.amount-coalesce(sum(amount),0) into remainder from public.project_payouts where payment_id=p_payment and status<>'cancelled';
 if remainder<=0 or remainder<>round(remainder,2) then return; end if;
 if remainder<1 then
  insert into public.project_refunds(payment_id,project_id,mode,amount,status) values(p_payment,pay.project_id,p_mode,remainder,'needs_review');
  return;
 end if;
 return query insert into public.project_refunds(payment_id,project_id,mode,amount) values(p_payment,pay.project_id,p_mode,remainder) returning *;
end; $$;
revoke all on function public.worksync_claim_project_refund(uuid,text) from public,anon,authenticated;
grant execute on function public.worksync_claim_project_refund(uuid,text) to service_role;

-- Lock only the already-funded work; allow later milestones and new dispute/cancellation requests.
create or replace function public.worksync_lock_payout_workflow() returns trigger
language plpgsql security definer set search_path='' as $$
declare pid uuid; oid uuid; mid uuid; locked boolean;
begin
 if tg_table_name='project_cancellations' then
  oid:=case when tg_op='DELETE' then old.order_id else new.order_id end;
  if tg_op='UPDATE' and old.order_id is distinct from new.order_id then raise exception 'Cancellation identity cannot change'; end if;
  select project_id into pid from public.projects where order_id=oid;
 else
  pid:=case when tg_op='DELETE' then old.project_id else new.project_id end;
  if tg_op='UPDATE' and old.project_id is distinct from new.project_id then raise exception 'Project identity cannot change'; end if;
 end if;
 if pid is null then return case when tg_op='DELETE' then old else new end; end if;
 perform public.worksync_lock_project_money(pid);
 if exists(select 1 from public.project_refunds where project_id=pid) then
  if tg_table_name='project_disputes' and tg_op='INSERT' then return new; end if;
  raise exception 'Refund is reserved. Contact support before changing this project.' using errcode='55000';
 end if;
 if tg_table_name in ('project_cancellations','project_disputes') then return case when tg_op='DELETE' then old else new end; end if;
 select exists(select 1 from public.project_payouts where project_id=pid and status<>'cancelled') into locked;
 if not locked then return case when tg_op='DELETE' then old else new end; end if;
 if tg_table_name='projects' then
  if tg_op='DELETE' then raise exception 'Funded project cannot be deleted'; end if;
  if tg_op='UPDATE' and (to_jsonb(new)-'status'-'updated_at'-'completed_at') is distinct from (to_jsonb(old)-'status'-'updated_at'-'completed_at') then raise exception 'Funded project terms cannot change'; end if;
 elsif tg_table_name='milestones' then
  if tg_op in ('INSERT','DELETE') then raise exception 'Funded milestone allocations cannot change'; end if;
  if (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then raise exception 'Funded milestone terms cannot change'; end if;
  mid:=old.milestone_id;
  if new.status is distinct from old.status and exists(select 1 from public.project_payouts where project_id=pid and milestone_id=mid and status<>'cancelled') then raise exception 'Paid or reserved milestone cannot change'; end if;
 elsif tg_table_name='project_submissions' then
  mid:=case when tg_op='DELETE' then old.milestone_id else new.milestone_id end;
  if tg_op='UPDATE' and old.milestone_id is distinct from new.milestone_id then raise exception 'Delivery milestone cannot change'; end if;
  if exists(select 1 from public.project_payouts where project_id=pid and milestone_id is not distinct from mid and status<>'cancelled') then raise exception 'Paid or reserved delivery cannot change'; end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end; $$;

create or replace function public.worksync_review_due(p_project uuid,p_milestone uuid,p_submitted timestamptz) returns timestamptz
language sql stable security definer set search_path='' as $$
 select p_submitted+case when p_milestone is null or p_milestone=(select milestone_id from public.milestones where project_id=p_project order by display_order desc nulls last,created_at desc,milestone_id desc limit 1) then interval '7 days' else interval '3 days' end;
$$;
revoke all on function public.worksync_review_due(uuid,uuid,timestamptz) from public,anon,authenticated;

create or replace function public.worksync_settle_project(p_project uuid,p_payment uuid,p_mode text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.projects; s public.project_submissions; m public.milestones; pay public.payments;
 recipient uuid; payer uuid; destination text; latest uuid; has_milestones boolean; auto_from timestamptz;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
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
 for s in select * from public.project_submissions where project_id=p_project and kind='delivery' and status='submitted' order by created_at,submission_id for update loop
  if s.author_id is distinct from recipient then continue; end if;
  select submission_id into latest from public.project_submissions where project_id=p_project and kind='delivery' and milestone_id is not distinct from s.milestone_id order by created_at desc,submission_id desc limit 1;
  if latest is distinct from s.submission_id then continue; end if;
  if (has_milestones and s.milestone_id is null) or (not has_milestones and s.milestone_id is not null) then continue; end if;
  if s.milestone_id is not null and not exists(select 1 from public.milestones where milestone_id=s.milestone_id and project_id=p_project) then continue; end if;
  if not coalesce(auto_from<=s.created_at,false) and public.worksync_review_due(p_project,s.milestone_id,s.created_at)>now() then continue; end if;
  update public.project_submissions set status='approved',reviewed_at=now(),auto_reviewed_at=now() where submission_id=s.submission_id;
  if s.milestone_id is not null then update public.milestones set status='approved' where milestone_id=s.milestone_id; end if;
  insert into public.notifications(user_id,type,title,message,related_id,is_read)
   select u,'project_update','Delivery automatically approved',case when auto_from<=s.created_at then 'The client enabled automatic acceptance. This delivery is approved; payout remains subject to payment checks.' else 'The delivery review window ended. This delivery is approved; payout remains subject to payment checks.' end,p.order_id,false from unnest(array[payer,recipient]) u;
 end loop;
 select encrypted_destination into destination from public.freelancer_payout_accounts where user_id=recipient and mode=p_mode;
 if has_milestones then
  for m in select * from public.milestones where project_id=p_project and status::text='approved' order by display_order,milestone_id loop
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
 update public.project_payouts set encrypted_destination=destination,status='ready',updated_at=now() where project_id=p_project and mode=p_mode and status='awaiting_account' and destination is not null;
 if public.worksync_payout_work_approved(p_project) and p.status::text<>'completed' then
  update public.projects set status='completed',completed_at=now(),updated_at=now() where project_id=p_project;
  update public.contracts set status='completed',updated_at=now() where order_id=p.order_id;
 end if;
end; $$;
revoke all on function public.worksync_settle_project(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.worksync_settle_project(uuid,uuid,text) to service_role;

create or replace function public.worksync_claim_payout(p_id uuid) returns setof public.project_payouts
language plpgsql security definer set search_path='' as $$
declare r public.project_payouts; p public.projects; pay public.payments; reserved numeric;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 select * into r from public.project_payouts where payout_id=p_id;
 if r.payout_id is null then return; end if;
 perform public.worksync_lock_project_money(r.project_id);
 select * into p from public.projects where project_id=r.project_id;
 select * into pay from public.payments where payment_id=r.payment_id for update;
 select * into r from public.project_payouts where payout_id=p_id for update;
 if r.status<>'ready' or r.encrypted_destination is null or p.order_id is null
  or p.status::text not in ('active','in_progress','revision','completed') or public.worksync_order_on_hold(p.order_id)
  or not public.worksync_payment_matches_project(p.project_id,r.payment_id,r.mode)
  or exists(select 1 from public.project_refunds where payment_id=r.payment_id)
  or not exists(select 1 from public.contracts where order_id=p.order_id and status::text in ('active','completed'))
  or not exists(select 1 from public.freelancer_profiles where freelancer_id=p.freelancer_id and user_id=r.recipient_id) then return; end if;
 if r.milestone_id is null then
  if exists(select 1 from public.milestones where project_id=p.project_id) or r.amount is distinct from p.budget or not public.worksync_delivery_approved(p.project_id,null) then return; end if;
 else
  if not exists(select 1 from public.milestones where milestone_id=r.milestone_id and project_id=p.project_id and status::text='approved' and amount=r.amount)
   or not public.worksync_delivery_approved(p.project_id,r.milestone_id)
   or (select sum(amount) from public.milestones where project_id=p.project_id) is distinct from p.budget then return; end if;
 end if;
 select coalesce(sum(amount),0) into reserved from public.project_payouts where payment_id=r.payment_id and status<>'cancelled';
 if reserved>pay.amount or r.amount<=0 or r.amount<>round(r.amount,2) or r.amount::text in ('NaN','Infinity','-Infinity') then return; end if;
 return query update public.project_payouts set status='processing',claimed_at=now(),updated_at=now() where payout_id=p_id returning *;
end; $$;
revoke all on function public.worksync_claim_payout(uuid) from public,anon,authenticated;
grant execute on function public.worksync_claim_payout(uuid) to service_role;

create or replace function public.worksync_settlement_version() returns integer
language sql stable security definer set search_path='' as $$ select 2 $$;
revoke all on function public.worksync_settlement_version() from public,anon,authenticated;
grant execute on function public.worksync_settlement_version() to service_role;
create or replace function public.worksync_project_settlement_info(p_project uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'autoAccept',coalesce((select auto_accept from public.project_payment_preferences where project_id=p_project),false),
 'finalMilestoneId',(select milestone_id from public.milestones where project_id=p_project order by display_order desc nulls last,created_at desc,milestone_id desc limit 1),
 'payouts',coalesce((select jsonb_agg(jsonb_build_object('payout_id',r.payout_id,'milestone_id',r.milestone_id,'title',coalesce(m.title,'Project delivery'),'mode',r.mode,'status',r.status,'amount',r.amount,'paid_at',r.paid_at) order by r.created_at,r.payout_id) from public.project_payouts r left join public.milestones m using(milestone_id) where r.project_id=p_project),'[]'::jsonb),
 'refunds',coalesce((select jsonb_agg(jsonb_build_object('refund_id',refund_id,'mode',mode,'status',status,'amount',amount,'refunded_at',refunded_at) order by claimed_at) from public.project_refunds where project_id=p_project),'[]'::jsonb));
$$;
revoke all on function public.worksync_project_settlement_info(uuid) from public,anon,authenticated;
grant execute on function public.worksync_project_settlement_info(uuid) to service_role;
notify pgrst,'reload schema';
commit;
