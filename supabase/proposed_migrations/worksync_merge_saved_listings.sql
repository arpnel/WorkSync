-- PREPARED, NOT APPLIED.
-- Merge saved_jobs and saved_services into public.saved_listings.
-- Preserves bookmark rows, listing foreign keys, user ownership, and the distinct
-- user-deletion behavior of the two source tables. Does not use CASCADE.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

lock table public.saved_jobs, public.saved_services, public."Users" in access exclusive mode;

do $$
begin
  if to_regclass('public.saved_listings') is not null then
    raise exception 'public.saved_listings already exists; refusing to merge bookmarks';
  end if;
  -- Do not add another user-delete trigger without reviewing its ordering and
  -- interactions with existing lifecycle hooks on the shared Users table.
  if exists (
    select 1
    from pg_trigger
    where tgrelid = 'public."Users"'::regclass
      and not tgisinternal
      and (tgtype & 2) = 2
      and (tgtype & 8) = 8
  ) then
    raise exception 'A BEFORE DELETE trigger exists on public."Users"; review user-delete trigger interactions before merging bookmarks';
  end if;
end;
$$;

create table public.saved_listings (
  saved_listing_id uuid not null default gen_random_uuid(),
  listing_type text not null,
  user_id uuid not null,
  job_id uuid,
  service_id uuid,
  -- Job bookmarks require a timestamp; service bookmarks historically allow NULL.
  created_at timestamptz default now(),
  constraint saved_listings_pkey primary key (saved_listing_id),
  constraint saved_listings_kind_shape_check check (
    (listing_type = 'job'
      and job_id is not null
      and service_id is null
      and created_at is not null)
    or
    (listing_type = 'service'
      and job_id is null
      and service_id is not null)
  ),
  constraint saved_listings_user_id_fkey
    foreign key (user_id) references public."Users"(user_id),
  constraint saved_listings_job_id_fkey
    foreign key (job_id) references public.jobs(job_id),
  constraint saved_listings_service_id_fkey
    foreign key (service_id) references public.services(service_id),
  -- NULL values on the opposite listing kind remain distinct, so these
  -- constraints retain the two original per-user uniqueness rules.
  constraint saved_listings_user_job_key unique (user_id, job_id),
  constraint saved_listings_user_service_key unique (user_id, service_id)
);

alter table public.saved_listings owner to postgres;
create index idx_saved_listings_service_id on public.saved_listings(service_id);

alter table public.saved_listings enable row level security;
create policy saved_listings_all
  on public.saved_listings
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- CRUD is the shared app access required by saved_jobs. Do not carry forward
-- saved_services' broader TRUNCATE/TRIGGER/REFERENCES grants onto job bookmarks.
grant select, insert, update, delete on table public.saved_listings to authenticated;
grant all privileges on table public.saved_listings to service_role;

-- Preserve the old per-kind user deletion rules without relying on the order
-- PostgreSQL fires two competing FK action triggers. Service bookmarks are
-- removed in a BEFORE DELETE trigger; the NO ACTION owner FK then still blocks
-- deleting a user who has any job bookmark. A failed user delete rolls back
-- the service cleanup in the same statement.
create function public.worksync_cleanup_service_saved_listings_before_user_delete()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  delete from public.saved_listings
  where listing_type = 'service'
    and user_id = old.user_id;
  return old;
end;
$function$;
alter function public.worksync_cleanup_service_saved_listings_before_user_delete() owner to postgres;
revoke all on function public.worksync_cleanup_service_saved_listings_before_user_delete() from public, anon, authenticated, service_role;
create trigger worksync_cleanup_service_saved_listings_before_user_delete
  before delete on public."Users"
  for each row
  execute function public.worksync_cleanup_service_saved_listings_before_user_delete();

do $$
declare
  jobs_before bigint := (select count(*) from public.saved_jobs);
  services_before bigint := (select count(*) from public.saved_services);
begin
  insert into public.saved_listings
    (listing_type, user_id, job_id, created_at)
  select 'job', user_id, job_id, created_at
  from public.saved_jobs;

  insert into public.saved_listings
    (saved_listing_id, listing_type, user_id, service_id, created_at)
  select saved_id, 'service', user_id, service_id, created_at
  from public.saved_services;

  if (select count(*) from public.saved_listings where listing_type = 'job') <> jobs_before then
    raise exception 'Saved-job row count changed during migration';
  end if;
  if (select count(*) from public.saved_listings where listing_type = 'service') <> services_before then
    raise exception 'Saved-service row count changed during migration';
  end if;
  if exists (
    select 1
    from public.saved_jobs j
    left join public.saved_listings s
      on s.listing_type = 'job'
     and s.user_id = j.user_id
     and s.job_id = j.job_id
    where s.saved_listing_id is null
       or s.created_at is distinct from j.created_at
  ) then
    raise exception 'Saved-job data verification failed';
  end if;
  if exists (
    select 1
    from public.saved_services old
    left join public.saved_listings s
      on s.listing_type = 'service'
     and s.saved_listing_id = old.saved_id
    where s.saved_listing_id is null
       or s.user_id is distinct from old.user_id
       or s.service_id is distinct from old.service_id
       or s.created_at is distinct from old.created_at
  ) then
    raise exception 'Saved-service data verification failed';
  end if;
