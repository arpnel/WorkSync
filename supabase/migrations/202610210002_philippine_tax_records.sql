-- PREPARED, NOT APPLIED. Requires legal review of WorkSync's withholding-agent status and seller onboarding.
-- Adds transaction snapshots and manually reviewed BIR sworn-declaration records.
begin;

create table if not exists public.freelancer_tax_profiles (
  user_id uuid primary key references public."Users"(user_id) on delete cascade,
  marketplace_withholding_applicable boolean not null default false,
  freelancer_vat_applicable boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public."Users"(user_id)
);
alter table public.freelancer_tax_profiles enable row level security;
revoke all on public.freelancer_tax_profiles from public, anon, authenticated;
grant all on public.freelancer_tax_profiles to service_role;

create table if not exists public.freelancer_tax_declarations (
  declaration_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public."Users"(user_id) on delete cascade,
  tax_year integer not null check (tax_year between 2024 and 2100),
  reported_threshold_status text not null check (reported_threshold_status in ('not_exceeding','exceeded')),
  document_path text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public."Users"(user_id),
  reviewed_at timestamptz,
  review_notes text not null default '',
  check ((status='pending' and reviewed_by is null and reviewed_at is null)
      or (status<>'pending' and reviewed_by is not null and reviewed_at is not null))
);
create unique index if not exists freelancer_tax_declarations_active_year on public.freelancer_tax_declarations(user_id,tax_year) where status='pending';
alter table public.freelancer_tax_declarations enable row level security;
revoke all on public.freelancer_tax_declarations from public, anon, authenticated;
grant select, insert on public.freelancer_tax_declarations to authenticated;
drop policy if exists freelancer_tax_declarations_owner_read on public.freelancer_tax_declarations;
create policy freelancer_tax_declarations_owner_read on public.freelancer_tax_declarations
  for select to authenticated using (user_id=auth.uid() or public.worksync_is_admin());
drop policy if exists freelancer_tax_declarations_owner_submit on public.freelancer_tax_declarations;
create policy freelancer_tax_declarations_owner_submit on public.freelancer_tax_declarations
  for insert to authenticated with check (user_id=auth.uid() and status='pending' and reviewed_by is null and reviewed_at is null and review_notes='');

alter table public.project_payouts add column if not exists gross_amount numeric;
update public.project_payouts set gross_amount=amount where gross_amount is null;
alter table public.project_payouts alter column gross_amount set not null;
alter table public.project_payouts add column if not exists freelancer_vat_taxable_amount numeric not null default 0;
alter table public.project_payouts add column if not exists freelancer_vat_amount numeric not null default 0;
alter table public.project_payouts add column if not exists freelancer_vat_rate numeric not null default 0;
alter table public.project_payouts add column if not exists freelancer_vat_rule text not null default 'not applicable';
update public.project_payouts set freelancer_vat_taxable_amount=gross_amount where freelancer_vat_amount=0 and freelancer_vat_taxable_amount=0;
alter table public.project_payouts add column if not exists withholding_basis numeric not null default 0;
alter table public.project_payouts add column if not exists withholding_rate numeric not null default 0;
alter table public.project_payouts add column if not exists withholding_amount numeric not null default 0;
alter table public.project_payouts add column if not exists withholding_date timestamptz;
alter table public.project_payouts add column if not exists withholding_rule text not null default 'none';
alter table public.project_payouts add column if not exists withholding_exemption_status text not null default 'not_applicable';

