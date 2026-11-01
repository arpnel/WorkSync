-- PREPARED, NOT APPLIED.
-- Apply a fixed 12% VAT amount and a 10% client transaction fee to new project
-- checkouts while keeping freelancer payouts limited to base plus VAT.
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
      and (freelancer_service_vat_classification = 'default_vat'
        or (freelancer_service_vat_classification in ('vat_registered','non_vat') and freelancer_service_vat_document_id is not null))
      and length(trim(coalesce(freelancer_service_vat_rule,''))) > 0
      and (amount = round(freelancer_service_vat_taxable_base+freelancer_service_vat_amount,2)
        or (platform_service_fee is not null
          and amount = round(freelancer_service_vat_taxable_base+freelancer_service_vat_amount+platform_service_fee,2))))
  );

-- New payment snapshots follow WorkSync's fixed 12% pricing rule. The separate
-- freelancer seller-eligibility gate still controls whether checkout may open.
create or replace function public.worksync_validate_payment_service_vat_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare project_row public.projects; client_user uuid; agreed_base numeric;
begin
  if new.freelancer_service_vat_taxable_base is null then
    raise exception 'New project payments require a server-calculated VAT snapshot';
  end if;
  select * into project_row from public.projects where project_id=new.project_id;
  if project_row.project_id is null then raise exception 'Project payment target is unavailable'; end if;
  select user_id into client_user from public.client_profiles where client_id=project_row.client_id;
  select final_price into agreed_base from public.contracts
    where (project_row.order_id is not null and order_id=project_row.order_id)
       or (project_row.application_id is not null and application_id=project_row.application_id)
    order by created_at desc limit 1;
  if new.payer_id is distinct from client_user
    or new.order_id is distinct from project_row.order_id
    or agreed_base is null
    or agreed_base is distinct from new.freelancer_service_vat_taxable_base
    or new.freelancer_service_vat_rate is distinct from 0.12
    or new.freelancer_service_vat_amount is distinct from round(agreed_base*0.12,2)
    or new.freelancer_service_vat_classification is distinct from 'default_vat'
    or new.freelancer_service_vat_document_id is not null
    or new.platform_service_fee is distinct from round(agreed_base*0.10,2)
    or new.amount is distinct from round(agreed_base+new.freelancer_service_vat_amount+new.platform_service_fee,2) then
    raise exception 'Payment total must match the signed base, fixed VAT, and transaction fee';
  end if;
  return new;
end; $$;
revoke all on function public.worksync_validate_payment_service_vat_snapshot() from public,anon,authenticated;

-- Enforce payment before submissions at the database boundary as well as the
-- application API, so direct authenticated RPC calls cannot bypass the gate.
create or replace function public.worksync_require_paid_project_for_submission()
returns trigger language plpgsql security definer set search_path='' as $$
declare project_budget numeric;
begin
  select budget into project_budget from public.projects where project_id=new.project_id;
  if project_budget is null or not exists (
    select 1 from public.payments pay
    where pay.project_id=new.project_id
      and pay.status::text='paid'
      and pay.provider='paymongo'
      and pay.provider_payment_id is not null
      and pay.transaction_reference is not null
      and pay.currency='PHP'
      and (
        (pay.freelancer_service_vat_taxable_base is null
          and pay.amount=project_budget)
        or (pay.freelancer_service_vat_taxable_base=project_budget
          and pay.freelancer_service_vat_rate in (0,0.12)
          and pay.freelancer_service_vat_amount=round(pay.freelancer_service_vat_taxable_base*pay.freelancer_service_vat_rate,2)
          and (pay.amount=round(pay.freelancer_service_vat_taxable_base+pay.freelancer_service_vat_amount,2)
            or pay.amount=round(pay.freelancer_service_vat_taxable_base+pay.freelancer_service_vat_amount+coalesce(pay.platform_service_fee,0),2)))
      )
  ) then
    raise exception 'The client must pay before work can be submitted' using errcode='42501';
  end if;
  return new;
end; $$;
revoke all on function public.worksync_require_paid_project_for_submission() from public,anon,authenticated;
drop trigger if exists worksync_require_paid_project_for_submission on public.project_submissions;
create trigger worksync_require_paid_project_for_submission
  before insert on public.project_submissions
  for each row execute function public.worksync_require_paid_project_for_submission();

