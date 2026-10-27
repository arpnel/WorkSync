-- PREPARED, NOT APPLIED.
-- Permit the established 12% default VAT treatment when a seller has a
-- verified canonical Form 2303 but no verified alternative classification.
-- Preserve the reviewed non-VAT and verified VAT-registration branches.
-- Depends on 20261026220000_consolidate_seller_tax_documentation.sql.
begin;

alter table public.payments
  drop constraint if exists payments_freelancer_service_vat_snapshot_check;
alter table public.payments
  add constraint payments_freelancer_service_vat_snapshot_check check (
    (freelancer_service_vat_taxable_base is null
      and freelancer_service_vat_rate is null
      and freelancer_service_vat_amount is null
      and freelancer_service_vat_classification is null
      and freelancer_service_vat_document_id is null
      and freelancer_service_vat_rule is null)
    or (freelancer_service_vat_taxable_base >= 0
      and freelancer_service_vat_rate in (0,0.12)
      and freelancer_service_vat_amount >= 0
      and freelancer_service_vat_amount = round(freelancer_service_vat_taxable_base*freelancer_service_vat_rate,2)
      and freelancer_service_vat_classification in ('vat_registered','non_vat','default_vat')
      and freelancer_service_vat_document_id is not null
      and length(trim(coalesce(freelancer_service_vat_rule,''))) > 0
      and amount = round(freelancer_service_vat_taxable_base+freelancer_service_vat_amount,2))
  );

create or replace function public.worksync_validate_payment_service_vat_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  project_row public.projects;
  freelancer_user uuid;
  client_user uuid;
  agreed_base numeric;
  current_classification text;
  current_vat_applicable boolean;
  current_cor uuid;
  valid_vat_document uuid;
  today date:=current_date;
begin
  if new.freelancer_service_vat_taxable_base is null then
    raise exception 'New project payments require a server-calculated freelancer VAT snapshot';
  end if;

  select * into project_row from public.projects where project_id=new.project_id;
  if project_row.project_id is null then raise exception 'Project payment target is unavailable'; end if;
  select user_id into client_user from public.client_profiles where client_id=project_row.client_id;
  select user_id into freelancer_user from public.freelancer_profiles where freelancer_id=project_row.freelancer_id;
  select final_price into agreed_base from public.contracts
    where (project_row.order_id is not null and order_id=project_row.order_id)
       or (project_row.application_id is not null and application_id=project_row.application_id)
    order by created_at desc limit 1;
  if new.payer_id is distinct from client_user
    or new.order_id is distinct from project_row.order_id
    or agreed_base is null
    or agreed_base is distinct from new.freelancer_service_vat_taxable_base
    or new.amount is distinct from round(agreed_base+new.freelancer_service_vat_amount,2) then
    raise exception 'Payment total must match the client, signed agreement base, and VAT snapshot';
  end if;

  select vat_classification,freelancer_vat_applicable
    into current_classification,current_vat_applicable
    from public.freelancer_tax_profiles where user_id=freelancer_user;
  current_cor:=public.worksync_freelancer_canonical_bir_cor(freelancer_user);

  if new.freelancer_service_vat_rate=0.12
     and new.freelancer_service_vat_classification='vat_registered' then
    select d.document_id into valid_vat_document
      from public.tax_documents d
      where d.user_id=freelancer_user and d.party_type='freelancer'
        and d.document_type='vat_registration' and d.status='verified'
        and (d.expires_at is null or d.expires_at>=today)
      order by d.reviewed_at desc limit 1;
    if current_classification is distinct from 'vat_registered'
      or current_vat_applicable is distinct from true
      or valid_vat_document is null
      or new.freelancer_service_vat_document_id is distinct from valid_vat_document
      or current_cor is null then
      raise exception 'VAT registration and Form 2303 must be currently verified';
    end if;
  elsif new.freelancer_service_vat_rate=0.12
      and new.freelancer_service_vat_classification='default_vat' then
    if current_cor is null
      or new.freelancer_service_vat_document_id is distinct from current_cor then
      raise exception 'Default VAT requires a currently verified Form 2303';
    end if;
    if current_classification='non_vat' and current_vat_applicable is false then
      raise exception 'Reviewed non-VAT treatment changed; prepare a new checkout';
    end if;
    select d.document_id into valid_vat_document
      from public.tax_documents d
      where d.user_id=freelancer_user and d.party_type='freelancer'
        and d.document_type='vat_registration' and d.status='verified'
        and (d.expires_at is null or d.expires_at>=today)
      order by d.reviewed_at desc limit 1;
    if current_classification='vat_registered'
      and current_vat_applicable is true and valid_vat_document is not null then
      raise exception 'Verified VAT treatment changed; prepare a new checkout';
    end if;
  elsif new.freelancer_service_vat_rate=0
      and new.freelancer_service_vat_classification='non_vat' then
    if current_classification is distinct from 'non_vat'
      or current_vat_applicable is distinct from false
      or current_cor is null
      or new.freelancer_service_vat_document_id is distinct from current_cor then
      raise exception 'A current reviewed non-VAT classification and Form 2303 are required';
    end if;
  else
    raise exception 'Unsupported freelancer VAT treatment';
  end if;
  return new;
end; $$;
revoke all on function public.worksync_validate_payment_service_vat_snapshot() from public,anon,authenticated;

commit;