create or replace function public.worksync_apply_payout_tax_snapshot() returns trigger
language plpgsql security definer set search_path='' as $$
declare applicable boolean:=false; exemption text:='none'; latest_status text; latest_threshold_status text; prior_gross numeric:=0; current_year integer:=extract(year from now() at time zone 'Asia/Manila')::integer;
begin
  if new.gross_amount is null then new.gross_amount:=new.amount; end if;
  if coalesce((select freelancer_vat_applicable from public.freelancer_tax_profiles where user_id=new.recipient_id),false) then
    new.freelancer_vat_rate:=0.12;
    new.freelancer_vat_rule:='PH VAT 12% on freelancer service; agreed price treated VAT-inclusive';
    new.freelancer_vat_taxable_amount:=round(new.gross_amount/1.12,2);
    new.freelancer_vat_amount:=new.gross_amount-new.freelancer_vat_taxable_amount;
  else
    new.freelancer_vat_rate:=0; new.freelancer_vat_rule:='not configured as applicable';
    new.freelancer_vat_taxable_amount:=new.gross_amount;
    new.freelancer_vat_amount:=0;
  end if;
  select status,reported_threshold_status into latest_status, latest_threshold_status
    from public.freelancer_tax_declarations where user_id=new.recipient_id and tax_year=current_year
    order by submitted_at desc limit 1;
  if latest_status='pending' then
    if latest_threshold_status='exceeded' then
      exemption:='threshold_exceeded_pending_review';
    else exemption:='submitted_pending_review'; end if;
  elsif latest_status='accepted' then
    if latest_threshold_status='exceeded' then exemption:='accepted_threshold_exceeded'; else exemption:='accepted'; end if;
  elsif latest_status='rejected' then exemption:='rejected';
  else exemption:='none'; end if;
  if applicable then
    select coalesce(sum(gross_amount),0) into prior_gross from public.project_payouts
      where recipient_id=new.recipient_id and status<>'cancelled'
        and created_at>=make_timestamptz(current_year,1,1,0,0,0,'Asia/Manila') and created_at<make_timestamptz(current_year+1,1,1,0,0,0,'Asia/Manila');
    new.withholding_rate:=0.005;
    if exemption='accepted' and prior_gross+new.gross_amount<=500000 then
      new.withholding_basis:=0;
    else
      if exemption='accepted' then exemption:='threshold_crossed'; end if;
      new.withholding_basis:=new.gross_amount;
      new.withholding_amount:=round(new.gross_amount*new.withholding_rate,2);
    end if;
    new.withholding_rule:='PH RR 5-2025 gross remittances; RR 16-2023 and RMC 8-2024 threshold process';
    new.withholding_date:=case when new.withholding_amount>0 then now() else null end;
    new.withholding_exemption_status:=exemption;
    new.amount:=new.gross_amount-new.withholding_amount;
  else
    new.withholding_basis:=0; new.withholding_rate:=0; new.withholding_amount:=0;
    new.withholding_rule:='not configured as applicable';
    new.withholding_date:=null;
    new.withholding_exemption_status:=exemption;
    new.amount:=new.gross_amount;
  end if;
  if new.amount<=0 then raise exception 'Tax deductions exceed freelancer payout'; end if;
  return new;
end; $$;
revoke all on function public.worksync_apply_payout_tax_snapshot() from public,anon,authenticated;
drop trigger if exists worksync_apply_payout_tax_snapshot on public.project_payouts;
create trigger worksync_apply_payout_tax_snapshot before insert on public.project_payouts
  for each row execute function public.worksync_apply_payout_tax_snapshot();

create or replace function public.worksync_guard_payout_tax_snapshot() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.gross_amount,new.freelancer_vat_taxable_amount,new.freelancer_vat_amount,new.freelancer_vat_rate,new.freelancer_vat_rule,new.withholding_basis,new.withholding_rate,new.withholding_amount,new.withholding_date,new.withholding_rule,new.withholding_exemption_status)
     is distinct from
     (old.gross_amount,old.freelancer_vat_taxable_amount,old.freelancer_vat_amount,old.freelancer_vat_rate,old.freelancer_vat_rule,old.withholding_basis,old.withholding_rate,old.withholding_amount,old.withholding_date,old.withholding_rule,old.withholding_exemption_status) then
    raise exception 'Settled tax snapshots are immutable' using errcode='55000';
  end if;
  return new;
