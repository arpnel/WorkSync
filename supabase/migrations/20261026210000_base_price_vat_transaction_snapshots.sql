-- PREPARED, NOT APPLIED. Treat contract.final_price as the service base price
-- for new payments and freeze the verified VAT treatment at checkout.
-- Historical payments without these snapshots keep their existing amounts.
-- Depends on 202609300004_milestone_settlement.sql, the existing tax document
-- and receipt structures, and 202610250007_project_review_automation.sql.
begin;

alter table public.payments
  add column if not exists freelancer_service_vat_taxable_base numeric,
  add column if not exists freelancer_service_vat_rate numeric,
  add column if not exists freelancer_service_vat_amount numeric,
  add column if not exists freelancer_service_vat_classification text,
  add column if not exists freelancer_service_vat_document_id uuid references public.tax_documents(document_id) on delete restrict,
  add column if not exists freelancer_service_vat_rule text;

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
      and freelancer_service_vat_classification in ('vat_registered','non_vat')
      and freelancer_service_vat_document_id is not null
      and length(trim(coalesce(freelancer_service_vat_rule,''))) > 0
      and amount = round(freelancer_service_vat_taxable_base+freelancer_service_vat_amount,2))
  );

create or replace function public.worksync_guard_payment_service_vat_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (new.freelancer_service_vat_taxable_base,new.freelancer_service_vat_rate,
      new.freelancer_service_vat_amount,new.freelancer_service_vat_classification,
      new.freelancer_service_vat_document_id,new.freelancer_service_vat_rule)
     is distinct from
     (old.freelancer_service_vat_taxable_base,old.freelancer_service_vat_rate,
      old.freelancer_service_vat_amount,old.freelancer_service_vat_classification,
      old.freelancer_service_vat_document_id,old.freelancer_service_vat_rule)
     and (old.status='paid' or old.transaction_reference is not null) then
    raise exception 'Checkout tax snapshot is immutable after a payment session is created' using errcode='55000';
  end if;
  return new;
end; $$;
revoke all on function public.worksync_guard_payment_service_vat_snapshot() from public,anon,authenticated;
drop trigger if exists worksync_guard_payment_service_vat_snapshot on public.payments;
create trigger worksync_guard_payment_service_vat_snapshot
  before update of freelancer_service_vat_taxable_base,freelancer_service_vat_rate,
    freelancer_service_vat_amount,freelancer_service_vat_classification,
    freelancer_service_vat_document_id,freelancer_service_vat_rule
  on public.payments for each row execute function public.worksync_guard_payment_service_vat_snapshot();

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
  if new.payer_id is distinct from client_user
    or new.order_id is distinct from project_row.order_id
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
      or not exists(select 1 from public.tax_documents d where d.user_id=freelancer_user and d.party_type='freelancer'
        and d.document_type='bir_cor' and d.status='verified' and (d.expires_at is null or d.expires_at>=today)) then
      raise exception 'VAT registration and COR must be currently verified';
    end if;
  elsif new.freelancer_service_vat_rate=0 then
    if current_vat_applicable is distinct from false or current_classification is distinct from 'non_vat'
      or not exists(select 1 from public.tax_documents d where d.document_id=new.freelancer_service_vat_document_id
        and d.user_id=freelancer_user and d.party_type='freelancer' and d.document_type='bir_cor'
        and d.status='verified' and (d.expires_at is null or d.expires_at>=today)) then
      raise exception 'A current reviewed non-VAT classification and COR are required';
    end if;
  else
    raise exception 'Unsupported freelancer VAT rate';
  end if;
  return new;
end; $$;
revoke all on function public.worksync_validate_payment_service_vat_snapshot() from public,anon,authenticated;
drop trigger if exists worksync_validate_payment_service_vat_snapshot on public.payments;
create trigger worksync_validate_payment_service_vat_snapshot
  before insert on public.payments for each row execute function public.worksync_validate_payment_service_vat_snapshot();

-- Deterministically assign the rounded project VAT across milestone bases;
-- the final milestone receives any cent-rounding remainder.
create or replace function public.worksync_project_milestone_vat(p_payment uuid,p_project uuid,p_milestone uuid)
returns numeric language sql stable security definer set search_path='' as $$
  with tax as (
    select freelancer_service_vat_rate as rate,freelancer_service_vat_amount as vat
    from public.payments where payment_id=p_payment and project_id=p_project
  ), ordered as (
    select m.milestone_id,m.amount,
      row_number() over(order by m.display_order,m.milestone_id) as rn,
      count(*) over() as total
    from public.milestones m where m.project_id=p_project
  ), current_row as (
    select o.* from ordered o where o.milestone_id=p_milestone
  )
  select case
    when t.rate is distinct from 0.12 then 0::numeric
    when c.milestone_id is null then null::numeric
    when c.rn=c.total then round(t.vat-coalesce((
      select sum(round(prior.amount*t.rate,2)) from ordered prior where prior.rn<c.rn
    ),0),2)
    else round(c.amount*t.rate,2)
  end
  from tax t left join current_row c on true;
