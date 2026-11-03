-- Disposable local PostgreSQL integration test. First create an empty database
-- named worksync_saved_listings_test and mark it:
--   COMMENT ON DATABASE worksync_saved_listings_test IS 'WORKSYNC_SAVED_LISTINGS_TEST_ONLY';
-- Then run from repo root:
--   psql -X -v ON_ERROR_STOP=1 -v allow_saved_listings_test=on -d worksync_saved_listings_test -f supabase/proposed_migrations/tests/worksync_merge_saved_listings.test.sql
-- This script creates objects and roles; use only the marked local test database.
\set ON_ERROR_STOP on
\if :{?allow_saved_listings_test}
\else
  \echo 'Refusing to run without -v allow_saved_listings_test=on'
  \quit 3
\endif

do $$ begin
  if current_database() <> 'worksync_saved_listings_test'
     or coalesce((select shobj_description(oid,'pg_database') from pg_database
                  where datname=current_database()),'') <> 'WORKSYNC_SAVED_LISTINGS_TEST_ONLY'
     or (inet_server_addr() is not null and inet_server_addr() not in ('127.0.0.1'::inet,'::1'::inet))
     or not (select rolsuper from pg_roles where rolname=current_user)
     or not exists(select 1 from pg_roles where rolname='postgres')
     or current_setting('server_version_num')::integer < 130000
     or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and c.relkind in ('r','p','v','m','S','f')) then
    raise exception 'Refusing: expected marked, empty, local superuser test database';
  end if;
  raise notice 'PostgreSQL version under test: %', current_setting('server_version');
end $$;

do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then execute 'create role anon nologin'; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then execute 'create role authenticated nologin'; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then execute 'create role service_role nologin'; end if;
end $$;
create schema if not exists auth;
do $$ begin
 if to_regprocedure('auth.uid()') is null then
   execute $sql$create function auth.uid() returns uuid language sql stable as
     'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid'$sql$;
 end if;
end $$;
grant usage on schema auth to authenticated,service_role;
grant execute on function auth.uid() to authenticated,service_role;

create table public."Users"(user_id uuid primary key);
create table public.jobs(job_id uuid primary key);
create table public.services(service_id uuid primary key);
create table public.saved_jobs(
 user_id uuid not null references public."Users"(user_id),
 job_id uuid not null references public.jobs(job_id),
 created_at timestamptz not null default now(), primary key(user_id,job_id));
create table public.saved_services(
 saved_id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public."Users"(user_id) on delete cascade,
 service_id uuid not null references public.services(service_id),
 created_at timestamptz default now(), unique(user_id,service_id));
create index idx_saved_services_service_id on public.saved_services(service_id);
alter table public.saved_jobs enable row level security;
alter table public.saved_services enable row level security;
create policy saved_jobs_all on public.saved_jobs for all to authenticated
 using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy saved_services_all on public.saved_services for all to authenticated
 using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on public.saved_jobs,public.saved_services to authenticated;
grant all on public.saved_jobs,public.saved_services to service_role;

-- Exact legacy signatures are present so dependency-order drops are exercised.
create function public.worksync_save_job(uuid) returns public.saved_jobs language sql
 as $$ select null::public.saved_jobs $$;
create function public.worksync_save_service(uuid) returns public.saved_services language sql
 as $$ select null::public.saved_services $$;
create function public.worksync_remove_job(uuid) returns uuid language sql as $$ select $1 $$;
create function public.worksync_remove_service(uuid) returns uuid language sql as $$ select $1 $$;
insert into public."Users" values
 ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003');
insert into public.jobs values('10000000-0000-0000-0000-000000000001');
insert into public.services values('20000000-0000-0000-0000-000000000001');
insert into public.saved_jobs(user_id,job_id,created_at) values
 ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2025-01-02 03:04:05+00');
insert into public.saved_services(saved_id,user_id,service_id,created_at) values
 ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000001','2025-02-03 04:05:06+00');

\ir ../worksync_merge_saved_listings.sql

do $$ begin
 if (select count(*) from public.saved_listings)<>2
 or not exists(select 1 from public.saved_listings where listing_type='job'
   and user_id='00000000-0000-0000-0000-000000000001'
   and job_id='10000000-0000-0000-0000-000000000001' and created_at='2025-01-02 03:04:05+00')
 or not exists(select 1 from public.saved_listings where listing_type='service'
   and saved_listing_id='30000000-0000-0000-0000-000000000001'
   and user_id='00000000-0000-0000-0000-000000000002'
   and service_id='20000000-0000-0000-0000-000000000001' and created_at='2025-02-03 04:05:06+00') then
   raise exception 'Forward migration failed to preserve rows/IDs/timestamps'; end if;
end $$;

