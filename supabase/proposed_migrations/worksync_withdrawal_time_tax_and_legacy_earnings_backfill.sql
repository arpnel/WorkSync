-- PREPARED, NOT APPLIED.
-- Support partial net withdrawals with server-calculated withholding, retain
-- demo-only processing/paid statuses, and backfill older completed earnings.
-- Requires the compatible seller-tax migration, project settlement version 3,
-- and the manual-withdrawal column/guard.
begin;

do $$
begin
  if to_regclass('public.project_payouts') is null
    or to_regclass('public.freelancer_tax_declarations') is null
    or to_regclass('public.freelancer_payout_accounts') is null
    or to_regprocedure('public.worksync_freelancer_canonical_bir_cor(uuid)') is null
    or to_regprocedure('public.worksync_freelancer_seller_eligible(uuid)') is null
    or to_regprocedure('public.worksync_settle_project(uuid,uuid,text)') is null
    or to_regprocedure('public.worksync_payout_work_approved(uuid)') is null
    or to_regprocedure('public.worksync_project_milestone_vat(uuid,uuid,uuid)') is null
    or to_regprocedure('public.worksync_payment_matches_project(uuid,uuid,text)') is null
    or to_regprocedure('public.worksync_lock_project_money(uuid)') is null then
    raise exception 'Required tax, payout, and project-settlement prerequisites are missing';
  end if;
  if public.worksync_settlement_version() is distinct from 3 then
    raise exception 'Apply the version 3 project-settlement migration before this migration';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='project_payouts'
      and column_name='withdrawal_requested_at'
  ) then
    raise exception 'Apply the manual payout withdrawal migration before this migration';
  end if;
  if exists (
    select required.column_name
    from (values
      ('amount'),('gross_amount'),('recipient_id'),('mode'),('status'),('updated_at'),
      ('freelancer_vat_taxable_amount'),('freelancer_vat_amount'),('freelancer_vat_rate'),
      ('freelancer_vat_rule'),('freelancer_vat_document_id'),('withholding_basis'),
      ('withholding_rate'),('withholding_amount'),('withholding_date'),('withholding_rule'),
      ('withholding_exemption_status'),('withholding_declaration_id'),('withholding_document_id'),
      ('provider_transfer_id'),('provider_batch_id')
    ) as required(column_name)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema='public' and c.table_name='project_payouts'
        and c.column_name=required.column_name
    )
  ) then
    raise exception 'Payout tax snapshot columns are incomplete; apply the payout tax and receipt prerequisites first';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.project_payouts'::regclass
      and tgname='worksync_guard_payout_withdrawal_request' and not tgisinternal
  ) then
    raise exception 'Apply the manual payout withdrawal guard before this migration';
  end if;
end;
$$;

-- A withdrawal may consume portions of several ready earnings rows. Keep the
-- request and its per-project allocations separate so the remaining balance is
-- durable and concurrent requests cannot spend the same earnings twice.
-- These support tables may already exist if an earlier manual SQL run created
-- them before failing later in the script. Preserve their rows and continue.
create table if not exists public.payout_withdrawal_requests (
  withdrawal_id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public."Users"(user_id) on delete cascade,
  mode text not null check (mode='test'),
  requested_net_amount numeric not null check (requested_net_amount>0),
  gross_amount numeric not null check (gross_amount>=requested_net_amount),
  withholding_basis numeric not null check (withholding_basis>=0),
  withholding_rate numeric not null check (withholding_rate in (0,0.005)),
  withholding_amount numeric not null check (withholding_amount>=0),
  withholding_exemption_status text not null,
  withholding_declaration_id uuid references public.freelancer_tax_declarations(declaration_id) on delete restrict,
  withholding_document_id uuid references public.tax_documents(document_id) on delete restrict,
  status text not null default 'processing' check (status in ('processing','paid')),
  requested_at timestamptz not null default clock_timestamp(),
  paid_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (gross_amount=round(requested_net_amount+withholding_amount,2)),
  check ((status='paid' and paid_at is not null) or (status='processing' and paid_at is null))
);

create table if not exists public.payout_withdrawal_allocations (
  withdrawal_id uuid not null references public.payout_withdrawal_requests(withdrawal_id) on delete cascade,
  payout_id uuid not null references public.project_payouts(payout_id) on delete restrict,
  gross_amount numeric not null check (gross_amount>0),
  created_at timestamptz not null default clock_timestamp(),
  primary key (withdrawal_id,payout_id)
);

create index if not exists payout_withdrawal_requests_owner_mode_status_created_idx
  on public.payout_withdrawal_requests(recipient_id,mode,status,created_at desc);
