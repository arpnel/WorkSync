-- PREPARED, NOT APPLIED.
-- Require an explicit freelancer withdrawal request before a payout can enter
-- processing and be submitted to the transfer provider.
begin;

alter table public.project_payouts
  add column if not exists withdrawal_requested_at timestamptz;

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

commit;
