-- PREPARED, NOT APPLIED.
-- Use tax_documents as the single canonical source for freelancer Form 2303.
-- Preserve legacy seller-verification rows and storage objects as immutable
-- history while importing their submissions into the existing tax workflow.
-- Depends on 202610240002_tax_uploads_and_vat_classification.sql and
-- 20261026210000_base_price_vat_transaction_snapshots.sql.
begin;

-- Fail early with the missing prerequisite instead of failing later while
-- compiling the VAT-classification RPC or payment snapshot trigger function.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='freelancer_tax_profiles'
      and column_name='vat_classification'
  ) then
    raise exception 'Apply prerequisite migration 202610240002_tax_uploads_and_vat_classification.sql before this migration';
  end if;
end;
$$;

alter table public.tax_documents
  add column if not exists is_canonical_bir_cor boolean not null default false;
alter table public.tax_documents
  drop constraint if exists tax_documents_status_check;
alter table public.tax_documents
  add constraint tax_documents_status_check
  check (status in ('pending','verified','rejected','expired','revoked','not_applicable'));
alter table public.tax_document_review_events
  drop constraint if exists tax_document_review_events_new_status_check;
alter table public.tax_document_review_events
  add constraint tax_document_review_events_new_status_check
  check (new_status in ('verified','rejected','expired','revoked','not_applicable'));
alter table public.tax_documents
  drop constraint if exists tax_documents_canonical_bir_cor_check;
alter table public.tax_documents
  add constraint tax_documents_canonical_bir_cor_check check (
    not is_canonical_bir_cor
    or (party_type='freelancer' and document_type='bir_cor' and status='verified')
  );
create unique index if not exists tax_documents_one_canonical_freelancer_bir_cor
  on public.tax_documents(user_id)
  where is_canonical_bir_cor;

-- Never silently attach a seller-verification file to an unrelated tax record.
do $$
begin
  if exists (
    select 1
    from public.freelancer_seller_verification_submissions s
    join public.freelancer_seller_verification_requirements r using(requirement_id)
    join public.tax_documents d on d.document_path=s.document_path
    where r.document_type='bir_cor'
      and (d.user_id<>s.user_id or d.party_type<>'freelancer' or d.document_type<>'bir_cor'
        or d.status is distinct from s.status or d.submitted_at is distinct from s.submitted_at
        or d.reviewed_by is distinct from s.reviewed_by
        or d.reviewed_at is distinct from s.reviewed_at or d.review_reason is distinct from s.review_reason
        or d.registered_name is distinct from s.registered_name)
  ) then
    raise exception 'A seller Form 2303 shares a storage path with a different or conflicting tax record; reconcile it manually before continuing';
  end if;
end;
$$;

-- Backfill every submitted seller Form 2303 version, retaining its original
-- private storage path, owner, review result, review reason, and timestamps.
-- Existing tax_documents rows with the same path are already canonical history.
insert into public.tax_documents(
  user_id,party_type,document_type,document_path,registered_name,
  status,submitted_at,reviewed_by,reviewed_at,review_reason
)
select s.user_id,'freelancer','bir_cor',s.document_path,s.registered_name,
  s.status,s.submitted_at,s.reviewed_by,s.reviewed_at,s.review_reason
from public.freelancer_seller_verification_submissions s
join public.freelancer_seller_verification_requirements r using(requirement_id)
where r.document_type='bir_cor'
  and s.status in ('pending','verified','rejected','not_applicable')
  and not exists(select 1 from public.tax_documents d where d.document_path=s.document_path)
on conflict(document_path) do nothing;