create index if not exists payout_withdrawal_allocations_payout_idx
  on public.payout_withdrawal_allocations(payout_id);

alter table public.payout_withdrawal_requests enable row level security;
alter table public.payout_withdrawal_allocations enable row level security;
revoke all on public.payout_withdrawal_requests,public.payout_withdrawal_allocations from public,anon,authenticated;
grant select,insert,update,delete on public.payout_withdrawal_requests,public.payout_withdrawal_allocations to service_role;

-- At project completion, reserve the freelancer taxable service earnings only. Apply
-- withholding later, from the then-current verified documents, on request.
create or replace function public.worksync_apply_payout_tax_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  pay public.payments;
  milestone_base numeric;
  milestone_vat numeric;
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
      if new.amount is distinct from round(pay.freelancer_service_vat_taxable_base+pay.freelancer_service_vat_amount,2) then
        raise exception 'Full-project payout does not match agreed price and VAT';
      end if;
      new.gross_amount:=round(pay.freelancer_service_vat_taxable_base+pay.freelancer_service_vat_amount,2);
      new.freelancer_vat_taxable_amount:=pay.freelancer_service_vat_taxable_base;
      new.freelancer_vat_amount:=pay.freelancer_service_vat_amount;
    end if;
    new.freelancer_vat_rate:=pay.freelancer_service_vat_rate;
    new.freelancer_vat_rule:=pay.freelancer_service_vat_rule;
    new.freelancer_vat_document_id:=pay.freelancer_service_vat_document_id;
  else
    raise exception 'Payout cannot use a payment without an immutable VAT snapshot; reconcile the legacy payment before settlement'
      using errcode='23514';
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
  if new.amount<=0 then raise exception 'Freelancer payout must be positive'; end if;
  return new;
end;
$$;
revoke all on function public.worksync_apply_payout_tax_snapshot() from public,anon,authenticated;
drop trigger if exists worksync_apply_payout_tax_snapshot on public.project_payouts;
create trigger worksync_apply_payout_tax_snapshot before insert on public.project_payouts
  for each row execute function public.worksync_apply_payout_tax_snapshot();

-- Permit tax values to be set once, in the same transaction as the withdrawal
-- request, while keeping gross and VAT snapshots immutable.
create or replace function public.worksync_guard_payout_tax_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare tax_changed boolean; vat_or_gross_changed boolean;
        reprice_mode text:=current_setting('worksync.payout_tax_reprice',true);
begin
  tax_changed:=(new.withholding_basis,new.withholding_rate,new.withholding_amount,new.withholding_date,
    new.withholding_rule,new.withholding_exemption_status,new.withholding_declaration_id,new.withholding_document_id)
    is distinct from
    (old.withholding_basis,old.withholding_rate,old.withholding_amount,old.withholding_date,
    old.withholding_rule,old.withholding_exemption_status,old.withholding_declaration_id,old.withholding_document_id);
  vat_or_gross_changed:=(new.gross_amount,new.freelancer_vat_taxable_amount,new.freelancer_vat_amount,
    new.freelancer_vat_rate,new.freelancer_vat_rule,new.freelancer_vat_document_id)
    is distinct from
    (old.gross_amount,old.freelancer_vat_taxable_amount,old.freelancer_vat_amount,
    old.freelancer_vat_rate,old.freelancer_vat_rule,old.freelancer_vat_document_id);

  if vat_or_gross_changed then
    raise exception 'Gross and VAT payout snapshots are immutable' using errcode='55000';
  end if;
  if tax_changed then
    if reprice_mode='withdrawal'
      and old.status='ready' and old.withdrawal_requested_at is null
      and new.status='ready' and new.withdrawal_requested_at is not null then
      return new;
    elsif reprice_mode='migration_backfill'
      and old.status in ('ready','awaiting_account')
      and new.status in ('ready','awaiting_account')
      and old.withdrawal_requested_at is null and new.withdrawal_requested_at is null then
      return new;
    end if;
    raise exception 'Payout tax snapshots can change only at withdrawal request' using errcode='55000';
  end if;
  return new;
end;
$$;
revoke all on function public.worksync_guard_payout_tax_snapshot() from public,anon,authenticated;
drop trigger if exists worksync_guard_payout_tax_snapshot on public.project_payouts;
create trigger worksync_guard_payout_tax_snapshot before update on public.project_payouts
  for each row execute function public.worksync_guard_payout_tax_snapshot();

