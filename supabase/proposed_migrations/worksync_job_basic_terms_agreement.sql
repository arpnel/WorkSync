-- Require both application participants to approve the same basic terms before
-- either participant can continue to the work planner. Full contract signatures
-- remain separate and continue to control project activation.

create table if not exists public.job_basic_terms_agreements (
  application_id uuid primary key
    references public.job_applications(application_id) on delete cascade,
  terms jsonb not null,
  client_agreed_at timestamptz,
  freelancer_agreed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.job_basic_terms_agreements enable row level security;
revoke all on public.job_basic_terms_agreements from public, anon, authenticated, service_role;

create or replace function public.worksync_get_job_basic_terms_agreement(
  p_application uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user uuid := auth.uid();
  application_status text;
  client_user uuid;
  freelancer_user uuid;
  agreement_row public.job_basic_terms_agreements;
begin
  if requesting_user is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  select a.status::text, cp.user_id, fp.user_id
    into application_status, client_user, freelancer_user
  from public.job_applications as a
  join public.jobs as j on j.job_id = a.job_id
  join public.client_profiles as cp on cp.client_id = j.client_id
  join public.freelancer_profiles as fp on fp.freelancer_id = a.freelancer_id
  where a.application_id = p_application;

  if application_status is distinct from 'accepted'
     or requesting_user not in (client_user, freelancer_user) then
    raise exception 'Application unavailable' using errcode = '42501';
  end if;

  select * into agreement_row
  from public.job_basic_terms_agreements
  where application_id = p_application;

  return jsonb_build_object(
    'terms', agreement_row.terms,
    'clientAgreed', agreement_row.client_agreed_at is not null,
    'freelancerAgreed', agreement_row.freelancer_agreed_at is not null
  );
end;
$$;

create or replace function public.worksync_agree_job_basic_terms(
  p_application uuid,
  p_terms jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user uuid := auth.uid();
  application_status text;
  client_user uuid;
  freelancer_user uuid;
  current_party text;
  agreement_row public.job_basic_terms_agreements;
  requested_budget numeric;
  requested_revisions integer;
  requested_start date;
  requested_deadline date;
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

  select a.status::text, cp.user_id, fp.user_id
    into application_status, client_user, freelancer_user
  from public.job_applications as a
  join public.jobs as j on j.job_id = a.job_id
  join public.client_profiles as cp on cp.client_id = j.client_id
  join public.freelancer_profiles as fp on fp.freelancer_id = a.freelancer_id
  where a.application_id = p_application;

  if application_status is distinct from 'accepted'
     or requesting_user not in (client_user, freelancer_user) then
    raise exception 'Application unavailable' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_application::text, 0));

  select a.status::text, cp.user_id, fp.user_id
    into application_status, client_user, freelancer_user
  from public.job_applications as a
  join public.jobs as j on j.job_id = a.job_id
  join public.client_profiles as cp on cp.client_id = j.client_id
  join public.freelancer_profiles as fp on fp.freelancer_id = a.freelancer_id
  where a.application_id = p_application
  for update of a;

  if application_status is distinct from 'accepted'
     or requesting_user not in (client_user, freelancer_user) then
    raise exception 'Application unavailable' using errcode = '42501';
  end if;
  current_party := case when requesting_user = client_user then 'client' else 'freelancer' end;

  select * into agreement_row
  from public.job_basic_terms_agreements
  where application_id = p_application
  for update;

  if agreement_row.application_id is null then
    insert into public.job_basic_terms_agreements (
      application_id, terms, client_agreed_at, freelancer_agreed_at
    ) values (
      p_application,
      p_terms,
      case when current_party = 'client' then pg_catalog.clock_timestamp() end,
      case when current_party = 'freelancer' then pg_catalog.clock_timestamp() end
    );
  elsif agreement_row.terms is distinct from p_terms then
    update public.job_basic_terms_agreements
    set terms = p_terms,
        client_agreed_at = case when current_party = 'client' then pg_catalog.clock_timestamp() end,
        freelancer_agreed_at = case when current_party = 'freelancer' then pg_catalog.clock_timestamp() end,
        updated_at = pg_catalog.clock_timestamp()
    where application_id = p_application;
  else
    update public.job_basic_terms_agreements
    set client_agreed_at = case
          when current_party = 'client' then coalesce(client_agreed_at, pg_catalog.clock_timestamp())
          else client_agreed_at end,
        freelancer_agreed_at = case
          when current_party = 'freelancer' then coalesce(freelancer_agreed_at, pg_catalog.clock_timestamp())
          else freelancer_agreed_at end,
        updated_at = pg_catalog.clock_timestamp()
    where application_id = p_application;
  end if;

  return public.worksync_get_job_basic_terms_agreement(p_application);
end;
$$;

revoke all on function public.worksync_get_job_basic_terms_agreement(uuid) from public, anon;
revoke all on function public.worksync_agree_job_basic_terms(uuid, jsonb) from public, anon;
grant execute on function public.worksync_get_job_basic_terms_agreement(uuid) to authenticated;
grant execute on function public.worksync_agree_job_basic_terms(uuid, jsonb) to authenticated;