-- Keep the existing tax review history complete for imported decisions.
insert into public.tax_document_review_events(
  document_id,reviewer_id,previous_status,new_status,reason,created_at
)
select d.document_id,d.reviewed_by,'pending',d.status,d.review_reason,d.reviewed_at
from public.tax_documents d
where d.document_type='bir_cor' and d.party_type='freelancer'
  and d.status in ('verified','rejected','not_applicable')
  and exists(
    select 1 from public.freelancer_seller_verification_submissions s
    where s.document_path=d.document_path and s.reviewed_by=d.reviewed_by
      and s.reviewed_at=d.reviewed_at and s.status=d.status
  )
  and not exists(
    select 1 from public.tax_document_review_events e
    where e.document_id=d.document_id and e.reviewer_id=d.reviewed_by
      and e.new_status=d.status and e.created_at=d.reviewed_at
      and e.reason=d.review_reason
  );

-- A unique newest verified submission is eligible to be canonical. Newest
-- pending/rejected records supersede older approvals. Equal-time latest rows
-- are deliberately left without a canonical record for explicit admin review.
with ranked as (
  select d.document_id,d.user_id,d.status,d.expires_at,d.submitted_at,
    max(d.submitted_at) over(partition by d.user_id) as newest_at,
    count(*) over(partition by d.user_id,d.submitted_at) as same_time_count
  from public.tax_documents d
  where d.party_type='freelancer' and d.document_type='bir_cor'
)
update public.tax_documents d
set is_canonical_bir_cor=(r.submitted_at=r.newest_at and r.same_time_count=1
  and r.status='verified' and (r.expires_at is null or r.expires_at>=current_date))
from ranked r where r.document_id=d.document_id;