end; $$;
revoke all on function public.worksync_guard_payout_tax_snapshot() from public,anon,authenticated;
drop trigger if exists worksync_guard_payout_tax_snapshot on public.project_payouts;
create trigger worksync_guard_payout_tax_snapshot before update on public.project_payouts
  for each row execute function public.worksync_guard_payout_tax_snapshot();

-- Keep the existing payout reservation and provider transfer contracts intact:
-- payout.amount is net cash transfer; gross_amount is the amount reserved against client funding.
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
  if exists(select 1 from public.milestones where project_id=p.project_id) or r.gross_amount is distinct from p.budget or not public.worksync_delivery_approved(p.project_id,null) then return; end if;
 else
  if not exists(select 1 from public.milestones where milestone_id=r.milestone_id and project_id=p.project_id and status::text='approved' and amount=r.gross_amount)
   or not public.worksync_delivery_approved(p.project_id,r.milestone_id)
   or (select sum(amount) from public.milestones where project_id=p.project_id) is distinct from p.budget then return; end if;
 end if;
 select coalesce(sum(gross_amount),0) into reserved from public.project_payouts where payment_id=r.payment_id and status<>'cancelled';
 if reserved>pay.amount or r.amount<=0 or r.amount<>round(r.amount,2) or r.amount::text in ('NaN','Infinity','-Infinity')
  or r.withholding_amount<0 or r.withholding_amount>r.gross_amount or r.amount<>r.gross_amount-r.withholding_amount then return; end if;
 return query update public.project_payouts set status='processing',claimed_at=now(),updated_at=now() where payout_id=p_id returning *;
end; $$;
revoke all on function public.worksync_claim_payout(uuid) from public,anon,authenticated;
grant execute on function public.worksync_claim_payout(uuid) to service_role;

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
 update public.project_payouts set status='cancelled',updated_at=now() where payment_id=p_payment and status in ('awaiting_account','ready');
 select pay.amount-coalesce(sum(gross_amount),0) into remainder from public.project_payouts where payment_id=p_payment and status<>'cancelled';
 if remainder<=0 or remainder<>round(remainder,2) then return; end if;
 if remainder<1 then
  insert into public.project_refunds(payment_id,project_id,mode,amount,status) values(p_payment,pay.project_id,p_mode,remainder,'needs_review');
  return;
 end if;
 return query insert into public.project_refunds(payment_id,project_id,mode,amount) values(p_payment,pay.project_id,p_mode,remainder) returning *;
end; $$;
revoke all on function public.worksync_claim_project_refund(uuid,text) from public,anon,authenticated;
grant execute on function public.worksync_claim_project_refund(uuid,text) to service_role;
create or replace function public.worksync_review_tax_declaration(p_declaration uuid,p_decision text,p_notes text default '') returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.worksync_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_decision not in ('accepted','rejected') or length(coalesce(p_notes,''))>2000 then raise exception 'Invalid review decision'; end if;
 update public.freelancer_tax_declarations set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_notes=coalesce(p_notes,'')
  where declaration_id=p_declaration and status='pending';
 if not found then raise exception 'Pending declaration not found'; end if;
end; $$;
revoke all on function public.worksync_review_tax_declaration(uuid,text,text) from public,anon;
grant execute on function public.worksync_review_tax_declaration(uuid,text,text) to authenticated;

-- The tax migration can be run from the SQL Editor without the dispute-access helper
-- functions being present. Keep these definitions aligned with 202609140014_dispute_access.sql.
create or replace function public.worksync_project_file_read(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.project_submissions s where s.attachment_path=p_path and (public.worksync_project_party(s.project_id) is not null or (public.worksync_is_admin() and exists(select 1 from public.project_disputes d where d.project_id=s.project_id))))
 or exists(select 1 from public.project_disputes d where d.evidence_path=p_path and (public.worksync_project_party(d.project_id) is not null or public.worksync_is_admin()));