end;
$$;

-- Drop all four routines before dropping the source tables: two return the
-- source table row types, and all four write/delete source-table rows.
drop function public.worksync_save_job(uuid);
drop function public.worksync_save_service(uuid);
drop function public.worksync_remove_job(uuid);
drop function public.worksync_remove_service(uuid);

drop table public.saved_jobs;
drop table public.saved_services;

-- Reuse the legacy composite type names and exact field layouts for the save
-- RPC return values. The OIDs change and no FK relationship metadata remains.
create type public.saved_jobs as (
  user_id uuid,
  job_id uuid,
  created_at timestamptz
);
alter type public.saved_jobs owner to postgres;

create type public.saved_services as (
  saved_id uuid,
  user_id uuid,
  service_id uuid,
  created_at timestamptz
);
alter type public.saved_services owner to postgres;
grant usage on type public.saved_jobs to authenticated, service_role;
grant usage on type public.saved_services to authenticated, service_role;

create function public.worksync_save_job(p_job_id uuid)
returns public.saved_jobs
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  u uuid := auth.uid();
  r public.saved_jobs;
begin
  if u is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.jobs where job_id = p_job_id) then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('saved_job:' || u::text || ':' || p_job_id::text, 0));
  insert into public.saved_listings(user_id, listing_type, job_id)
  values (u, 'job', p_job_id)
  on conflict (user_id, job_id) do nothing;
  select row(user_id, job_id, created_at)::public.saved_jobs into r
  from public.saved_listings
  where listing_type = 'job' and user_id = u and job_id = p_job_id;
  return r;
end;
$function$;
alter function public.worksync_save_job(uuid) owner to postgres;
revoke all on function public.worksync_save_job(uuid) from public, anon;
grant execute on function public.worksync_save_job(uuid) to authenticated, service_role;

create function public.worksync_save_service(p_service_id uuid)
returns public.saved_services
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  u uuid := auth.uid();
  r public.saved_services;
begin
  if u is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.services where service_id = p_service_id) then
    raise exception 'Service not found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('saved_service:' || u::text || ':' || p_service_id::text, 0));
  insert into public.saved_listings(user_id, listing_type, service_id)
  select u, 'service', p_service_id
  where not exists (
    select 1 from public.saved_listings
    where listing_type = 'service' and user_id = u and service_id = p_service_id
  );
  select row(saved_listing_id, user_id, service_id, created_at)::public.saved_services into r
  from public.saved_listings
  where listing_type = 'service' and user_id = u and service_id = p_service_id;
  return r;
end;
$function$;
alter function public.worksync_save_service(uuid) owner to postgres;
revoke all on function public.worksync_save_service(uuid) from public, anon;
grant execute on function public.worksync_save_service(uuid) to authenticated, service_role;

create function public.worksync_remove_job(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare u uuid := auth.uid();
begin
  if u is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  delete from public.saved_listings
  where listing_type = 'job' and user_id = u and job_id = p_job_id;
  return p_job_id;
end;
$function$;
alter function public.worksync_remove_job(uuid) owner to postgres;
revoke all on function public.worksync_remove_job(uuid) from public, anon;
grant execute on function public.worksync_remove_job(uuid) to authenticated, service_role;

create function public.worksync_remove_service(p_service_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare u uuid := auth.uid();
begin
  if u is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  delete from public.saved_listings
  where listing_type = 'service' and user_id = u and service_id = p_service_id;
  return p_service_id;
end;
$function$;
alter function public.worksync_remove_service(uuid) owner to postgres;
revoke all on function public.worksync_remove_service(uuid) from public, anon;
grant execute on function public.worksync_remove_service(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

-- Read-only post-apply validation queries (run separately after applying):
-- select listing_type, count(*) from public.saved_listings group by listing_type order by listing_type;
-- select count(*) from public.saved_listings s left join public.jobs j on j.job_id=s.job_id where s.listing_type='job' and j.job_id is null;
-- select count(*) from public.saved_listings s left join public.services v on v.service_id=s.service_id where s.listing_type='service' and v.service_id is null;
-- select relrowsecurity from pg_class where oid='public.saved_listings'::regclass;
-- select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' and tablename='saved_listings';
-- select to_regclass('public.saved_jobs') is null and to_regclass('public.saved_services') is null as old_tables_removed;