create or replace function public.worksync_freelancer_canonical_bir_cor(p_user uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select d.document_id
  from public.tax_documents d
  where d.user_id=p_user and d.party_type='freelancer'
    and d.document_type='bir_cor' and d.is_canonical_bir_cor
    and d.status='verified' and (d.expires_at is null or d.expires_at>=current_date)
  limit 1;
$$;
revoke all on function public.worksync_freelancer_canonical_bir_cor(uuid) from public,anon,authenticated;
grant execute on function public.worksync_freelancer_canonical_bir_cor(uuid) to service_role;

create or replace function public.worksync_prepare_freelancer_bir_cor_insert()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.party_type='freelancer' and new.document_type='bir_cor' then
    if auth.uid() is not null and auth.uid() is distinct from new.user_id then
      raise exception 'A freelancer can submit only their own Form 2303' using errcode='42501';
    end if;
    perform 1 from public.freelancer_profiles f where f.user_id=new.user_id for update;
    if not found then raise exception 'Freelancer account not found'; end if;
    new.is_canonical_bir_cor:=false;
    update public.tax_documents set is_canonical_bir_cor=false
    where user_id=new.user_id and party_type='freelancer'
      and document_type='bir_cor' and is_canonical_bir_cor;
  else
    new.is_canonical_bir_cor:=false;
  end if;
  return new;
end; $$;
revoke all on function public.worksync_prepare_freelancer_bir_cor_insert() from public,anon,authenticated;
drop trigger if exists worksync_prepare_freelancer_bir_cor_insert on public.tax_documents;
create trigger worksync_prepare_freelancer_bir_cor_insert
  before insert on public.tax_documents for each row
  execute function public.worksync_prepare_freelancer_bir_cor_insert();

create or replace function public.worksync_freelancer_seller_eligible(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select p_user is not null
    and exists(select 1 from public.freelancer_profiles f where f.user_id=p_user)
    and public.worksync_freelancer_canonical_bir_cor(p_user) is not null
    and not exists(
      select 1 from public.freelancer_seller_verification_requirements r
      where r.user_id=p_user and r.document_type<>'bir_cor'
        and r.required_for_publishing and r.status not in ('verified','not_applicable')
    );
$$;
revoke all on function public.worksync_freelancer_seller_eligible(uuid) from public,anon,authenticated;
grant execute on function public.worksync_freelancer_seller_eligible(uuid) to service_role;

-- Seller Form 2303 no longer has an independent review requirement. Keep all
-- prior requirement/submission/event rows unchanged for historical access.
create or replace function public.worksync_init_freelancer_seller_requirement()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  return new;
end; $$;
revoke all on function public.worksync_init_freelancer_seller_requirement() from public,anon,authenticated;

create or replace function public.worksync_public_vat_classifications(p_user_ids uuid[])
returns table(user_id uuid,vat_classification text)
language sql stable security definer set search_path='' as $$
  select p.user_id,p.vat_classification
  from public.freelancer_tax_profiles p
  where p.user_id=any(coalesce(p_user_ids,'{}'::uuid[]))
    and p.vat_classification in ('vat_registered','non_vat')
    and public.worksync_freelancer_canonical_bir_cor(p.user_id) is not null
    and (p.vat_classification<>'vat_registered' or exists(
      select 1 from public.tax_documents d
      where d.user_id=p.user_id and d.party_type='freelancer'
        and d.document_type='vat_registration' and d.status='verified'
        and (d.expires_at is null or d.expires_at>=current_date)
    ));
$$;
revoke all on function public.worksync_public_vat_classifications(uuid[]) from public;
grant execute on function public.worksync_public_vat_classifications(uuid[]) to anon,authenticated;

create or replace function public.worksync_admin_review_canonical_bir_cor(
  p_actor uuid,p_document_id uuid,p_decision text,p_reason text
) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.tax_documents%rowtype; owner uuid;
begin
  if not exists(select 1 from public.admin_members a where a.user_id=p_actor) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  if p_decision not in ('verified','rejected','expired','revoked')
     or coalesce(length(trim(p_reason)),0)<2 or length(p_reason)>2000 then
    raise exception 'Choose a valid Form 2303 review decision and reason';
  end if;
  select user_id into owner from public.tax_documents where document_id=p_document_id;
  if owner is null then raise exception 'Freelancer Form 2303 not found'; end if;
  perform 1 from public.freelancer_profiles f where f.user_id=owner for update;
  select * into d from public.tax_documents where document_id=p_document_id for update;
  if not found or d.party_type<>'freelancer' or d.document_type<>'bir_cor' then
    raise exception 'Freelancer Form 2303 not found';
  end if;
  if (p_decision in ('verified','rejected') and d.status<>'pending')
     or (p_decision='revoked' and d.status<>'verified')
     or (p_decision='expired' and d.status not in ('pending','verified')) then
    raise exception 'Form 2303 is no longer in a reviewable status';
  end if;
  if p_decision='verified' and d.expires_at is not null and d.expires_at<current_date then
    raise exception 'This Form 2303 is expired';
  end if;
  if p_decision in ('verified','rejected') and exists(
    select 1 from public.tax_documents newer where newer.user_id=d.user_id
      and newer.party_type='freelancer' and newer.document_type='bir_cor'
      and newer.submitted_at>d.submitted_at
  ) then raise exception 'A newer Form 2303 submission exists; review the newest record'; end if;
  if p_decision in ('verified','rejected') then
    update public.tax_documents set is_canonical_bir_cor=false
    where user_id=d.user_id and party_type='freelancer'
      and document_type='bir_cor' and is_canonical_bir_cor;
  end if;
  update public.tax_documents set
    status=p_decision,reviewed_by=p_actor,reviewed_at=now(),review_reason=trim(p_reason),
    is_canonical_bir_cor=(p_decision='verified')
  where document_id=p_document_id;
  insert into public.admin_audit_log(admin_id,action,target_id,details)
  values(p_actor,'tax_document_'||p_decision,p_document_id,
    jsonb_build_object('party_type','freelancer','document_type','bir_cor','reason',trim(p_reason)));
  return p_document_id;
end; $$;
revoke all on function public.worksync_admin_review_canonical_bir_cor(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.worksync_admin_review_canonical_bir_cor(uuid,uuid,text,text) to service_role;

create or replace function public.worksync_admin_select_canonical_bir_cor(
  p_actor uuid,p_document_id uuid,p_reason text
) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.tax_documents%rowtype; owner uuid;
begin
  if not exists(select 1 from public.admin_members a where a.user_id=p_actor) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  if coalesce(length(trim(p_reason)),0)<2 or length(p_reason)>2000 then
    raise exception 'Provide a reason for selecting the canonical Form 2303';
  end if;
  select user_id into owner from public.tax_documents where document_id=p_document_id;
  if owner is null then raise exception 'Freelancer Form 2303 not found'; end if;
  perform 1 from public.freelancer_profiles f where f.user_id=owner for update;
  select * into d from public.tax_documents where document_id=p_document_id for update;
  if not found or d.party_type<>'freelancer' or d.document_type<>'bir_cor' or d.status<>'verified'
     or (d.expires_at is not null and d.expires_at<current_date) then
    raise exception 'Only a current verified freelancer Form 2303 can be selected';
  end if;
  if exists(select 1 from public.tax_documents newer where newer.user_id=d.user_id
      and newer.party_type='freelancer' and newer.document_type='bir_cor'
      and newer.submitted_at>d.submitted_at) then
    raise exception 'A newer Form 2303 exists; resolve that submission first';
  end if;
  update public.tax_documents set is_canonical_bir_cor=false
  where user_id=d.user_id and party_type='freelancer'
    and document_type='bir_cor' and is_canonical_bir_cor;
  update public.tax_documents set is_canonical_bir_cor=true where document_id=p_document_id;
  insert into public.admin_audit_log(admin_id,action,target_id,details)
  values(p_actor,'canonical_freelancer_bir_cor_selected',p_document_id,
    jsonb_build_object('user_id',d.user_id,'reason',trim(p_reason)));
  return p_document_id;
end; $$;
revoke all on function public.worksync_admin_select_canonical_bir_cor(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.worksync_admin_select_canonical_bir_cor(uuid,uuid,text) to service_role;

-- VAT checks require the canonical COR but retain the existing VAT-class and
-- verified registration-document gates. No VAT or withholding tax rules change.
create or replace function public.worksync_validate_payment_service_vat_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare project_row public.projects; client_user uuid; freelancer_user uuid; agreed_base numeric;
        current_classification text; current_vat_applicable boolean; today date:=current_date;
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
  if new.payer_id is distinct from client_user or new.order_id is distinct from project_row.order_id
    or agreed_base is null or agreed_base is distinct from new.freelancer_service_vat_taxable_base
    or new.amount is distinct from round(agreed_base+new.freelancer_service_vat_amount,2) then
    raise exception 'Payment total must match the client, signed agreement base, and VAT snapshot';
  end if;
  select vat_classification,freelancer_vat_applicable into current_classification,current_vat_applicable
    from public.freelancer_tax_profiles where user_id=freelancer_user;
  if current_classification is distinct from new.freelancer_service_vat_classification then
    raise exception 'Freelancer VAT classification changed; prepare a new checkout';
  end if;
  if new.freelancer_service_vat_rate=0.12 then
    if current_vat_applicable is distinct from true or current_classification is distinct from 'vat_registered'
      or not exists(select 1 from public.tax_documents d where d.document_id=new.freelancer_service_vat_document_id
        and d.user_id=freelancer_user and d.party_type='freelancer' and d.document_type='vat_registration'
        and d.status='verified' and (d.expires_at is null or d.expires_at>=today))
      or public.worksync_freelancer_canonical_bir_cor(freelancer_user) is null then
      raise exception 'VAT registration and COR must be currently verified';
    end if;
  elsif new.freelancer_service_vat_rate=0 then
    if current_vat_applicable is distinct from false or current_classification is distinct from 'non_vat'
      or new.freelancer_service_vat_document_id is distinct from public.worksync_freelancer_canonical_bir_cor(freelancer_user) then
      raise exception 'A current reviewed non-VAT classification and COR are required';
    end if;
  else
    raise exception 'Unsupported freelancer VAT rate';
  end if;
  return new;
end; $$;
revoke all on function public.worksync_validate_payment_service_vat_snapshot() from public,anon,authenticated;

-- Payout tax snapshots use the canonical COR document ID. The withholding rate,
-- threshold, declaration, and applicability gates remain unchanged.
create or replace function public.worksync_apply_payout_tax_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  withholding_applicable boolean:=false; withholding_globally_enabled boolean:=false;
  vat_configured boolean:=false; exemption text:='not_applicable';
  latest_status text; latest_threshold_status text; prior_gross numeric:=0;
  current_year integer:=extract(year from now() at time zone 'Asia/Manila')::integer;
  declaration_id uuid; cor_id uuid; vat_doc_id uuid;
  pay public.payments; milestone_base numeric; milestone_vat numeric;
begin
  select * into pay from public.payments where payment_id=new.payment_id;
  if pay.payment_id is null then raise exception 'Payout payment record is unavailable'; end if;
  if pay.freelancer_service_vat_taxable_base is not null then
    if new.milestone_id is not null then
      select amount into milestone_base from public.milestones where milestone_id=new.milestone_id and project_id=new.project_id;
      if milestone_base is null or new.amount is distinct from milestone_base then raise exception 'Milestone payout base does not match the funded milestone'; end if;
      milestone_vat:=public.worksync_project_milestone_vat(new.payment_id,new.project_id,new.milestone_id);
      if milestone_vat is null then raise exception 'Milestone VAT allocation is unavailable'; end if;
      new.gross_amount:=round(milestone_base+milestone_vat,2);
      new.freelancer_vat_taxable_amount:=milestone_base; new.freelancer_vat_amount:=milestone_vat;
    else
      if new.amount is distinct from pay.amount then raise exception 'Full-project payout does not match funded payment'; end if;
      new.gross_amount:=pay.amount; new.freelancer_vat_taxable_amount:=pay.freelancer_service_vat_taxable_base;
      new.freelancer_vat_amount:=pay.freelancer_service_vat_amount;
    end if;
    new.freelancer_vat_rate:=pay.freelancer_service_vat_rate;
    new.freelancer_vat_rule:=pay.freelancer_service_vat_rule;
    new.freelancer_vat_document_id:=pay.freelancer_service_vat_document_id;
  else
    if new.gross_amount is null then new.gross_amount:=new.amount; end if;
    select coalesce(freelancer_vat_applicable,false) into vat_configured
      from public.freelancer_tax_profiles where user_id=new.recipient_id;
    select document_id into vat_doc_id from public.tax_documents
      where user_id=new.recipient_id and party_type='freelancer' and document_type='vat_registration'
        and status='verified' and (expires_at is null or expires_at>=current_date)
      order by reviewed_at desc,submitted_at desc limit 1;
    if vat_configured and vat_doc_id is not null then
      new.freelancer_vat_rate:=0.12;
      new.freelancer_vat_rule:='Legacy saved price treated as VAT-inclusive; verified registration on file';
      new.freelancer_vat_taxable_amount:=round(new.gross_amount/1.12,2);
      new.freelancer_vat_amount:=new.gross_amount-new.freelancer_vat_taxable_amount;
      new.freelancer_vat_document_id:=vat_doc_id;
    else
      new.freelancer_vat_rate:=0;
      new.freelancer_vat_rule:='Legacy VAT treatment not recorded with current verified registration';
      new.freelancer_vat_taxable_amount:=new.gross_amount; new.freelancer_vat_amount:=0;
      new.freelancer_vat_document_id:=null;
    end if;
  end if;
  select coalesce(marketplace_withholding_applicable,false) into withholding_applicable
    from public.freelancer_tax_profiles where user_id=new.recipient_id;
  select coalesce(marketplace_withholding_enabled,false) into withholding_globally_enabled
    from public.platform_tax_configuration where configuration_id=true;
  withholding_applicable:=withholding_applicable and withholding_globally_enabled;
  cor_id:=public.worksync_freelancer_canonical_bir_cor(new.recipient_id);
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
      new.withholding_basis:=new.gross_amount; new.withholding_amount:=round(new.gross_amount*new.withholding_rate,2);
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

notify pgrst,'reload schema';
commit;
