-- PREPARED, NOT APPLIED. Marketplace withholding is disabled in this migration pending legal confirmation.
-- A seller declaration determines any confirmed threshold exemption; missing paperwork does not enable withholding.
begin;

alter table public.freelancer_tax_profiles
  alter column marketplace_withholding_applicable set default false;

create or replace function public.worksync_apply_payout_tax_snapshot() returns trigger
language plpgsql security definer set search_path='' as $$
declare applicable boolean:=false; exemption text:='not_applicable'; latest_status text; latest_threshold_status text; prior_gross numeric:=0; current_year integer:=extract(year from now() at time zone 'Asia/Manila')::integer;
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
    new.withholding_rule:='not configured as applicable'; new.withholding_date:=null;
    new.withholding_exemption_status:='not_applicable'; new.amount:=new.gross_amount;
  end if;
  if new.amount<=0 then raise exception 'Tax deductions exceed freelancer payout'; end if;
  return new;
end; $$;

notify pgrst,'reload schema';
commit;
