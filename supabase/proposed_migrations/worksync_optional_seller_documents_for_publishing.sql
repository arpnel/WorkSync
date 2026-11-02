-- PREPARED, NOT APPLIED.
-- Allow freelancers to create and publish services without seller documents.
-- Seller eligibility is enforced for withdrawal, not for client checkout.
-- Apply after worksync_manual_payout_withdrawals.sql.
begin;

-- The service-level insert/publish trigger and listing submission trigger
-- duplicated the old client-side publishing gate. Keep their functions for
-- rollback, but stop invoking them for service publishing.
drop trigger if exists worksync_guard_seller_service_publish on public.services;
drop trigger if exists worksync_guard_seller_listing_submission on public.listing_submissions;

-- Approved service listings remain subject to moderation and archive checks,
-- but seller-document eligibility no longer hides published listings.
create or replace function public.worksync_listing_visible(p_kind text,p_id uuid)
returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.listing_submissions s
    where s.listing_type=p_kind and s.listing_id=p_id
      and s.status='approved' and s.archived_at is null
  ) and not exists(
    select 1 from public.listing_moderation m
    where m.listing_type=p_kind and m.listing_id=p_id and m.hidden
  ) and (p_kind<>'service' or exists(
    select 1 from public.services s where s.service_id=p_id
  ));
$$;
revoke all on function public.worksync_listing_visible(text,uuid) from public;
grant execute on function public.worksync_listing_visible(text,uuid) to anon,authenticated;

-- Retain the seller-document gate for withdrawal requests and for the
-- ready-to-processing transition that hands a payout to the transfer worker.
create or replace function public.worksync_guard_payout_withdrawal_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.withdrawal_requested_at is not null
    and new.withdrawal_requested_at is null then
    raise exception 'A withdrawal request cannot be removed';
  end if;

  if old.withdrawal_requested_at is null
    and new.withdrawal_requested_at is not null
    and new.status <> 'ready' then
    raise exception 'A withdrawal can only be requested for a ready payout';
  end if;

  if (old.withdrawal_requested_at is null and new.withdrawal_requested_at is not null)
    or (old.status = 'ready' and new.status = 'processing') then
    if not coalesce(public.worksync_freelancer_seller_eligible(new.recipient_id), false) then
      raise exception 'Submit the required seller documents and receive approval before withdrawal';
    end if;
  end if;

  if old.status = 'ready'
    and new.status = 'processing'
    and old.withdrawal_requested_at is null then
    raise exception 'Freelancer withdrawal request is required before processing';
  end if;

  return new;
end;
$$;
revoke all on function public.worksync_guard_payout_withdrawal_request()
  from public, anon, authenticated, service_role;
drop trigger if exists worksync_guard_payout_withdrawal_request
  on public.project_payouts;
create trigger worksync_guard_payout_withdrawal_request
  before update of status, withdrawal_requested_at
  on public.project_payouts
  for each row
  execute function public.worksync_guard_payout_withdrawal_request();

notify pgrst,'reload schema';
commit;
