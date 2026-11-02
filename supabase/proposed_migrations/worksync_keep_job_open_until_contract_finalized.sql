-- PREPARED, NOT APPLIED.
-- Keep an accepted job visible while the contract is still being negotiated.
-- Close it only when worksync_activate_contract has verified and activated
-- the fully signed contract. Existing cancellation requests remain mutual:
-- the other participant must accept before a project is cancelled.
begin;

-- The active marketplace only allows job status changes through controlled
-- workflows. Permit this specific open -> closed change only while the
-- contract activation RPC holds its private transaction marker.
create or replace function public.worksync_guard_listing_content_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind text;
  target_listing_id uuid;
  review_status text;
begin
  if (to_jsonb(new) - 'is_archived' - 'updated_at')
      = (to_jsonb(old) - 'is_archived' - 'updated_at') then
    return new;
  end if;

  if tg_table_name = 'jobs' then
    kind := 'job';
    target_listing_id := new.job_id;
  else
    kind := 'service';
    target_listing_id := new.service_id;
  end if;

  if tg_table_name = 'jobs'
    and old.status is distinct from new.status
    and new.status::text = 'closed'
    and (to_jsonb(new) - 'status' - 'updated_at')
        = (to_jsonb(old) - 'status' - 'updated_at')
    and exists (
      select 1
      from public.worksync_workflow_write_context x
      join public.contracts c on c.contract_id = x.object_id
      join public.job_applications a on a.application_id = c.application_id
      where x.backend_pid = pg_catalog.pg_backend_pid()
        and x.transaction_id = pg_catalog.txid_current()
        and x.purpose = 'activation'
        and c.status::text = 'active'
        and a.job_id = new.job_id
    ) then
    return new;
  end if;

  select status into review_status
  from public.listing_submissions
  where listing_type = kind and listing_id = target_listing_id
  for update;

  if review_status is distinct from 'editing' then
    raise exception 'Submit approved or rejected listings through the review workflow; listings under review cannot be edited';
  end if;
  return new;
end;
$$;

-- Close job listings only at the authorized finalization transition. The
-- activation marker is inserted by worksync_activate_contract after both
-- signatures and all required agreement approvals have been checked.
create or replace function public.worksync_close_job_after_contract_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job_id uuid;
begin
  if old.status is not distinct from new.status
    or new.status::text <> 'active'
    or new.application_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.worksync_workflow_write_context x
    where x.backend_pid = pg_catalog.pg_backend_pid()
      and x.transaction_id = pg_catalog.txid_current()
      and x.object_id = new.contract_id
      and x.purpose = 'activation'
  ) then
    return new;
  end if;

  select a.job_id into target_job_id
  from public.job_applications a
  where a.application_id = new.application_id;

  if target_job_id is not null then
    update public.jobs
    set status = 'closed', updated_at = pg_catalog.now()
    where job_id = target_job_id and status = 'open';
  end if;
  return new;
end;
$$;

revoke all on function public.worksync_close_job_after_contract_activation()
  from public, anon, authenticated, service_role;
drop trigger if exists worksync_close_job_after_contract_activation
  on public.contracts;
create trigger worksync_close_job_after_contract_activation
  after update of status on public.contracts
  for each row
  execute function public.worksync_close_job_after_contract_activation();

notify pgrst, 'reload schema';
commit;