-- Reconcile open test-mode balances to freelancer earnings excluding VAT.
-- Requested, processing, pending, paid, failed, cancelled and review rows stay intact.
select set_config('worksync.payout_tax_reprice','migration_backfill',true);
update public.project_payouts
set amount=coalesce(freelancer_vat_taxable_amount,gross_amount-freelancer_vat_amount,gross_amount),
    withholding_basis=0,
    withholding_rate=0,
    withholding_amount=0,
    withholding_date=null,
    withholding_rule='Calculated from current verified documents when withdrawal is requested',
    withholding_exemption_status='not_calculated',
    withholding_declaration_id=null,
    withholding_document_id=null,
    updated_at=now()
where mode='test' and status in ('ready','awaiting_account')
  and withdrawal_requested_at is null
  and (amount is distinct from coalesce(freelancer_vat_taxable_amount,gross_amount-freelancer_vat_amount,gross_amount) or withholding_amount<>0 or withholding_rate<>0
    or withholding_basis<>0 or withholding_exemption_status<>'not_calculated');

create or replace function public.worksync_payout_withdrawal_quote(
  p_user uuid,p_mode text
) returns table(
  available_gross numeric,withholding_rate numeric,exemption_status text,
  available_withholding numeric,available_net numeric,declaration_id uuid
)
language plpgsql security invoker set search_path='' as $$
declare
  latest_status text;
  latest_id uuid;
  tax_rate numeric:=0.005;
  exemption text:='declaration_missing';
  available numeric:=0;
  tax numeric:=0;
  current_year integer:=extract(year from now() at time zone 'Asia/Manila')::integer;
begin
  if current_user is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_user is null or p_mode is distinct from 'test' then raise exception 'Invalid withdrawal quote'; end if;

  select d.declaration_id,d.status into latest_id,latest_status
  from public.freelancer_tax_declarations d
  where d.user_id=p_user and d.tax_year=current_year
  order by d.submitted_at desc,d.declaration_id desc limit 1;
  if latest_status='accepted' and latest_id is not null then
    tax_rate:=0; exemption:='sworn_declaration_verified';
  elsif latest_status='pending' then exemption:='declaration_pending';
  elsif latest_status='rejected' then exemption:='declaration_rejected';
  elsif latest_status='revoked' then exemption:='declaration_revoked';
  end if;

  select coalesce(sum(greatest(0,
    coalesce(r.freelancer_vat_taxable_amount,r.gross_amount-r.freelancer_vat_amount,r.gross_amount,r.amount)
      -coalesce(a.allocated,0))),0)
  into available
  from public.project_payouts r
  left join lateral (
    select sum(i.gross_amount) as allocated
    from public.payout_withdrawal_allocations i
    where i.payout_id=r.payout_id
  ) a on true
  where r.recipient_id=p_user and r.mode=p_mode and r.status='ready'
    and r.withdrawal_requested_at is null
    and r.provider_transfer_id is null and r.provider_batch_id is null;
  tax:=round(available*tax_rate,2);
  return query select available,tax_rate,exemption,tax,greatest(0,available-tax),latest_id;
end;
$$;
revoke all on function public.worksync_payout_withdrawal_quote(uuid,text) from public,anon,authenticated;
grant execute on function public.worksync_payout_withdrawal_quote(uuid,text) to service_role;

drop function if exists public.worksync_request_partial_withdrawal(uuid,numeric,text);
create function public.worksync_request_partial_withdrawal(
  p_user uuid,p_gross_amount numeric,p_mode text
) returns setof public.payout_withdrawal_requests
language plpgsql security invoker set search_path='' as $$
declare
  profile_id uuid;
  cor_id uuid;
  declaration_id uuid;
  declaration_status text;
  exemption text:='declaration_missing';
  rate numeric:=0.005;
  available_gross numeric:=0;
  gross numeric:=0;
  tax_amount numeric:=0;
  net_amount numeric:=0;
  remaining numeric:=0;
  allocation numeric:=0;
  request_row public.payout_withdrawal_requests;
  source record;
  requested_at timestamptz:=clock_timestamp();
  current_year integer:=extract(year from requested_at at time zone 'Asia/Manila')::integer;