$$;
revoke all on function public.worksync_project_milestone_vat(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.worksync_project_milestone_vat(uuid,uuid,uuid) to service_role;

-- Preserve the existing withholding gate and declaration/COR handling. New
-- transactions take VAT values from the payment snapshot; old rows retain the
-- pre-existing inclusive-price treatment rather than being recalculated.
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
      select amount into milestone_base from public.milestones
      where milestone_id=new.milestone_id and project_id=new.project_id;
      if milestone_base is null or new.amount is distinct from milestone_base then
        raise exception 'Milestone payout base does not match the funded milestone';
      end if;
      milestone_vat:=public.worksync_project_milestone_vat(new.payment_id,new.project_id,new.milestone_id);
      if milestone_vat is null then raise exception 'Milestone VAT allocation is unavailable'; end if;
      new.gross_amount:=round(milestone_base+milestone_vat,2);
      new.freelancer_vat_taxable_amount:=milestone_base;
      new.freelancer_vat_amount:=milestone_vat;
    else
      if new.amount is distinct from pay.amount then raise exception 'Full-project payout does not match funded payment'; end if;
      new.gross_amount:=pay.amount;
      new.freelancer_vat_taxable_amount:=pay.freelancer_service_vat_taxable_base;
      new.freelancer_vat_amount:=pay.freelancer_service_vat_amount;
    end if;
    new.freelancer_vat_rate:=pay.freelancer_service_vat_rate;
    new.freelancer_vat_rule:=pay.freelancer_service_vat_rule;
    new.freelancer_vat_document_id:=pay.freelancer_service_vat_document_id;
  else
    if new.gross_amount is null then new.gross_amount:=new.amount; end if;
    select coalesce(freelancer_vat_applicable,false)
      into vat_configured from public.freelancer_tax_profiles where user_id=new.recipient_id;
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
      new.freelancer_vat_taxable_amount:=new.gross_amount;
      new.freelancer_vat_amount:=0;
      new.freelancer_vat_document_id:=null;
    end if;
  end if;

  select coalesce(marketplace_withholding_applicable,false)
    into withholding_applicable from public.freelancer_tax_profiles where user_id=new.recipient_id;
  select coalesce(marketplace_withholding_enabled,false)
    into withholding_globally_enabled from public.platform_tax_configuration where configuration_id=true;
  withholding_applicable:=withholding_applicable and withholding_globally_enabled;
  select document_id into cor_id from public.tax_documents
    where user_id=new.recipient_id and party_type='freelancer' and document_type='bir_cor' and status='verified'
      and (expires_at is null or expires_at>=current_date)
    order by reviewed_at desc,submitted_at desc limit 1;
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

create or replace function public.worksync_payment_matches_project(p_project uuid,p_payment uuid,p_mode text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.payments pay join public.projects p on p.project_id=pay.project_id
    join public.client_profiles cp on cp.client_id=p.client_id join public.contracts c on c.order_id=p.order_id
    where p.project_id=p_project and pay.payment_id=p_payment and pay.order_id=p.order_id
      and pay.payer_id=cp.user_id and c.client_signed_at is not null and c.freelancer_signed_at is not null
      and c.final_price=p.budget
      and pay.amount=round(c.final_price+coalesce(pay.freelancer_service_vat_amount,0),2)
      and (pay.freelancer_service_vat_taxable_base is null or pay.freelancer_service_vat_taxable_base=c.final_price)
      and pay.amount>0 and pay.amount=round(pay.amount,2)
      and pay.amount::text not in ('NaN','Infinity','-Infinity') and pay.status='paid' and pay.provider='paymongo'
      and pay.currency='PHP' and p_mode in ('test','live') and pay.livemode=(p_mode='live')
      and pay.provider_payment_id is not null and pay.transaction_reference is not null);
$$;
revoke all on function public.worksync_payment_matches_project(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.worksync_payment_matches_project(uuid,uuid,text) to service_role;

create or replace function public.worksync_claim_payout(p_id uuid)
returns setof public.project_payouts language plpgsql security definer set search_path='' as $$
declare r public.project_payouts; p public.projects; pay public.payments; reserved numeric; expected_gross numeric;
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
    expected_gross:=pay.amount;
    if exists(select 1 from public.milestones where project_id=p.project_id)
      or r.gross_amount is distinct from expected_gross or not public.worksync_delivery_approved(p.project_id,null) then return; end if;
  else
    select round(m.amount+coalesce(public.worksync_project_milestone_vat(r.payment_id,p.project_id,m.milestone_id),0),2)
      into expected_gross from public.milestones m
      where m.milestone_id=r.milestone_id and m.project_id=p.project_id and m.status::text='approved';
    if expected_gross is null or r.gross_amount is distinct from expected_gross
      or not public.worksync_delivery_approved(p.project_id,r.milestone_id)
      or (select sum(amount) from public.milestones where project_id=p.project_id) is distinct from p.budget then return; end if;
  end if;
  select coalesce(sum(gross_amount),0) into reserved from public.project_payouts where payment_id=r.payment_id and status<>'cancelled';
  if reserved>pay.amount or r.amount<=0 or r.amount<>round(r.amount,2) or r.amount::text in ('NaN','Infinity','-Infinity')
    or r.withholding_amount<0 or r.withholding_amount>r.gross_amount or r.amount<>r.gross_amount-r.withholding_amount then return; end if;
  return query update public.project_payouts set status='processing',claimed_at=now(),updated_at=now()
    where payout_id=p_id returning *;
end; $$;
revoke all on function public.worksync_claim_payout(uuid) from public,anon,authenticated;
grant execute on function public.worksync_claim_payout(uuid) to service_role;

-- Overdue refunds include VAT allocated to each refunded milestone. Cancellation
-- refunds continue to use the funded total less already reserved gross payouts.
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
    select coalesce(sum(x.amount+coalesce(public.worksync_project_milestone_vat(p_payment,p.project_id,x.milestone_id),0)),0)
      into refund_amount from public.project_overdue_milestones x where x.project_id=p.project_id;
    if refund_amount<=0 or refund_amount<>round(refund_amount,2) or refund_amount>pay.amount then return; end if;
    if refund_amount+coalesce((select sum(coalesce((to_jsonb(r)->>'gross_amount')::numeric,r.amount))
      from public.project_payouts r where r.payment_id=p_payment and r.status<>'cancelled'),0)<>pay.amount then return; end if;
    if refund_amount<1 then
      insert into public.project_refunds(payment_id,project_id,mode,amount,status)
        values(p_payment,p.project_id,p_mode,refund_amount,'needs_review') returning * into refund_row;
    else
      insert into public.project_refunds(payment_id,project_id,mode,amount)
        values(p_payment,p.project_id,p_mode,refund_amount) returning * into refund_row;
    end if;
    insert into public.project_refund_milestones(refund_id,project_id,milestone_id,amount)
      select refund_row.refund_id,x.project_id,x.milestone_id,
        round(x.amount+coalesce(public.worksync_project_milestone_vat(p_payment,p.project_id,x.milestone_id),0),2)
      from public.project_overdue_milestones x where x.project_id=p.project_id;
    update public.project_overdue_actions set refund_id=refund_row.refund_id where project_id=p.project_id;
    if refund_row.status='needs_review' then return; end if;
    return next refund_row; return;
  end if;
  if not exists(select 1 from public.project_cancellations where order_id=pay.order_id and status='accepted') then return; end if;
  update public.project_payouts set status='cancelled',updated_at=now()
    where payment_id=p_payment and status in ('awaiting_account','ready');
  select pay.amount-coalesce(sum(coalesce((to_jsonb(r)->>'gross_amount')::numeric,r.amount)),0)
    into refund_amount from public.project_payouts r where r.payment_id=p_payment and r.status<>'cancelled';
  if refund_amount<=0 or refund_amount<>round(refund_amount,2) then return; end if;
  if refund_amount<1 then
    insert into public.project_refunds(payment_id,project_id,mode,amount,status)
      values(p_payment,p.project_id,p_mode,refund_amount,'needs_review');
    return;
  end if;
  return query insert into public.project_refunds(payment_id,project_id,mode,amount)
    values(p_payment,p.project_id,p_mode,refund_amount) returning *;
end; $$;
revoke all on function public.worksync_claim_project_refund(uuid,text) from public,anon,authenticated;
grant execute on function public.worksync_claim_project_refund(uuid,text) to service_role;

create or replace function public.worksync_payment_storage_ready()
returns boolean language sql stable security definer set search_path='' as $$
  select to_regclass('public.payments') is not null
    and not has_table_privilege('anon','public.payments','INSERT,UPDATE,DELETE,TRUNCATE')
    and not has_table_privilege('authenticated','public.payments','INSERT,UPDATE,DELETE,TRUNCATE')
    and not exists(select 1 from information_schema.column_privileges where table_schema='public' and table_name='payments'
      and grantee in ('PUBLIC','anon','authenticated') and privilege_type in ('INSERT','UPDATE'))
    and exists(select 1 from pg_index where indexrelid=to_regclass('public.payments_paymongo_provider_payment_unique') and indisunique and indisvalid)
    and exists(select 1 from pg_index where indexrelid=to_regclass('public.payments_paymongo_checkout_unique') and indisunique and indisvalid)
    and (select count(*)=6 from information_schema.columns where table_schema='public' and table_name='payments'
      and column_name in ('freelancer_service_vat_taxable_base','freelancer_service_vat_rate','freelancer_service_vat_amount',
        'freelancer_service_vat_classification','freelancer_service_vat_document_id','freelancer_service_vat_rule'))
    and exists(select 1 from pg_trigger where tgrelid='public.payments'::regclass and tgname='worksync_validate_payment_service_vat_snapshot' and not tgisinternal)
    and exists(select 1 from pg_trigger where tgrelid='public.project_payouts'::regclass and tgname='worksync_apply_payout_tax_snapshot' and not tgisinternal);
$$;
revoke all on function public.worksync_payment_storage_ready() from public,anon,authenticated;
grant execute on function public.worksync_payment_storage_ready() to service_role;

notify pgrst,'reload schema';
commit;
