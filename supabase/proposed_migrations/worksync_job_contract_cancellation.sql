-- PREPARED, NOT APPLIED.
-- Add mutual cancellation requests during accepted-job contract negotiation,
-- before there is an active project to use project_cancellations for.
begin;

create table if not exists public.job_contract_cancellation_requests (
  cancellation_id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications(application_id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 1 and 5000),
  status text not null default 'requested'
    check (status in ('requested', 'accepted', 'rejected')),
  response text,
  responded_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  responded_at timestamptz,
  check ((status = 'requested' and responded_by is null and responded_at is null)
      or (status in ('accepted', 'rejected') and responded_by is not null and responded_at is not null))
);

create index if not exists job_contract_cancellation_requests_application_created_idx
  on public.job_contract_cancellation_requests (application_id, created_at desc);
create unique index if not exists job_contract_cancellation_requests_one_pending_idx
  on public.job_contract_cancellation_requests (application_id)
  where status = 'requested';

alter table public.job_contract_cancellation_requests enable row level security;
revoke all on public.job_contract_cancellation_requests from public, anon, authenticated, service_role;

create or replace function public.worksync_get_job_contract_cancellation(p_application uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester uuid := auth.uid();
  client_user uuid;
  freelancer_user uuid;
  result_row public.job_contract_cancellation_requests;
begin
  if requester is null then raise exception 'Sign in required' using errcode = '42501'; end if;

  select cp.user_id, fp.user_id into client_user, freelancer_user
  from public.job_applications a
  join public.jobs j on j.job_id = a.job_id
  join public.client_profiles cp on cp.client_id = j.client_id
  join public.freelancer_profiles fp on fp.freelancer_id = a.freelancer_id
  where a.application_id = p_application and a.status::text in ('accepted', 'withdrawn');
  if client_user is null or freelancer_user is null
     or requester not in (client_user, freelancer_user) then
    raise exception 'Accepted application unavailable' using errcode = '42501';
  end if;

  select * into result_row
  from public.job_contract_cancellation_requests r
  where r.application_id = p_application
  order by r.created_at desc
  limit 1;
  if result_row.cancellation_id is null then return null; end if;

  return jsonb_build_object(
    'cancellationId', result_row.cancellation_id,
    'applicationId', result_row.application_id,
    'requestedBy', result_row.requested_by,
    'reason', result_row.reason,
    'status', result_row.status,
    'response', result_row.response,
    'createdAt', result_row.created_at,
    'respondedAt', result_row.responded_at
  );
end;
$$;

create or replace function public.worksync_request_job_contract_cancellation(
  p_application uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester uuid := auth.uid();
  client_user uuid;
  freelancer_user uuid;
begin
  if requester is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 5000 then
    raise exception 'Enter a cancellation reason of up to 5,000 characters' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_application::text, 0));
  select cp.user_id, fp.user_id into client_user, freelancer_user
  from public.job_applications a
  join public.jobs j on j.job_id = a.job_id
  join public.client_profiles cp on cp.client_id = j.client_id
  join public.freelancer_profiles fp on fp.freelancer_id = a.freelancer_id
  where a.application_id = p_application and a.status::text = 'accepted'
  for update of a;
  if client_user is null or freelancer_user is null
     or requester not in (client_user, freelancer_user) then
    raise exception 'Accepted application unavailable' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.contracts c
    where c.application_id = p_application and c.status::text = 'active'
  ) or exists (
    select 1 from public.projects p
    where p.application_id = p_application and p.status::text in ('active','in_progress','revision','completed')
  ) then
    raise exception 'Use the active project cancellation workflow for finalized work' using errcode = '22023';
  end if;

  insert into public.job_contract_cancellation_requests(application_id, requested_by, reason)
  values (p_application, requester, btrim(p_reason));
  return public.worksync_get_job_contract_cancellation(p_application);
exception when unique_violation then
  raise exception 'A cancellation request is already waiting for a response' using errcode = '23505';
end;
$$;

