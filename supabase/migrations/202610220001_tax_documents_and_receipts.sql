-- PREPARED, NOT APPLIED. Depends on 202610210002_philippine_tax_records.sql.
-- Adds reviewed business tax documents and immutable, transaction-linked receipt snapshots.
begin;

-- Platform tax treatment is separate from freelancer tax status and starts disabled.
create table if not exists public.platform_tax_configuration (
  configuration_id boolean primary key default true check(configuration_id),
  marketplace_withholding_enabled boolean not null default false,
  platform_vat_applicable boolean not null default false,
  platform_vat_rate numeric check(platform_vat_rate is null or (platform_vat_rate>=0 and platform_vat_rate<=1)),
  check(not platform_vat_applicable or platform_vat_rate is not null),
  legal_basis text not null default '',
  updated_by uuid references public."Users"(user_id),
  updated_at timestamptz,
  updated_reason text not null default ''
);
insert into public.platform_tax_configuration(configuration_id) values(true) on conflict(configuration_id) do nothing;
alter table public.platform_tax_configuration enable row level security;
revoke all on public.platform_tax_configuration from public,anon,authenticated;
grant select,insert,update on public.platform_tax_configuration to service_role;
create table if not exists public.platform_tax_configuration_events (
  event_id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references public."Users"(user_id),
  previous_marketplace_withholding_enabled boolean,
  new_marketplace_withholding_enabled boolean not null,
  previous_platform_vat_applicable boolean,
  new_platform_vat_applicable boolean not null,
  previous_platform_vat_rate numeric,
  new_platform_vat_rate numeric,
  previous_legal_basis text not null,
  new_legal_basis text not null,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.platform_tax_configuration_events enable row level security;
revoke all on public.platform_tax_configuration_events from public,anon,authenticated;
grant select,insert on public.platform_tax_configuration_events to service_role;
create or replace function public.worksync_audit_platform_tax_configuration() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.marketplace_withholding_enabled is distinct from old.marketplace_withholding_enabled
    or new.platform_vat_applicable is distinct from old.platform_vat_applicable
    or new.platform_vat_rate is distinct from old.platform_vat_rate
    or new.legal_basis is distinct from old.legal_basis then
  if new.updated_by is null or length(trim(new.updated_reason))=0 or length(trim(new.legal_basis))=0 then
   raise exception 'Platform tax changes require an administrator, legal basis, and reason.' using errcode='23514';
  end if;
  insert into public.platform_tax_configuration_events(reviewer_id,previous_marketplace_withholding_enabled,new_marketplace_withholding_enabled,previous_platform_vat_applicable,new_platform_vat_applicable,previous_platform_vat_rate,new_platform_vat_rate,previous_legal_basis,new_legal_basis,reason)
  values(new.updated_by,old.marketplace_withholding_enabled,new.marketplace_withholding_enabled,old.platform_vat_applicable,new.platform_vat_applicable,old.platform_vat_rate,new.platform_vat_rate,old.legal_basis,new.legal_basis,new.updated_reason);
 end if;
 return new;
end; $$;
revoke all on function public.worksync_audit_platform_tax_configuration() from public,anon,authenticated;
drop trigger if exists worksync_audit_platform_tax_configuration on public.platform_tax_configuration;
create trigger worksync_audit_platform_tax_configuration before update on public.platform_tax_configuration
 for each row execute function public.worksync_audit_platform_tax_configuration();

-- Null amounts mean the existing checkout did not record platform fees/tax. Never infer them.
alter table public.payments add column if not exists platform_service_fee numeric check(platform_service_fee is null or platform_service_fee>=0);
alter table public.payments add column if not exists platform_vat_taxable_base numeric check(platform_vat_taxable_base is null or platform_vat_taxable_base>=0);
alter table public.payments add column if not exists platform_vat_rate numeric check(platform_vat_rate is null or (platform_vat_rate>=0 and platform_vat_rate<=1));
alter table public.payments add column if not exists platform_vat_amount numeric check(platform_vat_amount is null or platform_vat_amount>=0);
alter table public.payments add column if not exists platform_tax_treatment text not null default 'not_configured';
alter table public.payments add column if not exists platform_tax_snapshot jsonb check(platform_tax_snapshot is null or jsonb_typeof(platform_tax_snapshot)='object');
create or replace function public.worksync_guard_paid_platform_tax_snapshot() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.status='paid' and (new.platform_service_fee,new.platform_vat_taxable_base,new.platform_vat_rate,new.platform_vat_amount,new.platform_tax_treatment,new.platform_tax_snapshot)
    is distinct from (old.platform_service_fee,old.platform_vat_taxable_base,old.platform_vat_rate,old.platform_vat_amount,old.platform_tax_treatment,old.platform_tax_snapshot) then
  raise exception 'Paid transaction tax snapshots are immutable; issue an audited receipt correction.' using errcode='55000';
 end if;
 return new;
end; $$;
revoke all on function public.worksync_guard_paid_platform_tax_snapshot() from public,anon,authenticated;
drop trigger if exists worksync_guard_paid_platform_tax_snapshot on public.payments;
create trigger worksync_guard_paid_platform_tax_snapshot before update of platform_service_fee,platform_vat_taxable_base,platform_vat_rate,platform_vat_amount,platform_tax_treatment,platform_tax_snapshot on public.payments
 for each row execute function public.worksync_guard_paid_platform_tax_snapshot();

create table if not exists public.tax_documents (
  document_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public."Users"(user_id) on delete cascade,
  party_type text not null check (party_type in ('freelancer','client')),
  document_type text not null check (document_type in ('bir_cor','vat_registration','tax_exemption','business_tax_support')),
  document_path text not null unique,
  registered_name text not null default '',
  claimed_tax_treatment text not null default '',
  legal_basis text not null default '',
  tax_year integer check (tax_year is null or tax_year between 2024 and 2100),
  issued_at date,
  expires_at date,
  status text not null default 'pending' check (status in ('pending','verified','rejected','expired')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public."Users"(user_id),
  reviewed_at timestamptz,
  review_reason text not null default '',
  check ((status='pending' and reviewed_by is null and reviewed_at is null)
      or (status<>'pending' and reviewed_by is not null and reviewed_at is not null))
);
create index if not exists tax_documents_owner_status on public.tax_documents(user_id,status,document_type);
alter table public.tax_documents enable row level security;
revoke all on public.tax_documents from public,anon,authenticated;
grant select,insert on public.tax_documents to authenticated;
drop policy if exists tax_documents_owner_read on public.tax_documents;
create policy tax_documents_owner_read on public.tax_documents for select to authenticated
  using(user_id=auth.uid() or public.worksync_is_admin());
drop policy if exists tax_documents_owner_submit on public.tax_documents;
create policy tax_documents_owner_submit on public.tax_documents for insert to authenticated
  with check(user_id=auth.uid() and status='pending' and reviewed_by is null and reviewed_at is null and review_reason='' and document_path like auth.uid()::text || '/tax-docs/' || party_type || '/%' and ((party_type='freelancer' and exists(select 1 from public.freelancer_profiles f where f.user_id=auth.uid())) or (party_type='client' and exists(select 1 from public.client_profiles c where c.user_id=auth.uid()))));

create table if not exists public.tax_document_review_events (
  event_id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.tax_documents(document_id) on delete restrict,
  reviewer_id uuid not null references public."Users"(user_id),
  previous_status text not null,
  new_status text not null check(new_status in ('verified','rejected','expired')),
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.tax_document_review_events enable row level security;
revoke all on public.tax_document_review_events from public,anon,authenticated;
grant select,insert on public.tax_document_review_events to service_role;

create table if not exists public.tax_transaction_receipts (
  receipt_id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique default ('WS-TR-' || upper(replace(gen_random_uuid()::text,'-',''))),
  payment_id uuid not null unique references public.payments(payment_id) on delete restrict,
  document_type text not null default 'system_transaction_receipt' check(document_type='system_transaction_receipt'),
  issued_at timestamptz not null default now(),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  created_by uuid not null references public."Users"(user_id)
);
alter table public.tax_transaction_receipts enable row level security;
revoke all on public.tax_transaction_receipts from public,anon,authenticated;
grant select,insert on public.tax_transaction_receipts to service_role;
create or replace function public.worksync_guard_tax_transaction_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 raise exception 'Issued transaction receipts are immutable; use an audited correction record.' using errcode='55000';
end; $$;
revoke all on function public.worksync_guard_tax_transaction_receipt() from public,anon,authenticated;
drop trigger if exists worksync_guard_tax_transaction_receipt on public.tax_transaction_receipts;
create trigger worksync_guard_tax_transaction_receipt before update or delete on public.tax_transaction_receipts
 for each row execute function public.worksync_guard_tax_transaction_receipt();

create or replace function public.worksync_audit_tax_document_review() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status then
  insert into public.tax_document_review_events(document_id,reviewer_id,previous_status,new_status,reason)
  values(new.document_id,new.reviewed_by,old.status,new.status,new.review_reason);
 end if;
 return new;
end; $$;
revoke all on function public.worksync_audit_tax_document_review() from public,anon,authenticated;
drop trigger if exists worksync_audit_tax_document_review on public.tax_documents;
create trigger worksync_audit_tax_document_review after update on public.tax_documents
 for each row execute function public.worksync_audit_tax_document_review();

drop policy if exists tax_document_files_read on storage.objects;
create policy tax_document_files_read on storage.objects for select to authenticated
 using(bucket_id='verification-documents' and (
   ((storage.foldername(name))[1]=auth.uid()::text and (storage.foldername(name))[2]='tax-docs')
   or (public.worksync_is_admin() and exists(select 1 from public.tax_documents d where d.document_path=name))
 ));
drop policy if exists tax_document_files_insert on storage.objects;
create policy tax_document_files_insert on storage.objects for insert to authenticated
 with check(bucket_id='verification-documents' and (storage.foldername(name))[1]=auth.uid()::text and (storage.foldername(name))[2]='tax-docs');

drop policy if exists worksync_private_files_guard on storage.objects;
create policy worksync_private_files_guard on storage.objects as restrictive for select to authenticated using(
 bucket_id not in ('project-attachments','verification-documents')
 or (bucket_id='project-attachments' and (public.worksync_project_file_read(name) or public.worksync_private_file_orphan(bucket_id,name)))
 or (bucket_id='verification-documents' and (
   ((storage.foldername(name))[1]=auth.uid()::text)
   or (public.worksync_is_admin() and (
      exists(select 1 from public.verification_requests v where name=any(v.document_paths))
      or exists(select 1 from public.freelancer_tax_declarations d where name=d.document_path)
      or exists(select 1 from public.tax_documents d where name=d.document_path)
   ))
 ))
);




-- Preserve the tax calculation input and the supporting proof used for each payout.
alter table public.project_payouts add column if not exists freelancer_vat_document_id uuid references public.tax_documents(document_id) on delete restrict;
alter table public.project_payouts add column if not exists withholding_declaration_id uuid references public.freelancer_tax_declarations(declaration_id) on delete restrict;
alter table public.project_payouts add column if not exists withholding_document_id uuid references public.tax_documents(document_id) on delete restrict;

create or replace function public.worksync_apply_payout_tax_snapshot() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  withholding_applicable boolean:=false; withholding_globally_enabled boolean:=false; vat_configured boolean:=false; exemption text:='not_applicable';
  latest_status text; latest_threshold_status text; prior_gross numeric:=0;
  current_year integer:=extract(year from now() at time zone 'Asia/Manila')::integer;
  declaration_id uuid; cor_id uuid; vat_doc_id uuid;
begin
  if new.gross_amount is null then new.gross_amount:=new.amount; end if;
  select coalesce(marketplace_withholding_applicable,false),coalesce(freelancer_vat_applicable,false)
    into withholding_applicable,vat_configured from public.freelancer_tax_profiles where user_id=new.recipient_id;
  select coalesce(marketplace_withholding_enabled,false) into withholding_globally_enabled from public.platform_tax_configuration where configuration_id=true;
  withholding_applicable:=withholding_applicable and withholding_globally_enabled;
  select document_id into cor_id from public.tax_documents
    where user_id=new.recipient_id and party_type='freelancer' and document_type='bir_cor' and status='verified'
      and (expires_at is null or expires_at>=current_date)
    order by reviewed_at desc,submitted_at desc limit 1;
  select document_id into vat_doc_id from public.tax_documents
    where user_id=new.recipient_id and party_type='freelancer' and document_type='vat_registration' and status='verified'
      and (expires_at is null or expires_at>=current_date)
    order by reviewed_at desc,submitted_at desc limit 1;
  if vat_configured and vat_doc_id is not null then
    new.freelancer_vat_rate:=0.12;
    new.freelancer_vat_rule:='PH VAT 12%; VAT-inclusive agreed price; approved registration document on file';
    new.freelancer_vat_taxable_amount:=round(new.gross_amount/1.12,2);
    new.freelancer_vat_amount:=new.gross_amount-new.freelancer_vat_taxable_amount;
    new.freelancer_vat_document_id:=vat_doc_id;
  else
    new.freelancer_vat_rate:=0; new.freelancer_vat_rule:='VAT treatment not configured with current verified registration';
    new.freelancer_vat_taxable_amount:=new.gross_amount; new.freelancer_vat_amount:=0; new.freelancer_vat_document_id:=null;
  end if;
  select d.declaration_id,d.status,d.reported_threshold_status into declaration_id,latest_status,latest_threshold_status
    from public.freelancer_tax_declarations d where d.user_id=new.recipient_id and d.tax_year=current_year
    order by d.submitted_at desc limit 1;
  new.withholding_declaration_id:=null; new.withholding_document_id:=cor_id;
  new.withholding_basis:=0; new.withholding_rate:=0; new.withholding_amount:=0; new.withholding_date:=null;
  if withholding_applicable then
    select coalesce(sum(gross_amount),0) into prior_gross from public.project_payouts
      where recipient_id=new.recipient_id and status<>'cancelled'
        and created_at>=make_timestamptz(current_year,1,1,0,0,0,'Asia/Manila')
        and created_at<make_timestamptz(current_year+1,1,1,0,0,0,'Asia/Manila');
    new.withholding_rate:=0.005;
    if latest_status='accepted' and latest_threshold_status='not_exceeding' and declaration_id is not null
       and cor_id is not null and prior_gross+new.gross_amount<=500000 then
      exemption:='accepted_below_threshold'; new.withholding_declaration_id:=declaration_id; new.withholding_basis:=0;
    else
      if latest_status='pending' then exemption:='declaration_pending';
      elsif latest_status='rejected' then exemption:='declaration_rejected';
      elsif latest_status='accepted' and prior_gross+new.gross_amount>500000 then exemption:='threshold_crossed';
      elsif latest_status='accepted' and cor_id is null then exemption:='cor_missing_or_expired';
      else exemption:='none'; end if;
      new.withholding_basis:=new.gross_amount;
      new.withholding_amount:=round(new.gross_amount*new.withholding_rate,2);
    end if;
    new.withholding_rule:='PH RR 5-2025; RR 16-2023 and RMC 8-2024; enabled per reviewed account configuration';
    new.withholding_date:=case when new.withholding_amount>0 then now() else null end;
  else
    new.withholding_rule:='withholding not configured as applicable pending legal determination';
  end if;
  new.withholding_exemption_status:=exemption;
  new.amount:=new.gross_amount-new.withholding_amount;
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
  if (new.gross_amount,new.freelancer_vat_taxable_amount,new.freelancer_vat_amount,new.freelancer_vat_rate,new.freelancer_vat_rule,new.freelancer_vat_document_id,new.withholding_basis,new.withholding_rate,new.withholding_amount,new.withholding_date,new.withholding_rule,new.withholding_exemption_status,new.withholding_declaration_id,new.withholding_document_id)
     is distinct from
     (old.gross_amount,old.freelancer_vat_taxable_amount,old.freelancer_vat_amount,old.freelancer_vat_rate,old.freelancer_vat_rule,old.freelancer_vat_document_id,old.withholding_basis,old.withholding_rate,old.withholding_amount,old.withholding_date,old.withholding_rule,old.withholding_exemption_status,old.withholding_declaration_id,old.withholding_document_id) then
    raise exception 'Settled tax snapshots are immutable' using errcode='55000';
  end if;
  return new;
end; $$;
revoke all on function public.worksync_guard_payout_tax_snapshot() from public,anon,authenticated;
drop trigger if exists worksync_guard_payout_tax_snapshot on public.project_payouts;
create trigger worksync_guard_payout_tax_snapshot before update on public.project_payouts
  for each row execute function public.worksync_guard_payout_tax_snapshot();

-- Later payout tax facts are issued as an explicit correction instead of rewriting a prior receipt.
create table if not exists public.tax_transaction_receipt_corrections (
  correction_id uuid primary key default gen_random_uuid(),
  correction_number text not null unique default ('WS-TRC-' || upper(replace(gen_random_uuid()::text,'-',''))),
  receipt_id uuid not null references public.tax_transaction_receipts(receipt_id) on delete restrict,
  reason text not null,
  issued_at timestamptz not null default now(),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  created_by uuid not null references public."Users"(user_id),
  unique(receipt_id,snapshot)
);
alter table public.tax_transaction_receipt_corrections enable row level security;
revoke all on public.tax_transaction_receipt_corrections from public,anon,authenticated;
grant select,insert on public.tax_transaction_receipt_corrections to service_role;
create or replace function public.worksync_guard_tax_receipt_correction() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 raise exception 'Receipt corrections are immutable.' using errcode='55000';
end; $$;
revoke all on function public.worksync_guard_tax_receipt_correction() from public,anon,authenticated;
drop trigger if exists worksync_guard_tax_receipt_correction on public.tax_transaction_receipt_corrections;
create trigger worksync_guard_tax_receipt_correction before update or delete on public.tax_transaction_receipt_corrections
 for each row execute function public.worksync_guard_tax_receipt_correction();

create or replace function public.worksync_project_settlement_info(p_project uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'autoAccept',coalesce((select auto_accept from public.project_payment_preferences where project_id=p_project),false),
 'finalMilestoneId',(select milestone_id from public.milestones where project_id=p_project order by display_order desc nulls last,created_at desc,milestone_id desc limit 1),
 'payouts',coalesce((select jsonb_agg(jsonb_build_object('payout_id',r.payout_id,'milestone_id',r.milestone_id,'title',coalesce(m.title,'Project delivery'),'mode',r.mode,'status',r.status,'amount',r.amount,'gross_amount',r.gross_amount,'withholding_basis',r.withholding_basis,'withholding_rate',r.withholding_rate,'withholding_amount',r.withholding_amount,'withholding_date',r.withholding_date,'withholding_rule',r.withholding_rule,'withholding_exemption_status',r.withholding_exemption_status,'withholding_declaration_id',r.withholding_declaration_id,'withholding_document_id',r.withholding_document_id,'freelancer_vat_taxable_amount',r.freelancer_vat_taxable_amount,'freelancer_vat_amount',r.freelancer_vat_amount,'freelancer_vat_rate',r.freelancer_vat_rate,'freelancer_vat_rule',r.freelancer_vat_rule,'freelancer_vat_document_id',r.freelancer_vat_document_id,'paid_at',r.paid_at) order by r.created_at,r.payout_id) from public.project_payouts r left join public.milestones m using(milestone_id) where r.project_id=p_project),'[]'::jsonb),
 'refunds',coalesce((select jsonb_agg(jsonb_build_object('refund_id',refund_id,'mode',mode,'status',status,'amount',amount,'refunded_at',refunded_at) order by claimed_at) from public.project_refunds where project_id=p_project),'[]'::jsonb));
$$;
revoke all on function public.worksync_project_settlement_info(uuid) from public,anon,authenticated;
grant execute on function public.worksync_project_settlement_info(uuid) to service_role;
alter table public.freelancer_tax_profiles add column if not exists updated_reason text not null default '';
create table if not exists public.freelancer_tax_profile_events (
  event_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public."Users"(user_id) on delete restrict,
  reviewer_id uuid not null references public."Users"(user_id),
  previous_withholding_applicable boolean,
  new_withholding_applicable boolean not null,
  previous_vat_applicable boolean,
  new_vat_applicable boolean not null,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.freelancer_tax_profile_events enable row level security;
revoke all on public.freelancer_tax_profile_events from public,anon,authenticated;
grant select,insert on public.freelancer_tax_profile_events to service_role;
create or replace function public.worksync_audit_freelancer_tax_profile() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.updated_by is null or length(trim(new.updated_reason))=0 then raise exception 'Tax configuration changes require an administrator and reason.' using errcode='23514'; end if;
  insert into public.freelancer_tax_profile_events(user_id,reviewer_id,previous_withholding_applicable,new_withholding_applicable,previous_vat_applicable,new_vat_applicable,reason)
  values(new.user_id,new.updated_by,null,new.marketplace_withholding_applicable,null,new.freelancer_vat_applicable,new.updated_reason);
 elsif new.marketplace_withholding_applicable is distinct from old.marketplace_withholding_applicable or new.freelancer_vat_applicable is distinct from old.freelancer_vat_applicable then
  if new.updated_by is null or length(trim(new.updated_reason))=0 then raise exception 'Tax configuration changes require an administrator and reason.' using errcode='23514'; end if;
  insert into public.freelancer_tax_profile_events(user_id,reviewer_id,previous_withholding_applicable,new_withholding_applicable,previous_vat_applicable,new_vat_applicable,reason)
  values(new.user_id,new.updated_by,old.marketplace_withholding_applicable,new.marketplace_withholding_applicable,old.freelancer_vat_applicable,new.freelancer_vat_applicable,new.updated_reason);
 end if;
 return new;
end; $$;
revoke all on function public.worksync_audit_freelancer_tax_profile() from public,anon,authenticated;
drop trigger if exists worksync_audit_freelancer_tax_profile on public.freelancer_tax_profiles;
create trigger worksync_audit_freelancer_tax_profile before insert or update on public.freelancer_tax_profiles
 for each row execute function public.worksync_audit_freelancer_tax_profile();
create or replace function public.worksync_review_tax_declaration(p_declaration uuid,p_decision text,p_notes text default '') returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.worksync_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_decision not in ('accepted','rejected') or length(coalesce(p_notes,''))>2000 or length(trim(coalesce(p_notes,'')))=0 then raise exception 'A review decision and reason are required'; end if;
 update public.freelancer_tax_declarations set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_notes=trim(p_notes)
  where declaration_id=p_declaration and status='pending';
 if not found then raise exception 'Pending declaration not found'; end if;
end; $$;
revoke all on function public.worksync_review_tax_declaration(uuid,text,text) from public,anon;
grant execute on function public.worksync_review_tax_declaration(uuid,text,text) to authenticated;
notify pgrst,'reload schema';

commit;




