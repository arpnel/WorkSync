-- Store each participant's private, resumable contract-creation draft and
-- make final acceptance apply to the complete current contract version.

create table public.contract_creation_drafts (
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_key text not null check (length(draft_key) between 1 and 200),
  draft jsonb not null check (
    jsonb_typeof(draft) = 'object'
    and octet_length(draft::text) <= 1048576
  ),
  updated_at timestamptz not null default now(),
  primary key (user_id, draft_key)
);

alter table public.contract_creation_drafts enable row level security;
revoke all on public.contract_creation_drafts from public, anon, service_role;
grant select, insert, update, delete on public.contract_creation_drafts to authenticated;

create policy contract_creation_drafts_owner_select
  on public.contract_creation_drafts for select to authenticated
  using (user_id = (select auth.uid()));
create policy contract_creation_drafts_owner_insert
  on public.contract_creation_drafts for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy contract_creation_drafts_owner_update
  on public.contract_creation_drafts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy contract_creation_drafts_owner_delete
  on public.contract_creation_drafts for delete to authenticated
  using (user_id = (select auth.uid()));

-- Each participant's single signature confirms the whole current contract
-- version. Older per-item approval records remain available as history.
create or replace function public.worksync_guard_contract(p_contract_id uuid)
returns void
language plpgsql
security definer
set search_path = 'pg_catalog','public','auth'
as $$
declare
  c public.contracts;
begin
  select * into c
  from public.contracts
  where contract_id = p_contract_id
  for update;

  if c.contract_id is null then
    raise exception 'Contract not found' using errcode = 'P0002';
  end if;

  if auth.uid() is null or public.worksync_contract_party(p_contract_id) is null then
    raise exception 'Only a contract participant may activate this contract' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.service_orders so
    join public.client_profiles cp on cp.client_id = so.client_id
    where so.order_id = c.order_id
  ) and not exists (
    select 1
    from public.job_applications a
    join public.jobs j on j.job_id = a.job_id
    join public.client_profiles cp on cp.client_id = j.client_id
    where a.application_id = c.application_id
  ) then
    raise exception 'Contract client is missing';
  end if;

  if not exists (
    select 1
    from public.service_orders so
    join public.freelancer_profiles fp on fp.freelancer_id = so.freelancer_id
    where so.order_id = c.order_id
  ) and not exists (
    select 1
    from public.job_applications a
    join public.freelancer_profiles fp on fp.freelancer_id = a.freelancer_id
    where a.application_id = c.application_id
  ) then
    raise exception 'Contract freelancer is missing';
  end if;

  if c.client_signed_at is null or c.freelancer_signed_at is null
     or c.client_signed_version is distinct from c.current_version
     or c.freelancer_signed_version is distinct from c.current_version then
    raise exception 'Both parties must accept the current contract version' using errcode = 'P0007';
  end if;
end;
$$;

revoke all on function public.worksync_guard_contract(uuid)
  from public, anon, authenticated, service_role;