begin
  if current_user is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_user is null or p_mode is distinct from 'test'
    or p_gross_amount is null or p_gross_amount<=0 or p_gross_amount<>round(p_gross_amount,2)
    or p_gross_amount::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Invalid requested gross withdrawal amount';
  end if;

  select f.freelancer_id into profile_id from public.freelancer_profiles f
  where f.user_id=p_user for update;
  if profile_id is null then raise exception 'A freelancer account is required'; end if;
  if not coalesce(public.worksync_freelancer_seller_eligible(p_user),false) then
    raise exception 'Submit the required seller documents and receive approval before withdrawal';
  end if;
  if not exists(select 1 from public.freelancer_payout_accounts a where a.user_id=p_user and a.mode=p_mode) then
    raise exception 'Add a payout account before requesting withdrawal';
  end if;
  cor_id:=public.worksync_freelancer_canonical_bir_cor(p_user);
  if cor_id is null then
    raise exception 'Submit a current BIR Form 2303 and wait for administrator verification before requesting withdrawal';
  end if;

  select d.declaration_id,d.status into declaration_id,declaration_status
  from public.freelancer_tax_declarations d
  where d.user_id=p_user and d.tax_year=current_year
  order by d.submitted_at desc,d.declaration_id desc limit 1;
  if declaration_status='accepted' and declaration_id is not null then
    rate:=0; exemption:='sworn_declaration_verified';
  elsif declaration_status='pending' then exemption:='declaration_pending';
  elsif declaration_status='rejected' then exemption:='declaration_rejected';
  elsif declaration_status='revoked' then exemption:='declaration_revoked';
  end if;

  select q.available_gross into available_gross
  from public.worksync_payout_withdrawal_quote(p_user,p_mode) q;
  gross:=p_gross_amount;
  tax_amount:=round(gross*rate,2);
  net_amount:=round(gross-tax_amount,2);
  if gross>available_gross then
    raise exception 'Requested gross withdrawal exceeds available earnings';
  end if;

  -- Serialize against source rows too; requests lock the freelancer profile
  -- first, then lock ready earnings in the same deterministic order.
  perform r.payout_id from public.project_payouts r
  where r.recipient_id=p_user and r.mode=p_mode and r.status='ready'
    and r.withdrawal_requested_at is null and r.provider_transfer_id is null and r.provider_batch_id is null
  order by r.created_at,r.payout_id for update;

  insert into public.payout_withdrawal_requests(
    recipient_id,mode,requested_net_amount,gross_amount,withholding_basis,withholding_rate,
    withholding_amount,withholding_exemption_status,withholding_declaration_id,
    withholding_document_id,status,requested_at,updated_at
  ) values (
    p_user,p_mode,net_amount,gross,gross,rate,tax_amount,exemption,
    case when exemption='sworn_declaration_verified' then declaration_id else null end,
    cor_id,'processing',requested_at,requested_at
  ) returning * into request_row;

  remaining:=gross;
  for source in
    select r.payout_id,
      greatest(0,coalesce(r.freelancer_vat_taxable_amount,r.gross_amount-r.freelancer_vat_amount,r.gross_amount,r.amount)-coalesce(a.allocated,0)) as available
    from public.project_payouts r
    left join lateral (
      select sum(i.gross_amount) as allocated from public.payout_withdrawal_allocations i
      where i.payout_id=r.payout_id
    ) a on true
    where r.recipient_id=p_user and r.mode=p_mode and r.status='ready'
      and r.withdrawal_requested_at is null
      and r.provider_transfer_id is null and r.provider_batch_id is null
    order by r.created_at,r.payout_id
  loop
    if source.available<=0 then continue; end if;
    allocation:=least(source.available,remaining);
    insert into public.payout_withdrawal_allocations(withdrawal_id,payout_id,gross_amount)
    values(request_row.withdrawal_id,source.payout_id,allocation);
    remaining:=remaining-allocation;
    exit when remaining<=0;
  end loop;
  if remaining>0 then raise exception 'Available earnings changed; refresh and try again'; end if;
  return next request_row;
end;
$$;
revoke all on function public.worksync_request_partial_withdrawal(uuid,numeric,text) from public,anon,authenticated;
grant execute on function public.worksync_request_partial_withdrawal(uuid,numeric,text) to service_role;

-- Retire the prior whole-payout RPC so callers cannot bypass net-amount checks.
create or replace function public.worksync_request_payout_withdrawal(
  p_user uuid,p_payout_id uuid,p_mode text
) returns setof public.project_payouts
language plpgsql security invoker set search_path='' as $$
begin
  raise exception 'Use the partial withdrawal flow';
end;
$$;
revoke all on function public.worksync_request_payout_withdrawal(uuid,uuid,text) from public,anon,authenticated,service_role;