$$;
create or replace function public.worksync_private_file_orphan(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select case when p_bucket='project-attachments' then (storage.foldername(p_path))[2]=auth.uid()::text and not exists(select 1 from public.project_submissions where attachment_path=p_path) and not exists(select 1 from public.project_disputes where evidence_path=p_path)
 when p_bucket='verification-documents' then (storage.foldername(p_path))[1]=auth.uid()::text and not exists(select 1 from public.verification_requests where p_path=any(document_paths)) else false end;
$$;
revoke all on function public.worksync_project_file_read(text),public.worksync_private_file_orphan(text,text) from public,anon;
grant execute on function public.worksync_project_file_read(text),public.worksync_private_file_orphan(text,text) to authenticated;
-- Extend the restrictive storage guard so administrators can review these private records.
drop policy if exists worksync_private_files_guard on storage.objects;
create policy worksync_private_files_guard on storage.objects as restrictive for select to authenticated using(
 bucket_id not in ('project-attachments','verification-documents')
 or (bucket_id='project-attachments' and (public.worksync_project_file_read(name) or public.worksync_private_file_orphan(bucket_id,name)))
 or (bucket_id='verification-documents' and ((storage.foldername(name))[1]=auth.uid()::text
  or (public.worksync_is_admin() and (exists(select 1 from public.verification_requests v where name=any(v.document_paths))
   or exists(select 1 from public.freelancer_tax_declarations d where name=d.document_path))))));
-- Tax documents live in the existing private verification bucket and need manual human review.
drop policy if exists freelancer_tax_declaration_files on storage.objects;
create policy freelancer_tax_declaration_files on storage.objects for select to authenticated
 using(bucket_id='verification-documents' and ((storage.foldername(name))[1]=auth.uid()::text or
  (public.worksync_is_admin() and exists(select 1 from public.freelancer_tax_declarations d where d.document_path=name))));
drop policy if exists freelancer_tax_declaration_upload on storage.objects;
create policy freelancer_tax_declaration_upload on storage.objects for insert to authenticated
 with check(bucket_id='verification-documents' and (storage.foldername(name))[1]=auth.uid()::text
  and (storage.foldername(name))[2]='tax');


create or replace function public.worksync_project_settlement_info(p_project uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'autoAccept',coalesce((select auto_accept from public.project_payment_preferences where project_id=p_project),false),
 'finalMilestoneId',(select milestone_id from public.milestones where project_id=p_project order by display_order desc nulls last,created_at desc,milestone_id desc limit 1),
 'payouts',coalesce((select jsonb_agg(jsonb_build_object('payout_id',r.payout_id,'milestone_id',r.milestone_id,'title',coalesce(m.title,'Project delivery'),'mode',r.mode,'status',r.status,'amount',r.amount,'gross_amount',r.gross_amount,'withholding_basis',r.withholding_basis,'withholding_rate',r.withholding_rate,'withholding_amount',r.withholding_amount,'withholding_date',r.withholding_date,'withholding_rule',r.withholding_rule,'withholding_exemption_status',r.withholding_exemption_status,'freelancer_vat_taxable_amount',r.freelancer_vat_taxable_amount,'freelancer_vat_amount',r.freelancer_vat_amount,'freelancer_vat_rate',r.freelancer_vat_rate,'freelancer_vat_rule',r.freelancer_vat_rule,'paid_at',r.paid_at) order by r.created_at,r.payout_id) from public.project_payouts r left join public.milestones m using(milestone_id) where r.project_id=p_project),'[]'::jsonb),
 'refunds',coalesce((select jsonb_agg(jsonb_build_object('refund_id',refund_id,'mode',mode,'status',status,'amount',amount,'refunded_at',refunded_at) order by claimed_at) from public.project_refunds where project_id=p_project),'[]'::jsonb));
$$;
revoke all on function public.worksync_project_settlement_info(uuid) from public,anon,authenticated;
grant execute on function public.worksync_project_settlement_info(uuid) to service_role;
notify pgrst,'reload schema';
commit;