set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
set role authenticated;
do $$ declare j jsonb; s jsonb;
begin
 j:=to_jsonb(public.worksync_save_job('10000000-0000-0000-0000-000000000001'));
 if j->>'user_id'<>auth.uid()::text or j->>'job_id'<>'10000000-0000-0000-0000-000000000001'
   or jsonb_typeof(j->'created_at')<>'string'
   or (select count(*) from public.saved_listings where listing_type='job' and user_id=auth.uid()
       and job_id='10000000-0000-0000-0000-000000000001')<>1 then
   raise exception 'Job RPC JSON/duplicate save mismatch: %',j; end if;
 s:=to_jsonb(public.worksync_save_service('20000000-0000-0000-0000-000000000001'));
 if s->>'user_id'<>auth.uid()::text or s->>'saved_id' is null
   or s->>'service_id'<>'20000000-0000-0000-0000-000000000001'
   or jsonb_typeof(s->'created_at')<>'string' then raise exception 'Service RPC JSON mismatch: %',s; end if;
 -- Exercise the exact per-kind conflict targets used by listingActions.ts.
 insert into public.saved_listings(user_id,listing_type,job_id)
   values(auth.uid(),'job','10000000-0000-0000-0000-000000000001')
   on conflict(user_id,job_id) do nothing;
 insert into public.saved_listings(user_id,listing_type,service_id)
   values(auth.uid(),'service','20000000-0000-0000-0000-000000000001')
   on conflict(user_id,service_id) do nothing;
 if (select count(*) from public.saved_listings where user_id=auth.uid())<>2
 then raise exception 'Direct save conflict target allowed duplicate bookmark'; end if;
 if public.worksync_remove_job('10000000-0000-0000-0000-000000000001')
      <>'10000000-0000-0000-0000-000000000001'::uuid
   or exists(select 1 from public.saved_listings where listing_type='job' and user_id=auth.uid())
 then raise exception 'Job remove RPC failed'; end if;
 if public.worksync_remove_service('20000000-0000-0000-0000-000000000001')
      <>'20000000-0000-0000-0000-000000000001'::uuid
   or exists(select 1 from public.saved_listings where listing_type='service' and user_id=auth.uid())
 then raise exception 'Service remove RPC failed'; end if;
 if exists(select 1 from public.saved_listings where user_id='00000000-0000-0000-0000-000000000002')
 then raise exception 'RLS exposed a different owner row'; end if;
 begin
   insert into public.saved_listings(user_id,listing_type,job_id)
     values('00000000-0000-0000-0000-000000000002','job','10000000-0000-0000-0000-000000000001');
   raise exception 'RLS accepted cross-owner insert';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Verify failed user deletion rolls its service cleanup back, job bookmarks
-- still block deletion, and service-only user deletion removes the bookmark.
insert into public.saved_listings(user_id,listing_type,job_id) values
 ('00000000-0000-0000-0000-000000000001','job','10000000-0000-0000-0000-000000000001');
insert into public.saved_listings(user_id,listing_type,service_id) values
 ('00000000-0000-0000-0000-000000000001','service','20000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000002','service','20000000-0000-0000-0000-000000000001');
do $$ begin
 begin delete from public."Users" where user_id='00000000-0000-0000-0000-000000000001';
   raise exception 'User with job bookmark was deleted';
 exception when foreign_key_violation then null; end;
 if not exists(select 1 from public.saved_listings where user_id='00000000-0000-0000-0000-000000000001'
       and listing_type='service') then raise exception 'Failed deletion did not roll back cleanup'; end if;
 delete from public."Users" where user_id='00000000-0000-0000-0000-000000000003';
 delete from public."Users" where user_id='00000000-0000-0000-0000-000000000002';
 if exists(select 1 from public.saved_listings where user_id='00000000-0000-0000-0000-000000000002')
 then raise exception 'Service-only user deletion failed'; end if;
end $$;

\ir ../worksync_merge_saved_listings.rollback.sql

do $$ declare j jsonb; s jsonb;
begin
 if (select count(*) from public.saved_jobs)<>1 or (select count(*) from public.saved_services)<>1
 then raise exception 'Rollback did not split current bookmarks into source tables'; end if;
 j:=to_jsonb(public.worksync_save_job('10000000-0000-0000-0000-000000000001'));
 s:=to_jsonb(public.worksync_save_service('20000000-0000-0000-0000-000000000001'));
 if not(j?&array['user_id','job_id','created_at'])
    or not(s?&array['saved_id','user_id','service_id','created_at'])
 then raise exception 'Rollback RPC JSON field contract mismatch: %, %',j,s; end if;
end $$;
\echo 'PASS: saved_listings forward/rollback integration checks'