drop function if exists public.worksync_complete_demo_payout(uuid,uuid,text);
create function public.worksync_complete_demo_payout(
  p_user uuid,p_withdrawal_id uuid,p_mode text
) returns setof public.payout_withdrawal_requests
language plpgsql security invoker set search_path='' as $$
declare withdrawal public.payout_withdrawal_requests;
begin
  if current_user is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_user is null or p_withdrawal_id is null or p_mode is distinct from 'test' then
    raise exception 'Invalid demo payout completion';
  end if;
  update public.payout_withdrawal_requests w
  set status='paid',paid_at=coalesce(w.paid_at,clock_timestamp()),updated_at=clock_timestamp()
  where w.withdrawal_id=p_withdrawal_id and w.recipient_id=p_user and w.mode=p_mode and w.status='processing'
  returning w.* into withdrawal;
  if not found then
    select * into withdrawal from public.payout_withdrawal_requests w
    where w.withdrawal_id=p_withdrawal_id and w.recipient_id=p_user and w.mode=p_mode;
    if not found then raise exception 'Withdrawal was not found'; end if;
    if withdrawal.status='paid' then return next withdrawal; return; end if;
    raise exception 'Withdrawal is not processing';
  end if;
  return next withdrawal;
end;
$$;
revoke all on function public.worksync_complete_demo_payout(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.worksync_complete_demo_payout(uuid,uuid,text) to service_role;

-- Settlement must validate the stored net payout against taxable earnings,
-- while retaining the VAT-inclusive gross snapshot for audit records.
do $$
declare fn text; old_check text; replacement text;
begin
  fn:=pg_get_functiondef('public.worksync_claim_payout(uuid)'::regprocedure);
  replacement:='coalesce(r.freelancer_vat_taxable_amount,r.gross_amount-r.freelancer_vat_amount,r.gross_amount)-r.withholding_amount';
  if position(replacement in fn)=0 then
    old_check:='r.amount is distinct from r.gross_amount-r.withholding_amount';
    if position(old_check in fn)>0 then
      fn:=replace(fn,old_check,'r.amount is distinct from '||replacement);
    else
      old_check:='r.amount<>r.gross_amount-r.withholding_amount';
      if position(old_check in fn)=0 then
      raise exception 'Unexpected payout claim amount check; review before applying VAT exclusion';
      end if;
      fn:=replace(fn,old_check,'r.amount<>'||replacement);
    end if;
  end if;
  execute fn;
end $$;

-- Explicit service-only backfill. Reuses settlement's payment, delivery,
-- contract and uniqueness checks; only fully approved completed work qualifies.
create or replace function public.worksync_backfill_completed_freelancer_payouts(
  p_freelancer uuid,p_mode text,p_limit integer default 100
) returns table(projects_processed integer,payouts_created integer)
language plpgsql security definer set search_path='' as $$
declare candidate record; before_count bigint; after_count bigint;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_freelancer is null or p_mode is distinct from 'test'
    or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid completed-earnings backfill request';
  end if;
  if not exists(select 1 from public.freelancer_profiles f where f.user_id=p_freelancer) then
    raise exception 'Freelancer account not found';
  end if;
  projects_processed:=0; payouts_created:=0;
  for candidate in
    select p.project_id,pay.payment_id
    from public.projects p
    join public.freelancer_profiles f on f.freelancer_id=p.freelancer_id and f.user_id=p_freelancer
    join lateral (
      select x.payment_id from public.payments x
      where x.project_id=p.project_id and x.status='paid'
        and public.worksync_payment_matches_project(p.project_id,x.payment_id,p_mode)
      order by x.created_at desc,x.payment_id desc limit 1
    ) pay on true
    where p.status::text='completed'
      and public.worksync_payout_work_approved(p.project_id)
      and (
        (not exists(select 1 from public.milestones m where m.project_id=p.project_id)
          and not exists(select 1 from public.project_payouts r where r.project_id=p.project_id and r.mode=p_mode and r.milestone_id is null))
        or exists(
          select 1 from public.milestones m
          where m.project_id=p.project_id and m.status::text in ('approved','completed')
            and not exists(select 1 from public.project_payouts r where r.project_id=p.project_id and r.mode=p_mode and r.milestone_id=m.milestone_id)
        )
      )
    order by p.completed_at nulls last,p.project_id
    limit p_limit
  loop
    perform public.worksync_lock_project_money(candidate.project_id);
    select count(*) into before_count from public.project_payouts r
    where r.project_id=candidate.project_id and r.mode=p_mode;
    perform public.worksync_settle_project(candidate.project_id,candidate.payment_id,p_mode);
    select count(*) into after_count from public.project_payouts r
    where r.project_id=candidate.project_id and r.mode=p_mode;
    projects_processed:=projects_processed+1;
    payouts_created:=payouts_created+greatest(after_count-before_count,0)::integer;
  end loop;
  return next;
end;
$$;
revoke all on function public.worksync_backfill_completed_freelancer_payouts(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.worksync_backfill_completed_freelancer_payouts(uuid,text,integer) to service_role;

notify pgrst,'reload schema';
commit;