-- Keep fee outside the freelancer payout gross. These routines are updated by
-- replacing only the established amount expressions and retaining their other
-- workflow checks.
do $$
declare fn text; old_check text;
begin
  fn := pg_get_functiondef('public.worksync_apply_payout_tax_snapshot()'::regprocedure);
  if position('new.amount is distinct from round(pay.freelancer_service_vat_taxable_base+pay.freelancer_service_vat_amount,2)' in fn)=0 then
    old_check := fn;
    fn := regexp_replace(fn,
      '(?i)if[[:space:]]+new\.amount[[:space:]]+is[[:space:]]+distinct[[:space:]]+from[[:space:]]+pay\.amount[[:space:]]+then[[:space:]]+raise[[:space:]]+exception[[:space:]]+''[^'']*'';[[:space:]]+end[[:space:]]+if;',
      'if new.amount is distinct from round(pay.freelancer_service_vat_taxable_base+pay.freelancer_service_vat_amount,2) then raise exception ''Full-project payout does not match agreed price and VAT''; end if;');
    if fn=old_check then raise exception 'Unexpected payout snapshot body; review before applying fee migration'; end if;
  end if;
  if position('new.gross_amount:=round(pay.freelancer_service_vat_taxable_base+pay.freelancer_service_vat_amount,2)' in fn)=0 then
    old_check := fn;
    fn := regexp_replace(fn,
      'new\.gross_amount[[:space:]]*:=[[:space:]]*pay\.amount;',
      'new.gross_amount:=round(pay.freelancer_service_vat_taxable_base+pay.freelancer_service_vat_amount,2);');
    if fn=old_check then raise exception 'Unexpected payout gross assignment; review before applying fee migration'; end if;
  end if;
  execute fn;

  fn := pg_get_functiondef('public.worksync_payment_matches_project(uuid,uuid,text)'::regprocedure);
  if position('coalesce(pay.platform_service_fee,0)' in fn)=0 then
    old_check := 'pay.amount=round(c.final_price+coalesce(pay.freelancer_service_vat_amount,0),2)';
    if position(old_check in fn)=0 then raise exception 'Unexpected payment matching body; review before applying fee migration'; end if;
    fn := replace(fn, old_check,
      '(pay.amount=round(c.final_price+coalesce(pay.freelancer_service_vat_amount,0),2) or pay.amount=round(c.final_price+coalesce(pay.freelancer_service_vat_amount,0)+coalesce(pay.platform_service_fee,0),2))');
  end if;
  execute fn;

  fn := pg_get_functiondef('public.worksync_claim_payout(uuid)'::regprocedure);
  if position('round(pay.freelancer_service_vat_taxable_base+pay.freelancer_service_vat_amount,2)' in fn)=0 then
    old_check := 'expected_gross:=pay.amount;';
    if position(old_check in fn)=0 then raise exception 'Unexpected payout claim body; review before applying fee migration'; end if;
    fn := replace(fn, old_check,
      'expected_gross:=case when pay.freelancer_service_vat_taxable_base is null then pay.amount else round(pay.freelancer_service_vat_taxable_base+pay.freelancer_service_vat_amount,2) end;');
  end if;
  if position('r.gross_amount is distinct from expected_gross and r.gross_amount is distinct from pay.amount' in fn)=0 then
    old_check := 'or r.gross_amount is distinct from expected_gross or not public.worksync_delivery_approved(p.project_id,null)';
    if position(old_check in fn)=0 then raise exception 'Unexpected payout gross comparison; review before applying fee migration'; end if;
    fn := replace(fn, old_check,
      'or (r.gross_amount is distinct from expected_gross and r.gross_amount is distinct from pay.amount) or not public.worksync_delivery_approved(p.project_id,null)');
  end if;
  execute fn;

  fn := pg_get_functiondef('public.worksync_claim_project_refund(uuid,text)'::regprocedure);
  if position('expected_total numeric;' in fn)=0 then
    old_check := 'declare pay public.payments; p public.projects; refund_amount numeric; refund_row public.project_refunds; overdue boolean;';
    if position(old_check in fn)=0 then raise exception 'Unexpected overdue refund body; review before applying fee migration'; end if;
    fn := replace(fn, old_check,
      'declare pay public.payments; p public.projects; refund_amount numeric; refund_row public.project_refunds; overdue boolean; expected_total numeric;');
  end if;
  if position('expected_total:=case when pay.freelancer_service_vat_taxable_base is null then pay.amount' in fn)=0 then
    old_check := 'if refund_amount+coalesce(';
    if position(old_check in fn)=0 then raise exception 'Unexpected overdue refund total check; review before applying fee migration'; end if;
    fn := replace(fn, old_check,
      'expected_total:=case when pay.freelancer_service_vat_taxable_base is null then pay.amount else round(pay.freelancer_service_vat_taxable_base+pay.freelancer_service_vat_amount,2) end;'||E'\n    if refund_amount+coalesce(');
  end if;
  if position('<>expected_total then return; end if;' in fn)=0 then
    old_check := '<>pay.amount then return; end if;';
    if position(old_check in fn)=0 then raise exception 'Unexpected overdue refund amount comparison; review before applying fee migration'; end if;
    fn := replace(fn, old_check, '<>expected_total then return; end if;');
  end if;
  execute fn;

  fn := pg_get_functiondef('public.worksync_settle_project(uuid,uuid,text)'::regprocedure);
  if position('case when pay.freelancer_service_vat_taxable_base is null then pay.amount' in fn)=0 then
    old_check := 'values(p_project,p_payment,recipient,p_mode,pay.amount,case when destination is null then ''awaiting_account'' else ''ready'' end,destination)';
    if position(old_check in fn)=0 then raise exception 'Unexpected project settlement body; review before applying fee migration'; end if;
    fn := replace(fn, old_check,
      'values(p_project,p_payment,recipient,p_mode,case when pay.freelancer_service_vat_taxable_base is null then pay.amount else round(pay.freelancer_service_vat_taxable_base+pay.freelancer_service_vat_amount,2) end,case when destination is null then ''awaiting_account'' else ''ready'' end,destination)');
  end if;
  execute fn;
end $$;

commit;