create or replace function public.worksync_respond_job_contract_cancellation(
  p_cancellation uuid,
  p_accept boolean,
  p_response text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester uuid := auth.uid();
  request_row public.job_contract_cancellation_requests;
  client_user uuid;
  freelancer_user uuid;
  related_order uuid;
begin
  if requester is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_accept is null then raise exception 'Choose whether to accept or decline' using errcode = '22023'; end if;
  if not p_accept and (p_response is null or length(btrim(p_response)) not between 1 and 5000) then
    raise exception 'Add a response before declining the cancellation request' using errcode = '22023';
  end if;

  select * into request_row
  from public.job_contract_cancellation_requests
  where cancellation_id = p_cancellation;
  if request_row.cancellation_id is null then
    raise exception 'Cancellation request not found' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_row.application_id::text, 0));
  select cp.user_id, fp.user_id into client_user, freelancer_user
  from public.job_applications a
  join public.jobs j on j.job_id = a.job_id
  join public.client_profiles cp on cp.client_id = j.client_id
  join public.freelancer_profiles fp on fp.freelancer_id = a.freelancer_id
  where a.application_id = request_row.application_id and a.status::text = 'accepted'
  for update of a;
  if client_user is null or freelancer_user is null
     or requester not in (client_user, freelancer_user) then
    raise exception 'Accepted application unavailable' using errcode = '42501';
  end if;

  select * into request_row
  from public.job_contract_cancellation_requests
  where cancellation_id = p_cancellation
  for update;
  if request_row.status <> 'requested' then
    raise exception 'This cancellation request already has a response' using errcode = '22023';
  end if;
  if requester = request_row.requested_by then
    raise exception 'Only the other participant can respond' using errcode = '42501';
  end if;

  if p_accept then
    if exists (
      select 1 from public.contracts c
      where c.application_id = request_row.application_id and c.status::text = 'active'
    ) or exists (
      select 1 from public.projects p
      where p.application_id = request_row.application_id and p.status::text in ('active','in_progress','revision','completed')
    ) then
      raise exception 'The contract has been finalized; use the active project cancellation workflow' using errcode = '22023';
    end if;
    update public.job_contract_cancellation_requests
    set status = 'accepted', response = nullif(btrim(p_response), ''),
        responded_by = requester, responded_at = pg_catalog.clock_timestamp()
    where cancellation_id = p_cancellation;

    select so.order_id into related_order
    from public.service_orders so
    where so.application_id = request_row.application_id
    order by so.created_at desc
    limit 1
    for update;
    if related_order is not null then
      perform public.worksync_cancel_order_internal(related_order);
    end if;
    update public.job_applications
    set status = 'withdrawn'::public.job_application_status
    where application_id = request_row.application_id and status::text = 'accepted';
  else
    update public.job_contract_cancellation_requests
    set status = 'rejected', response = btrim(p_response),
        responded_by = requester, responded_at = pg_catalog.clock_timestamp()
    where cancellation_id = p_cancellation;
  end if;

  return public.worksync_get_job_contract_cancellation(request_row.application_id);
end;
$$;

-- While a request is pending, stop all contract-creation writes at the DB
-- boundary. The existing worksync_job_agreement advisory lock serializes order
-- creation against request/response RPCs; these triggers cover subsequent
-- direct and RPC-backed agreement edits/signatures.
create or replace function public.worksync_guard_pending_job_contract_cancellation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_application uuid;
begin
  if tg_table_name = 'contracts' then
    target_application := nullif(to_jsonb(new)->>'application_id', '')::uuid;
    if target_application is null then
      select so.application_id into target_application
      from public.service_orders so
      where so.order_id = nullif(to_jsonb(new)->>'order_id', '')::uuid;
    end if;
  else
    target_application := nullif(to_jsonb(new)->>'application_id', '')::uuid;
  end if;

  if target_application is not null and exists (
    select 1 from public.job_contract_cancellation_requests r
    where r.application_id = target_application and r.status = 'requested'
  ) then
    raise exception 'Contract negotiation is paused while a cancellation request is pending' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function public.worksync_guard_pending_job_contract_cancellation() from public, anon, authenticated, service_role;

drop trigger if exists worksync_guard_pending_job_contract_cancellation on public.service_orders;
create trigger worksync_guard_pending_job_contract_cancellation
  before insert or update on public.service_orders
  for each row execute function public.worksync_guard_pending_job_contract_cancellation();
drop trigger if exists worksync_guard_pending_job_contract_cancellation on public.contracts;
create trigger worksync_guard_pending_job_contract_cancellation
  before insert or update on public.contracts
  for each row execute function public.worksync_guard_pending_job_contract_cancellation();
drop trigger if exists worksync_guard_pending_job_contract_cancellation on public.job_basic_terms_agreements;
create trigger worksync_guard_pending_job_contract_cancellation
  before insert or update on public.job_basic_terms_agreements
  for each row execute function public.worksync_guard_pending_job_contract_cancellation();

revoke all on function public.worksync_get_job_contract_cancellation(uuid) from public, anon;
revoke all on function public.worksync_request_job_contract_cancellation(uuid, text) from public, anon;
revoke all on function public.worksync_respond_job_contract_cancellation(uuid, boolean, text) from public, anon;
grant execute on function public.worksync_get_job_contract_cancellation(uuid) to authenticated;
grant execute on function public.worksync_request_job_contract_cancellation(uuid, text) to authenticated;
grant execute on function public.worksync_respond_job_contract_cancellation(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';
commit;
