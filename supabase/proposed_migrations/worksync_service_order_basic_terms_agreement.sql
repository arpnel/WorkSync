-- PREPARED, NOT APPLIED.
-- Save and track both parties' approval of the basic terms for standard
-- service-order contracts that do not have a job application ID.

begin;

create table if not exists public.service_order_basic_terms_agreements (
  order_id uuid primary key
    references public.service_orders(order_id) on delete cascade,
  terms jsonb not null,
  previous_terms jsonb,
  changed_fields text[] not null default '{}',
  changed_by text check (changed_by in ('client', 'freelancer')),
  client_agreed_at timestamptz,
  freelancer_agreed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.service_order_basic_terms_agreements enable row level security;
revoke all on public.service_order_basic_terms_agreements from public, anon, authenticated, service_role;

create or replace function public.worksync_get_service_order_basic_terms_agreement(
  p_order uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user uuid := auth.uid();
  client_user uuid;
  freelancer_user uuid;
  agreement_row public.service_order_basic_terms_agreements;
begin
  if requesting_user is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  select cp.user_id, fp.user_id
    into client_user, freelancer_user
  from public.service_orders as o
  join public.client_profiles as cp on cp.client_id = o.client_id
  join public.freelancer_profiles as fp on fp.freelancer_id = o.freelancer_id
  where o.order_id = p_order;

  if requesting_user is distinct from client_user
     and requesting_user is distinct from freelancer_user then
    raise exception 'Service order unavailable' using errcode = '42501';
  end if;

  select * into agreement_row
  from public.service_order_basic_terms_agreements
  where order_id = p_order;

  return jsonb_build_object(
    'terms', agreement_row.terms,
    'previousTerms', agreement_row.previous_terms,
    'changedFields', to_jsonb(agreement_row.changed_fields),
    'changedBy', agreement_row.changed_by,
    'clientAgreed', agreement_row.client_agreed_at is not null,
    'freelancerAgreed', agreement_row.freelancer_agreed_at is not null
  );
end;
$$;

create or replace function public.worksync_agree_service_order_basic_terms(
  p_order uuid,
  p_terms jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user uuid := auth.uid();
  order_status text;
  contract_status text;
  client_user uuid;
  freelancer_user uuid;
  current_party text;
  agreement_row public.service_order_basic_terms_agreements;
  requested_budget numeric;
  requested_revisions integer;
  requested_start date;
  requested_deadline date;
  changed_field_names text[];
begin
  if requesting_user is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_terms) is distinct from 'object'
     or jsonb_typeof(p_terms->'projectTitle') is distinct from 'string'
     or jsonb_typeof(p_terms->'description') is distinct from 'string'
     or jsonb_typeof(p_terms->'budget') is distinct from 'number'
     or jsonb_typeof(p_terms->'revisionsCount') is distinct from 'number'
     or jsonb_typeof(p_terms->'startDate') is distinct from 'string'
     or jsonb_typeof(p_terms->'deadline') is distinct from 'string'
     or length(btrim(p_terms->>'projectTitle')) = 0
     or length(btrim(p_terms->>'description')) = 0
     or length(p_terms->>'projectTitle') > 200
     or length(p_terms->>'description') > 20000 then
    raise exception 'Invalid basic terms' using errcode = '22023';
  end if;

  begin
    requested_budget := (p_terms->>'budget')::numeric;
    requested_revisions := (p_terms->>'revisionsCount')::integer;
    requested_start := (p_terms->>'startDate')::date;
    requested_deadline := (p_terms->>'deadline')::date;
  exception when others then
    raise exception 'Invalid basic terms' using errcode = '22023';
  end;

  if requested_budget <= 0
     or requested_revisions < 0
     or (p_terms->>'revisionsCount')::numeric <> requested_revisions
     or requested_deadline < requested_start then
    raise exception 'Invalid basic terms' using errcode = '22023';
  end if;

  -- Match the contract-first lock order used by order cancellation routines.
  select c.status::text into contract_status
  from public.contracts as c
  where c.order_id = p_order
  for update;

  select o.status::text, cp.user_id, fp.user_id
    into order_status, client_user, freelancer_user
  from public.service_orders as o
  join public.client_profiles as cp on cp.client_id = o.client_id
  join public.freelancer_profiles as fp on fp.freelancer_id = o.freelancer_id
  where o.order_id = p_order
  for update of o;

  if order_status not in ('pending', 'accepted', 'converted')
     or contract_status is null
     or contract_status in ('active', 'completed', 'cancelled', 'rejected')
     or requesting_user is distinct from client_user
        and requesting_user is distinct from freelancer_user then
    raise exception 'Service order unavailable for basic-term approval' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.contracts as c
    where c.order_id = p_order
      and (c.client_signed_at is not null or c.freelancer_signed_at is not null)
  ) then
    raise exception 'Basic terms cannot be changed after final contract signing begins' using errcode = '55000';
  end if;

  current_party := case when requesting_user = client_user then 'client' else 'freelancer' end;

  select * into agreement_row
  from public.service_order_basic_terms_agreements
  where order_id = p_order
  for update;

  if agreement_row.order_id is null then
    insert into public.service_order_basic_terms_agreements (
      order_id, terms, client_agreed_at, freelancer_agreed_at
    ) values (
      p_order,
      p_terms,
      case when current_party = 'client' then pg_catalog.clock_timestamp() end,
      case when current_party = 'freelancer' then pg_catalog.clock_timestamp() end
    );
  elsif agreement_row.terms is distinct from p_terms then
    changed_field_names := array_remove(array[
      case when agreement_row.terms->'projectTitle' is distinct from p_terms->'projectTitle' then 'projectTitle' end,
      case when agreement_row.terms->'description' is distinct from p_terms->'description' then 'description' end,
      case when agreement_row.terms->'budget' is distinct from p_terms->'budget' then 'budget' end,
      case when agreement_row.terms->'revisionsCount' is distinct from p_terms->'revisionsCount' then 'revisionsCount' end,
      case when agreement_row.terms->'startDate' is distinct from p_terms->'startDate' then 'startDate' end,
      case when agreement_row.terms->'deadline' is distinct from p_terms->'deadline' then 'deadline' end
    ], null);
    update public.service_order_basic_terms_agreements
    set terms = p_terms,
        previous_terms = agreement_row.terms,
        changed_fields = changed_field_names,
        changed_by = current_party,
        client_agreed_at = null,
        freelancer_agreed_at = null,
        updated_at = pg_catalog.clock_timestamp()
    where order_id = p_order;
  else
    update public.service_order_basic_terms_agreements
    set client_agreed_at = case
          when current_party = 'client' then coalesce(client_agreed_at, pg_catalog.clock_timestamp())
          else client_agreed_at end,
        freelancer_agreed_at = case
          when current_party = 'freelancer' then coalesce(freelancer_agreed_at, pg_catalog.clock_timestamp())
          else freelancer_agreed_at end,
        updated_at = pg_catalog.clock_timestamp()
    where order_id = p_order;
  end if;

  return public.worksync_get_service_order_basic_terms_agreement(p_order);
end;
$$;

revoke all on function public.worksync_get_service_order_basic_terms_agreement(uuid) from public, anon;
revoke all on function public.worksync_agree_service_order_basic_terms(uuid, jsonb) from public, anon;
grant execute on function public.worksync_get_service_order_basic_terms_agreement(uuid) to authenticated;
grant execute on function public.worksync_agree_service_order_basic_terms(uuid, jsonb) to authenticated;

commit;
