-- PREPARED, NOT APPLIED.
-- Retire WorkSync's internal freelancer VAT-status boolean and legacy
-- payout-time status inference. The public classification RPC and its
-- vat_classification column remain for compatibility because external callers
-- cannot be ruled out.

begin;

-- Prevent concurrent writes from invalidating the preflight between checks
-- and replacement of the payout trigger function.
lock table public.payments in share mode;
lock table public.project_payouts in share mode;
lock table public.freelancer_tax_profiles in access exclusive mode;

do $preflight$
declare
  payout_definition text;
  audit_definition text;
begin
  if to_regclass('public.freelancer_tax_profiles') is null
     or to_regclass('public.freelancer_tax_profile_events') is null
     or to_regclass('public.payments') is null
     or to_regclass('public.project_payouts') is null then
    raise exception 'Expected live WorkSync tax and payout tables are missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='freelancer_tax_profiles'
      and column_name='freelancer_vat_applicable'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='freelancer_tax_profiles'
      and column_name='vat_classification'
  ) then
    raise exception 'Freelancer VAT-status columns differ from the audited live schema';
  end if;

  -- The boolean duplicates vat_classification. Abort if any existing row
  -- disagrees, since no lossless reconstruction would then be possible.
  if exists (
    select 1 from public.freelancer_tax_profiles
    where freelancer_vat_applicable is distinct from (vat_classification='vat_registered')
  ) then
    raise exception 'VAT boolean and classification disagree; reconcile rows before retiring the boolean';
  end if;

  -- Existing payments/payouts must already carry the immutable calculation.
  -- New checkout is separately guarded by worksync_validate_payment_service_vat_snapshot.
  if exists (
    select 1 from public.payments
    where freelancer_service_vat_taxable_base is null
       or freelancer_service_vat_rate is null
       or freelancer_service_vat_amount is null
       or freelancer_service_vat_classification is null
       or freelancer_service_vat_rule is null
  ) then
    raise exception 'A payment lacks a complete VAT snapshot; inspect legacy payments before retiring status inference';
  end if;

  if exists (
    select 1 from public.project_payouts
    where gross_amount is null
       or freelancer_vat_taxable_amount is null
       or freelancer_vat_amount is null
       or freelancer_vat_rate is null
       or freelancer_vat_rule is null
  ) then
    raise exception 'A payout lacks a stored VAT snapshot; inspect payout history before continuing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.project_payouts'::regclass
      and tgname='worksync_apply_payout_tax_snapshot'
      and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid='public.freelancer_tax_profiles'::regclass
      and tgname='worksync_audit_freelancer_tax_profile'
      and not tgisinternal
  ) then
    raise exception 'Expected payout or tax-profile audit trigger is missing';
  end if;

  select pg_get_functiondef('public.worksync_apply_payout_tax_snapshot()'::regprocedure)
    into payout_definition;
  if position('freelancer_vat_applicable' in lower(payout_definition))=0
     or position('vat_registration' in lower(payout_definition))=0 then
    raise exception 'Payout trigger function differs from the audited legacy fallback; review before applying';
  end if;

  select pg_get_functiondef('public.worksync_audit_freelancer_tax_profile()'::regprocedure)
    into audit_definition;
  if position('new.freelancer_vat_applicable' in lower(audit_definition))=0
     or position('new.vat_classification' in lower(audit_definition))=0 then
    raise exception 'Tax-profile audit function differs from the audited live definition';
  end if;

  -- This public endpoint is deliberately retained. Its authenticated and
  -- anonymous EXECUTE grants are an unresolved external compatibility surface.
  if to_regprocedure('public.worksync_public_vat_classifications(uuid[])') is null
     or not has_function_privilege('anon','public.worksync_public_vat_classifications(uuid[])'::regprocedure,'EXECUTE')
     or not has_function_privilege('authenticated','public.worksync_public_vat_classifications(uuid[])'::regprocedure,'EXECUTE') then
    raise exception 'Public VAT-classification RPC or its audited grants changed; review before applying';
  end if;
end;
$preflight$;

create or replace function public.worksync_apply_payout_tax_snapshot()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
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
    -- Never infer a historic tax treatment from current freelancer status.
    -- The failed insert leaves stored history untouched and requires manual
    -- reconciliation for an old payment without a checkout snapshot.
    raise exception 'Payout cannot use a payment without an immutable VAT snapshot; reconcile the legacy payment before settlement'
      using errcode='23514';
  end if;

  -- Withholding remains calculated by the withdrawal workflow.
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
      null,(new.vat_classification='vat_registered'),
      null,new.vat_classification,new.updated_reason
    );
  elsif new.marketplace_withholding_applicable is distinct from old.marketplace_withholding_applicable
     or new.vat_classification is distinct from old.vat_classification then
    insert into public.freelancer_tax_profile_events(
      user_id,reviewer_id,
      previous_withholding_applicable,new_withholding_applicable,
      previous_vat_applicable,new_vat_applicable,
      previous_vat_classification,new_vat_classification,reason
    ) values (
      new.user_id,new.updated_by,
      old.marketplace_withholding_applicable,new.marketplace_withholding_applicable,
      (old.vat_classification='vat_registered'),(new.vat_classification='vat_registered'),
      old.vat_classification,new.vat_classification,new.updated_reason
    );
  end if;

  return new;
end;
$function$;

alter table public.freelancer_tax_profiles
  drop column freelancer_vat_applicable;

do $postflight$
declare
  payout_definition text;
  audit_definition text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='freelancer_tax_profiles'
      and column_name='freelancer_vat_applicable'
  ) then
    raise exception 'Freelancer VAT boolean column remains after retirement';
  end if;

  select pg_get_functiondef('public.worksync_apply_payout_tax_snapshot()'::regprocedure)
    into payout_definition;
  if position('freelancer_vat_applicable' in lower(payout_definition))>0
     or position('vat_registration' in lower(payout_definition))>0 then
    raise exception 'Payout trigger still contains freelancer status inference';
  end if;

  select pg_get_functiondef('public.worksync_audit_freelancer_tax_profile()'::regprocedure)
    into audit_definition;
  if position('new.freelancer_vat_applicable' in lower(audit_definition))>0
     or position('new.vat_classification' in lower(audit_definition))=0 then
    raise exception 'Tax-profile audit trigger does not preserve classification history';
  end if;

  if to_regprocedure('public.worksync_public_vat_classifications(uuid[])') is null then
    raise exception 'Compatibility RPC was unexpectedly removed';
  end if;
end;
$postflight$;

commit;
