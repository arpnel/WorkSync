-- PREPARED ONLY: five Free applicant screenings per rolling six months.
-- Apply after 202610250001_subscription_trials_and_manual_billing.sql and applicant screening migrations.
begin;

do $$
begin
  if to_regclass('public.user_subscriptions') is null
     or to_regclass('public.screening_results') is null
     or to_regclass('public.job_applications') is null then
    raise exception 'Apply the subscription and applicant screening migrations first';
  end if;
end;
$$;

create table if not exists public.applicant_screening_reservations (
  reservation_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public."Users"(user_id) on delete cascade,
  application_id uuid not null references public.job_applications(application_id) on delete cascade,
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  released_at timestamptz
);
create unique index if not exists applicant_screening_one_active_reservation
  on public.applicant_screening_reservations(owner_user_id, application_id)
  where released_at is null;
create index if not exists applicant_screening_reservations_quota_lookup
  on public.applicant_screening_reservations(owner_user_id, claimed_at)
  where released_at is null;
alter table public.applicant_screening_reservations enable row level security;
revoke all on public.applicant_screening_reservations from anon, authenticated;
grant select, insert, update on public.applicant_screening_reservations to service_role;

-- Count prior successful screenings as usage when the quota is first enabled.
insert into public.applicant_screening_reservations(
  owner_user_id,application_id,claimed_at,completed_at,released_at
)
select cp.user_id,sr.application_id,sr.screened_at,sr.screened_at,sr.screened_at
from public.screening_results sr
join public.job_applications a on a.application_id=sr.application_id
join public.jobs j on j.job_id=a.job_id
join public.client_profiles cp on cp.client_id=j.client_id
where sr.screened_at is not null
  and not exists (
    select 1 from public.applicant_screening_reservations existing
    where existing.owner_user_id=cp.user_id
      and existing.application_id=sr.application_id
      and existing.completed_at=sr.screened_at
  );

create or replace function public.worksync_claim_applicant_screening(
  p_actor uuid, p_application uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid; plan text; used integer; reservation uuid; reset_at timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  select cp.user_id into owner
  from public.job_applications a
  join public.jobs j on j.job_id=a.job_id
  join public.client_profiles cp on cp.client_id=j.client_id
  where a.application_id=p_application;
  if owner is null or owner is distinct from p_actor then
    raise exception 'Applicant screening owner mismatch' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
  update public.applicant_screening_reservations
    set completed_at=coalesce(completed_at,(
          select max(sr.screened_at)
          from public.screening_results sr
          where sr.application_id=applicant_screening_reservations.application_id
            and sr.screened_at>=applicant_screening_reservations.claimed_at
        )), released_at=now()
    where owner_user_id=owner and released_at is null
      and claimed_at<now()-interval '2 hours';
  plan := public.worksync_effective_subscription_plan(owner);
  if plan='pro' then return jsonb_build_object('allowed',true,'plan',plan); end if;

  select reservation_id into reservation
  from public.applicant_screening_reservations
  where owner_user_id=owner and application_id=p_application and released_at is null;
  if reservation is not null then
    return jsonb_build_object('allowed',false,'inProgress',true);
  end if;

  select count(*) into used from (
    select r.reservation_id
    from public.applicant_screening_reservations r
    where r.owner_user_id=owner and r.released_at is null
      and r.claimed_at>=now()-interval '6 months'
      and r.claimed_at>=now()-interval '2 hours'
    union all
    select r.reservation_id
    from public.applicant_screening_reservations r
    where r.owner_user_id=owner and r.completed_at>=now()-interval '6 months'
  ) recent_usage;
  if used>=5 then
    select min(deadline) into reset_at from (
      select r.completed_at+interval '6 months' as deadline
      from public.applicant_screening_reservations r
      where r.owner_user_id=owner and r.completed_at>=now()-interval '6 months'
      union all
      select r.claimed_at+interval '2 hours'
      from public.applicant_screening_reservations r
      where r.owner_user_id=owner and r.released_at is null
        and r.claimed_at>=now()-interval '2 hours'
    ) deadlines;
    return jsonb_build_object(
      'allowed',false,'plan','free','used',used,'limit',5,'resetAt',reset_at
    );
  end if;

  insert into public.applicant_screening_reservations(owner_user_id,application_id)
  values(owner,p_application)
  on conflict(owner_user_id,application_id) where released_at is null do nothing
  returning reservation_id into reservation;
  if reservation is null then
    select reservation_id into reservation from public.applicant_screening_reservations
    where owner_user_id=owner and application_id=p_application and released_at is null;
  end if;
  return jsonb_build_object(
    'allowed',true,'plan','free','used',used+1,'limit',5,
    'resetAt',now()+interval '6 months','reservationId',reservation
  );
end; $$;

create or replace function public.worksync_release_applicant_screening(
  p_reservation uuid, p_completed boolean
)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  update public.applicant_screening_reservations
  set completed_at=case when p_completed then coalesce(completed_at,now()) else completed_at end,
      released_at=now()
  where reservation_id=p_reservation and released_at is null;
end; $$;

revoke all on function public.worksync_claim_applicant_screening(uuid,uuid) from public, anon, authenticated;
revoke all on function public.worksync_release_applicant_screening(uuid,boolean) from public, anon, authenticated;
grant execute on function public.worksync_claim_applicant_screening(uuid,uuid) to service_role;
grant execute on function public.worksync_release_applicant_screening(uuid,boolean) to service_role;

commit;
