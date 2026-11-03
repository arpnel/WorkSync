-- PREPARED, NOT APPLIED.
-- Roll back worksync_retire_freelancer_vat_status_verification.sql.
-- This restores the prior payout-time legacy inference. It reconstructs the
-- retired boolean from vat_classification; divergent values cannot be
-- recovered if some external writer created them after the forward migration.

begin;

lock table public.payments in share mode;
lock table public.project_payouts in share mode;
lock table public.freelancer_tax_profiles in access exclusive mode;

do $preflight$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='freelancer_tax_profiles'
      and column_name='vat_classification'
  ) or exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='freelancer_tax_profiles'
      and column_name='freelancer_vat_applicable'
  ) then
    raise exception 'Freelancer tax profile is not in the retired shape; review before rollback';
  end if;

  if to_regprocedure('public.worksync_apply_payout_tax_snapshot()') is null
     or to_regprocedure('public.worksync_audit_freelancer_tax_profile()') is null then
    raise exception 'Expected WorkSync trigger functions are missing';
  end if;
end;
$preflight$;

alter table public.freelancer_tax_profiles
  add column freelancer_vat_applicable boolean not null default false;

-- The retired value was required to mirror the classification. Restore that
-- invariant for rows created while the forward migration was active.
update public.freelancer_tax_profiles
set freelancer_vat_applicable=(vat_classification='vat_registered');

create or replace function public.worksync_audit_freelancer_tax_profile()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.updated_by is null or length(trim(new.updated_reason))=0 then
    raise exception 'Tax configuration changes require an administrator and reason'
      using errcode='23514';
  end if;

  if tg_op='INSERT' then
    insert into public.freelancer_tax_profile_events(
      user_id,reviewer_id,
      previous_withholding_applicable,new_withholding_applicable,
      previous_vat_applicable,new_vat_applicable,
      previous_vat_classification,new_vat_classification,reason
    ) values (
      new.user_id,new.updated_by,
      null,new.marketplace_withholding_applicable,
      null,new.freelancer_vat_applicable,
      null,new.vat_classification,new.updated_reason
    );
  elsif new.marketplace_withholding_applicable is distinct from old.marketplace_withholding_applicable
     or new.freelancer_vat_applicable is distinct from old.freelancer_vat_applicable
     or new.vat_classification is distinct from old.vat_classification then
    insert into public.freelancer_tax_profile_events(
      user_id,reviewer_id,
      previous_withholding_applicable,new_withholding_applicable,
      previous_vat_applicable,new_vat_applicable,
      previous_vat_classification,new_vat_classification,reason
    ) values (
      new.user_id,new.updated_by,
      old.marketplace_withholding_applicable,new.marketplace_withholding_applicable,
      old.freelancer_vat_applicable,new.freelancer_vat_applicable,
      old.vat_classification,new.vat_classification,new.updated_reason
    );
  end if;

  return new;
end;
$function$;

create or replace function public.worksync_apply_payout_tax_snapshot()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  vat_configured boolean:=false;
  vat_doc_id uuid;
  pay public.payments;
  milestone_base numeric;
  milestone_vat numeric;
begin
  select * into pay
  from public.payments
  where payment_id=new.payment_id;

  if pay.payment_id is null then
    raise exception 'Payout payment record is unavailable';
  end if;

  if pay.freelancer_service_vat_taxable_base is not null then
    if new.milestone_id is not null then
      select amount into milestone_base
      from public.milestones
      where milestone_id=new.milestone_id and project_id=new.project_id;

      if milestone_base is null or new.amount is distinct from milestone_base then
        raise exception 'Milestone payout base does not match the funded milestone';
      end if;

      milestone_vat:=public.worksync_project_milestone_vat(
        new.payment_id,new.project_id,new.milestone_id
      );
      if milestone_vat is null then
        raise exception 'Milestone VAT allocation is unavailable';
      end if;

      new.gross_amount:=round(milestone_base+milestone_vat,2);
      new.freelancer_vat_taxable_amount:=milestone_base;
      new.freelancer_vat_amount:=milestone_vat;
    else
      if new.amount is distinct from round(
        pay.freelancer_service_vat_taxable_base+pay.freelancer_service_vat_amount,2
      ) then
        raise exception 'Full-project payout does not match agreed price and VAT';
      end if;

      new.gross_amount:=round(
        pay.freelancer_service_vat_taxable_base+pay.freelancer_service_vat_amount,2
      );
      new.freelancer_vat_taxable_amount:=pay.freelancer_service_vat_taxable_base;
      new.freelancer_vat_amount:=pay.freelancer_service_vat_amount;
    end if;

    new.freelancer_vat_rate:=pay.freelancer_service_vat_rate;
    new.freelancer_vat_rule:=pay.freelancer_service_vat_rule;
    new.freelancer_vat_document_id:=pay.freelancer_service_vat_document_id;
  else
    if new.gross_amount is null then
      new.gross_amount:=new.amount;
    end if;

    select coalesce(freelancer_vat_applicable,false)
      into vat_configured
    from public.freelancer_tax_profiles
    where user_id=new.recipient_id;

    select document_id into vat_doc_id
    from public.tax_documents
    where user_id=new.recipient_id
      and party_type='freelancer'
      and document_type='vat_registration'
      and status='verified'
      and (expires_at is null or expires_at>=current_date)
    order by reviewed_at desc,submitted_at desc
    limit 1;

    if vat_configured and vat_doc_id is not null then
      new.freelancer_vat_rate:=0.12;
      new.freelancer_vat_rule:='Legacy saved price treated as VAT-inclusive; verified registration on file';
      new.freelancer_vat_taxable_amount:=round(new.gross_amount/1.12,2);
      new.freelancer_vat_amount:=new.gross_amount-new.freelancer_vat_taxable_amount;
      new.freelancer_vat_document_id:=vat_doc_id;
    else
      new.freelancer_vat_rate:=0;
      new.freelancer_vat_rule:='Legacy VAT treatment not recorded with current verified registration';
      new.freelancer_vat_taxable_amount:=new.gross_amount;
      new.freelancer_vat_amount:=0;
      new.freelancer_vat_document_id:=null;
    end if;
  end if;

  new.withholding_basis:=0;
  new.withholding_rate:=0;
  new.withholding_amount:=0;
  new.withholding_date:=null;
  new.withholding_rule:='Calculated from current verified documents when withdrawal is requested';
  new.withholding_exemption_status:='not_calculated';
  new.withholding_declaration_id:=null;
  new.withholding_document_id:=null;
  new.amount:=new.freelancer_vat_taxable_amount;

  if new.amount<=0 then
    raise exception 'Freelancer payout must be positive';
  end if;

  return new;
end;
$function$;

do $postflight$
declare
  payout_definition text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='freelancer_tax_profiles'
      and column_name='freelancer_vat_applicable'
  ) then
    raise exception 'Freelancer VAT boolean was not restored';
  end if;

  select pg_get_functiondef('public.worksync_apply_payout_tax_snapshot()'::regprocedure)
    into payout_definition;
  if position('freelancer_vat_applicable' in lower(payout_definition))=0
     or position('vat_registration' in lower(payout_definition))=0 then
    raise exception 'Legacy payout fallback was not restored';
  end if;
end;
$postflight$;

commit;
