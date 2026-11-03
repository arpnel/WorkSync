-- PREPARED, NOT APPLIED.
-- Restore the two original bookmark tables and their RPC contracts.
-- Data added/removed after the forward migration is split from the current
-- saved_listings rows; deleted bookmarks and their history cannot be recovered.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

lock table public.saved_listings in access exclusive mode;

drop function public.worksync_save_job(uuid);
drop function public.worksync_save_service(uuid);
drop function public.worksync_remove_job(uuid);
drop function public.worksync_remove_service(uuid);

drop trigger worksync_cleanup_service_saved_listings_before_user_delete on public."Users";
drop function public.worksync_cleanup_service_saved_listings_before_user_delete();
drop type public.saved_jobs;
drop type public.saved_services;

create table public.saved_jobs (
  user_id uuid not null,
  job_id uuid not null,
  created_at timestamptz not null default now(),
  constraint saved_jobs_pkey primary key (user_id, job_id),
  constraint saved_jobs_user_id_fkey
    foreign key (user_id) references public."Users"(user_id),
  constraint saved_jobs_job_id_fkey
    foreign key (job_id) references public.jobs(job_id)
);
alter table public.saved_jobs owner to postgres;
create policy saved_jobs_all
  on public.saved_jobs
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
alter table public.saved_jobs enable row level security;
grant select, insert, update, delete on table public.saved_jobs to authenticated;
grant all privileges on table public.saved_jobs to service_role;

create table public.saved_services (
  saved_id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  service_id uuid not null,
  created_at timestamptz default now(),
  constraint saved_services_pkey primary key (saved_id),
  constraint saved_services_service_id_fkey
    foreign key (service_id) references public.services(service_id),
  constraint saved_services_user_id_fkey
    foreign key (user_id) references public."Users"(user_id) on delete cascade,
  constraint saved_services_user_id_service_id_key unique (user_id, service_id)
);
alter table public.saved_services owner to postgres;
create index idx_saved_services_service_id on public.saved_services(service_id);
create policy saved_services_all
  on public.saved_services
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
alter table public.saved_services enable row level security;
grant all privileges on table public.saved_services to authenticated;
grant all privileges on table public.saved_services to service_role;

insert into public.saved_jobs(user_id, job_id, created_at)
select user_id, job_id, created_at
from public.saved_listings
where listing_type = 'job';

insert into public.saved_services(saved_id, user_id, service_id, created_at)
select saved_listing_id, user_id, service_id, created_at
from public.saved_listings
where listing_type = 'service';

do $$
begin
  if (select count(*) from public.saved_jobs)
     <> (select count(*) from public.saved_listings where listing_type = 'job') then
    raise exception 'Saved-job rollback row count verification failed';
  end if;
  if (select count(*) from public.saved_services)
     <> (select count(*) from public.saved_listings where listing_type = 'service') then
    raise exception 'Saved-service rollback row count verification failed';
  end if;
  if exists (
    select 1
    from public.saved_listings s
    left join public.saved_jobs j on j.user_id = s.user_id and j.job_id = s.job_id
    where s.listing_type = 'job'
      and (j.user_id is null or j.created_at is distinct from s.created_at)
  ) then
    raise exception 'Saved-job rollback data verification failed';
  end if;
  if exists (
    select 1
    from public.saved_listings s
    left join public.saved_services v on v.saved_id = s.saved_listing_id
    where s.listing_type = 'service'
      and (v.saved_id is null
        or v.user_id is distinct from s.user_id
        or v.service_id is distinct from s.service_id
        or v.created_at is distinct from s.created_at)
  ) then
    raise exception 'Saved-service rollback data verification failed';
  end if;
end;
$$;

drop table public.saved_listings;

create function public.worksync_save_job(p_job_id uuid)
returns public.saved_jobs
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare u uuid := auth.uid(); r public.saved_jobs;
begin
  if u is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.jobs where job_id = p_job_id) then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('saved_job:' || u::text || ':' || p_job_id::text, 0));
  insert into public.saved_jobs(user_id, job_id)
  values (u, p_job_id)
  on conflict (user_id, job_id) do nothing;
  select * into r from public.saved_jobs where user_id = u and job_id = p_job_id;
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
declare u uuid := auth.uid(); r public.saved_services;
begin
  if u is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.services where service_id = p_service_id) then
    raise exception 'Service not found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('saved_service:' || u::text || ':' || p_service_id::text, 0));
  insert into public.saved_services(user_id, service_id)
  select u, p_service_id
  where not exists (
    select 1 from public.saved_services where user_id = u and service_id = p_service_id
  );
  select * into r from public.saved_services where user_id = u and service_id = p_service_id;
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
  delete from public.saved_jobs where user_id = u and job_id = p_job_id;
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
  delete from public.saved_services where user_id = u and service_id = p_service_id;
  return p_service_id;
end;
$function$;
alter function public.worksync_remove_service(uuid) owner to postgres;
revoke all on function public.worksync_remove_service(uuid) from public, anon;
grant execute on function public.worksync_remove_service(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

-- Read-only post-rollback validation queries (run separately after rollback):
-- select (select count(*) from public.saved_jobs) as saved_jobs,
--        (select count(*) from public.saved_services) as saved_services;
-- select relrowsecurity from pg_class where oid='public.saved_jobs'::regclass;
-- select relrowsecurity from pg_class where oid='public.saved_services'::regclass;
-- select policyname, tablename, cmd, roles, qual, with_check from pg_policies
--  where schemaname='public' and tablename in ('saved_jobs','saved_services');
