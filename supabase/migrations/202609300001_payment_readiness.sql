-- PREPARED, NOT APPLIED. Supersedes the UNAPPLIED 202609270001 settlement draft.
-- Based on supplied live metadata 2026-09-30. Review and test in staging first.
-- Full-project settlement only: milestone deliveries are reviewed separately, payout waits for all.
begin;
alter table public.payments add column if not exists settlement_checked_at timestamptz;
create table if not exists public.freelancer_payout_accounts (
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

create table if not exists public.project_payouts (
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
create index if not exists project_payouts_worker_queue on public.project_payouts(mode,status,updated_at);
create index if not exists payments_settlement_queue on public.payments(settlement_checked_at);
alter table public.project_payouts enable row level security;
revoke all on public.project_payouts from public,anon,authenticated;
grant all on public.project_payouts to service_role;
-- Clients can only read a safe projection through the authenticated API.
alter table public.project_submissions add column if not exists auto_reviewed_at timestamptz;


-- Holds include accepted cancellations even if a legacy RPC left project state unchanged.
create or replace function public.worksync_order_on_hold(p_order uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.project_cancellations where order_id=p_order and status in ('requested','accepted'))
 or exists(select 1 from public.project_disputes d join public.projects p using(project_id) where p.order_id=p_order and (d.status<>'resolved' or d.resolution_action='cancel_project'));
$$;
revoke all on function public.worksync_order_on_hold(uuid) from public,anon,authenticated;
grant execute on function public.worksync_order_on_hold(uuid) to service_role;

-- Every milestone needs its latest freelancer delivery approved, not just a project status flag.
create or replace function public.worksync_payout_work_approved(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.projects p join public.freelancer_profiles f using(freelancer_id)
 where p.project_id=p_id and (
 (exists(select 1 from public.milestones m where m.project_id=p_id)
  and (select sum(m.amount) from public.milestones m where m.project_id=p_id)=p.budget
  and not exists(select 1 from public.milestones m where m.project_id=p_id and
   (m.status::text<>'approved' or not coalesce((select s.status='approved' and s.author_id=f.user_id
      from public.project_submissions s where s.project_id=p_id and s.milestone_id=m.milestone_id and s.kind='delivery'
      order by s.created_at desc,s.submission_id desc limit 1),false))))
 or (not exists(select 1 from public.milestones where project_id=p_id)
  and coalesce((select s.status='approved' and s.author_id=f.user_id from public.project_submissions s
   where s.project_id=p_id and s.milestone_id is null and s.kind='delivery'
   order by s.created_at desc,s.submission_id desc limit 1),false))));
$$;
revoke all on function public.worksync_payout_work_approved(uuid) from public,anon,authenticated;
grant execute on function public.worksync_payout_work_approved(uuid) to service_role;

create or replace function public.worksync_settle_project(p_project uuid,p_payment uuid,p_mode text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.projects; s public.project_submissions; pay public.payments; c public.contracts;
 recipient uuid; payer uuid; due timestamptz; latest uuid; destination text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 if p_mode is null or p_mode not in ('test','live') then raise exception 'Invalid payment mode'; end if;
 select * into p from public.projects where project_id=p_project;
 if p.order_id is null then return; end if;
 select * into c from public.contracts where order_id=p.order_id for update;
 select * into p from public.projects where project_id=p_project for update;
 if p.status::text not in ('active','in_progress','revision','completed') or public.worksync_order_on_hold(p.order_id) then return; end if;
 if c.contract_id is null or c.status::text not in ('active','completed') or c.client_signed_at is null or c.freelancer_signed_at is null or c.final_price is distinct from p.budget then return; end if;
 select user_id into payer from public.client_profiles where client_id=p.client_id;
 select user_id into recipient from public.freelancer_profiles where freelancer_id=p.freelancer_id;
 select * into pay from public.payments where payment_id=p_payment and project_id=p_project for update;
 if pay.payment_id is null or pay.status::text is distinct from 'paid' or payer is null or recipient is null or pay.payer_id is distinct from payer or pay.amount is distinct from p.budget or pay.order_id is distinct from p.order_id or pay.amount is null or pay.amount<=0 or pay.amount::text in ('NaN','Infinity','-Infinity') or pay.transaction_reference is null or pay.provider_payment_id is null or pay.provider is distinct from 'paymongo' or pay.currency is distinct from 'PHP' or pay.livemode is distinct from (p_mode='live') then return; end if;
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
   if public.worksync_payout_work_approved(p_project) then
     update public.projects set status='completed',completed_at=now(),updated_at=now() where project_id=p_project;
     -- The deployed order lifecycle ends at converted; completion belongs to project/contract.
     update public.contracts set status='completed',updated_at=now() where contract_id=c.contract_id;
   else return;
   end if;
 end if;
 if not public.worksync_payout_work_approved(p_project) then return; end if;
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
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 select * into r from public.project_payouts where payout_id=p_id;
 select * into p from public.projects where project_id=r.project_id;
 select contract_id into locked from public.contracts where order_id=p.order_id for update;
 select * into p from public.projects where project_id=r.project_id for update;
 select * into r from public.project_payouts where payout_id=p_id for update;
 if r.payout_id is null or locked is null or p.order_id is null or r.status<>'ready' or r.encrypted_destination is null or p.status::text<>'completed' or public.worksync_order_on_hold(p.order_id) then return; end if;
 if not public.worksync_payout_work_approved(p.project_id) then return; end if;
 if not exists(select 1 from public.contracts where contract_id=locked and status::text in ('active','completed')
   and client_signed_at is not null and freelancer_signed_at is not null and final_price=p.budget) then return; end if;
 if not exists(select 1 from public.freelancer_profiles where freelancer_id=p.freelancer_id and user_id=r.recipient_id) then return; end if;
 if not exists(select 1 from public.payments pay join public.client_profiles cp on cp.client_id=p.client_id
  where pay.payment_id=r.payment_id and pay.project_id=p.project_id and pay.order_id=p.order_id and pay.payer_id=cp.user_id
  and pay.status='paid' and pay.amount=r.amount and pay.amount=p.budget and pay.provider='paymongo'
  and pay.currency='PHP' and pay.livemode=(r.mode='live') and pay.provider_payment_id is not null and pay.transaction_reference is not null) then return; end if;
 return query update public.project_payouts set status='processing',claimed_at=now(),updated_at=now() where payout_id=p_id returning *;
end; $$;
revoke all on function public.worksync_claim_payout(uuid) from public,anon,authenticated;
grant execute on function public.worksync_claim_payout(uuid) to service_role;


-- Preserve supplied participant guards; add only the service automatic-completion branches.
CREATE OR REPLACE FUNCTION public.worksync_guard_contract_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE v_party text;
BEGIN
  IF auth.role()='service_role' AND OLD.status::text='active' AND NEW.status::text='completed'
    AND (to_jsonb(NEW)-'status'-'updated_at')=(to_jsonb(OLD)-'status'-'updated_at')
    AND EXISTS(SELECT 1 FROM public.projects WHERE order_id=NEW.order_id AND status::text='completed')
    AND NOT public.worksync_order_on_hold(NEW.order_id) THEN RETURN NEW; END IF;
  IF public.worksync_is_admin() THEN RETURN NEW; END IF;
  v_party := public.worksync_contract_party(OLD.contract_id);
  IF v_party IS NULL THEN RAISE EXCEPTION 'Only a contract participant may edit this contract' USING errcode='42501'; END IF;
  IF OLD.status::text IN ('active','completed') THEN
    RAISE EXCEPTION 'Finalized contracts cannot be edited' USING errcode='42501';
  END IF;
  IF NEW.contract_id IS DISTINCT FROM OLD.contract_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.application_id IS DISTINCT FROM OLD.application_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Contract identity fields cannot be changed' USING errcode='42501';
  END IF;
  IF v_party = 'client' AND NEW.freelancer_signed_at IS DISTINCT FROM OLD.freelancer_signed_at THEN
    RAISE EXCEPTION 'A client cannot change the freelancer signature' USING errcode='42501';
  END IF;
  IF v_party = 'freelancer' AND NEW.client_signed_at IS DISTINCT FROM OLD.client_signed_at THEN
    RAISE EXCEPTION 'A freelancer cannot change the client signature' USING errcode='42501';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.worksync_guard_submission_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE v_party text := public.worksync_project_party(OLD.project_id);
BEGIN
  IF auth.role()='service_role' AND OLD.kind='delivery' AND OLD.status='submitted' AND NEW.status='approved'
    AND NEW.auto_reviewed_at IS NOT NULL AND NEW.reviewed_at IS NOT NULL
    AND (to_jsonb(NEW)-'status'-'reviewed_at'-'auto_reviewed_at')=(to_jsonb(OLD)-'status'-'reviewed_at'-'auto_reviewed_at')
    THEN RETURN NEW; END IF;
  IF public.worksync_is_admin() THEN RETURN NEW; END IF;
  IF v_party IS NULL OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.submission_id IS DISTINCT FROM OLD.submission_id
     OR NEW.author_id IS DISTINCT FROM OLD.author_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Invalid submission update' USING errcode='42501';
  END IF;
  IF v_party = 'freelancer' THEN
    IF OLD.author_id <> auth.uid() THEN RAISE EXCEPTION 'Only the submission author may edit it' USING errcode='42501'; END IF;
    IF NEW.status = 'approved' THEN RAISE EXCEPTION 'A freelancer cannot approve their own delivery' USING errcode='42501'; END IF;
  ELSE
    IF NEW.body IS DISTINCT FROM OLD.body OR NEW.link IS DISTINCT FROM OLD.link
       OR NEW.attachment_path IS DISTINCT FROM OLD.attachment_path
       OR NEW.attachment_name IS DISTINCT FROM OLD.attachment_name
       OR NEW.kind IS DISTINCT FROM OLD.kind THEN
      RAISE EXCEPTION 'A client may only review a submission' USING errcode='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Durable provider evidence uniqueness. Existing duplicates abort the transaction;
-- no rows are deleted or silently reassigned.
create unique index if not exists payments_paymongo_provider_payment_unique
 on public.payments(provider_payment_id) where provider_payment_id is not null;
create unique index if not exists payments_paymongo_checkout_unique
 on public.payments(transaction_reference) where transaction_reference like 'cs_%';

-- Serialize new holds/work mutations with the claim. A claim committed first
-- cannot be undone by an automatic cancellation; support must reconcile it.
create or replace function public.worksync_lock_payout_workflow() returns trigger
language plpgsql security definer set search_path='' as $$
declare oid uuid; pid uuid; cid uuid;
begin
 if tg_table_name='project_cancellations' then
  oid:=case when tg_op='DELETE' then old.order_id else new.order_id end;
 elsif tg_table_name='projects' then
  pid:=case when tg_op='DELETE' then old.project_id else new.project_id end;
  oid:=case when tg_op='DELETE' then old.order_id else new.order_id end;
 else
  pid:=case when tg_op='DELETE' then old.project_id else new.project_id end;
  select order_id into oid from public.projects where project_id=pid;
 end if;
 if oid is null then return case when tg_op='DELETE' then old else new end; end if;
 select contract_id into cid from public.contracts where order_id=oid for update;
 if exists(select 1 from public.project_payouts r join public.projects p using(project_id)
    where p.order_id=oid and r.status in ('processing','pending','paid','needs_review','failed')) then
  raise exception 'A payout has been claimed. Contact support to reconcile before changing project work or resolution.' using errcode='55000';
 end if;
 return case when tg_op='DELETE' then old else new end;
end; $$;
revoke all on function public.worksync_lock_payout_workflow() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['project_cancellations','project_disputes','project_submissions','milestones','projects'] loop
  execute format('drop trigger if exists worksync_lock_payout_workflow on public.%I',t);
  execute format('create trigger worksync_lock_payout_workflow before insert or update or delete on public.%I for each row execute function public.worksync_lock_payout_workflow()',t);
 end loop;
end; $$;

-- Readiness must check write privileges, not merely the presence of columns.
create or replace function public.worksync_payment_storage_ready() returns boolean
language sql stable security definer set search_path='' as $$
 select to_regclass('public.payments') is not null
 and not has_table_privilege('anon','public.payments','INSERT,UPDATE,DELETE,TRUNCATE')
 and not has_table_privilege('authenticated','public.payments','INSERT,UPDATE,DELETE,TRUNCATE')
 and not exists(select 1 from information_schema.column_privileges where table_schema='public' and table_name='payments'
   and grantee in ('PUBLIC','anon','authenticated') and privilege_type in ('INSERT','UPDATE'))
 and exists(select 1 from pg_index where indexrelid=to_regclass('public.payments_paymongo_provider_payment_unique') and indisunique and indisvalid)
 and exists(select 1 from pg_index where indexrelid=to_regclass('public.payments_paymongo_checkout_unique') and indisunique and indisvalid);
$$;
revoke all on function public.worksync_payment_storage_ready() from public,anon,authenticated;
grant execute on function public.worksync_payment_storage_ready() to service_role;
notify pgrst,'reload schema';
commit;
