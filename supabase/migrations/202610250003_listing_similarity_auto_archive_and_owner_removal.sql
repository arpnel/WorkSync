-- PREPARED ONLY: block near-duplicate listings, archive accepted jobs, and
-- let owners hide archived listings while preserving administrator history.
-- Apply after listing moderation/lifecycle and subscription migrations.
begin;

do $$
begin
  if to_regclass('public.listing_submissions') is null
     or to_regclass('public.listing_moderation_events') is null
     or to_regclass('public.jobs') is null
     or to_regclass('public.job_applications') is null
     or to_regprocedure('public.worksync_guard_listing_archive()') is null
     or to_regprocedure('public.worksync_respond_application(uuid,boolean)') is null then
    raise exception 'Apply listing moderation and job application migrations first';
  end if;
end;
$$;

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

alter table public.listing_submissions
  add column if not exists owner_removed_at timestamptz;

create index if not exists listing_submissions_owner_removed
  on public.listing_submissions(owner_id, owner_removed_at)
  where owner_removed_at is not null;
create index if not exists listing_submissions_owner_similarity
  on public.listing_submissions(owner_id, created_at desc);

alter table public.listing_moderation_events
  drop constraint if exists listing_moderation_events_actor_kind_check;
alter table public.listing_moderation_events
  add constraint listing_moderation_events_actor_kind_check
  check (actor_kind in ('system','admin','owner'));

-- Compare title (35%) and description (65%) independently. The check uses all
-- of this owner's recorded submissions, including archived and owner-hidden rows.
-- Resolve the pg_trgm schema dynamically so projects with the extension in
-- either the standard Supabase extensions schema or public can use it safely.
create or replace function public.worksync_listing_text_similarity(p_left text, p_right text)
returns real language plpgsql stable set search_path='' as $$
declare extension_schema text; left_text text; right_text text; score real;
begin
  left_text := pg_catalog.lower(pg_catalog.regexp_replace(coalesce(p_left,''), '[[:space:][:punct:]]', '', 'g'));
  right_text := pg_catalog.lower(pg_catalog.regexp_replace(coalesce(p_right,''), '[[:space:][:punct:]]', '', 'g'));
  if left_text = '' or right_text = '' then return 0; end if;
  if left_text = right_text then return 1; end if;
  select ns.nspname into extension_schema
  from pg_catalog.pg_extension ext
  join pg_catalog.pg_namespace ns on ns.oid=ext.extnamespace
  where ext.extname='pg_trgm';
  if extension_schema is null then raise exception 'pg_trgm extension is unavailable'; end if;
  execute pg_catalog.format('select %I.similarity($1,$2)', extension_schema)
    into score using left_text, right_text;
  return coalesce(score,0);
end;
$$;
revoke all on function public.worksync_listing_text_similarity(text,text) from public,anon,authenticated;

create or replace function public.worksync_guard_listing_similarity()
returns trigger language plpgsql security definer set search_path='' as $$
declare duplicate_submission uuid;
begin
  if new.status <> 'pending_review' then return new; end if;
  if pg_catalog.btrim(coalesce(new.title,'')) = ''
     or pg_catalog.btrim(coalesce(new.description,'')) = '' then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.owner_id::text,0));

  select existing.submission_id into duplicate_submission
  from public.listing_submissions existing
  where existing.owner_id=new.owner_id
    and existing.submission_id is distinct from new.submission_id
    and (
      0.35 * public.worksync_listing_text_similarity(existing.title,new.title)
      + 0.65 * public.worksync_listing_text_similarity(existing.description,new.description)
    ) >= 0.80
  limit 1;

  if duplicate_submission is not null then
    raise exception 'This listing is at least 80%% similar to another one of your listings. Edit the existing listing instead.'
      using errcode='P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.worksync_guard_listing_similarity() from public,anon,authenticated;
drop trigger if exists listing_submissions_guard_similarity_insert on public.listing_submissions;
drop trigger if exists listing_submissions_guard_similarity_update on public.listing_submissions;
create trigger listing_submissions_guard_similarity_insert
before insert on public.listing_submissions
for each row execute function public.worksync_guard_listing_similarity();
create trigger listing_submissions_guard_similarity_update
before update of title,description,status on public.listing_submissions
for each row execute function public.worksync_guard_listing_similarity();

-- Serialize acceptance decisions for one job. Once the first applicant is
-- accepted, later applications cannot also be accepted after the job archives.
create or replace function public.worksync_guard_accept_archived_job()
returns trigger language plpgsql security definer set search_path='' as $$
declare archived boolean;
begin
  if new.status::text <> 'accepted'
     or old.status::text = 'accepted'
     or old.status::text = new.status::text then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.job_id::text, 834723));
  select job.is_archived into archived
  from public.jobs job where job.job_id=new.job_id for update;
  if archived is distinct from false then
    raise exception 'This job is archived and is no longer accepting applicants';
  end if;
  return new;
end;
$$;
revoke all on function public.worksync_guard_accept_archived_job() from public,anon,authenticated;
drop trigger if exists job_applications_guard_accept_archived_job on public.job_applications;
create trigger job_applications_guard_accept_archived_job
before update of status on public.job_applications
for each row execute function public.worksync_guard_accept_archived_job();

create or replace function public.worksync_auto_archive_accepted_job()
returns trigger language plpgsql security definer set search_path='' as $$
declare previous_flag text;
begin
  if new.status::text <> 'accepted'
     or old.status::text = 'accepted'
     or old.status::text = new.status::text then
    return new;
  end if;
  previous_flag := coalesce(pg_catalog.current_setting('worksync.auto_archive_accepted_job',true),'');
  perform pg_catalog.set_config('worksync.auto_archive_accepted_job','on',true);
  update public.jobs set is_archived=true
  where job_id=new.job_id and is_archived=false;
  perform pg_catalog.set_config('worksync.auto_archive_accepted_job',previous_flag,true);
  return new;
end;
$$;
revoke all on function public.worksync_auto_archive_accepted_job() from public,anon,authenticated;
drop trigger if exists job_applications_auto_archive_accepted_job on public.job_applications;
create trigger job_applications_auto_archive_accepted_job
after update of status on public.job_applications
for each row execute function public.worksync_auto_archive_accepted_job();

-- Keep the existing archive guards and allowance checks. The trusted nested
-- trigger may archive an accepted job; owners still cannot archive it manually.
create or replace function public.worksync_guard_listing_archive()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  owner uuid;
  active_count bigint;
  active_cap integer;
  current_plan text;
  status_now text;
  target_listing_id uuid;
  listing_kind text;
  automatic_accept_archive boolean := coalesce(pg_catalog.current_setting('worksync.auto_archive_accepted_job',true),'')='on'
    and pg_catalog.pg_trigger_depth()>1;
begin
  if old.is_archived is not distinct from new.is_archived then return new; end if;
  if tg_table_name='jobs' then
    listing_kind:='job'; target_listing_id:=new.job_id;
    select user_id into owner from public.client_profiles where client_id=new.client_id;
  else
    listing_kind:='service'; target_listing_id:=new.service_id;
    select user_id into owner from public.freelancer_profiles where freelancer_id=new.freelancer_id;
  end if;
  if auth.uid() is distinct from owner and not public.worksync_is_admin() and not automatic_accept_archive then
    raise exception 'Only the listing owner can archive or restore this listing';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,0));
  select status into status_now from public.listing_submissions
  where listing_type=listing_kind and listing_id=target_listing_id for update;
  if status_now is distinct from 'approved' then raise exception 'Only approved listings can be archived or restored'; end if;

  if new.is_archived then
    if tg_table_name='jobs' then
      if not automatic_accept_archive and exists(
        select 1 from public.job_applications application
        where application.job_id=target_listing_id and application.status::text='accepted'
      ) then raise exception 'Resolve accepted applications before archiving this job'; end if;
    elsif exists(
      select 1 from public.service_orders order_row
      where order_row.service_id=target_listing_id and order_row.status::text in ('accepted','converted')
    ) then raise exception 'Complete or resolve active service orders before archiving this service';
    end if;
    update public.listing_submissions set archived_at=pg_catalog.now()
    where listing_type=listing_kind and listing_id=target_listing_id;
    insert into public.listing_moderation_events(submission_id,actor_id,actor_kind,action,explanation)
    select submission_id,auth.uid(),'system','archived',
      case when automatic_accept_archive then 'Automatically archived after an applicant was accepted.'
           else 'Owner archived the listing.' end
    from public.listing_submissions where listing_type=listing_kind and listing_id=target_listing_id;
  else
    if tg_table_name='jobs' and exists(
      select 1 from public.job_applications application
      where application.job_id=target_listing_id and application.status::text='accepted'
    ) then raise exception 'A job with an accepted applicant cannot be restored'; end if;
    insert into public.user_subscriptions(user_id) values(owner) on conflict(user_id) do nothing;
    current_plan := public.worksync_effective_subscription_plan(owner);
    if current_plan='pro' then
      select active_listing_limit into active_cap from public.subscription_plans where plan_code=current_plan;
      select count(*) into active_count from (
        select job.job_id from public.jobs job join public.listing_submissions submission
          on submission.listing_type='job' and submission.listing_id=job.job_id
        where submission.owner_id=owner and submission.status='approved' and submission.archived_at is null and job.is_archived=false
        union all
        select service.service_id from public.services service join public.listing_submissions submission
          on submission.listing_type='service' and submission.listing_id=service.service_id
        where submission.owner_id=owner and submission.status='approved' and submission.archived_at is null and service.is_archived=false
      ) active_listings;
    elsif listing_kind='job' then
      select active_job_limit into active_cap from public.subscription_plans where plan_code=current_plan;
      select count(*) into active_count from public.jobs job join public.listing_submissions submission
        on submission.listing_type='job' and submission.listing_id=job.job_id
      where submission.owner_id=owner and submission.status='approved' and submission.archived_at is null and job.is_archived=false;
    else
      select active_service_limit into active_cap from public.subscription_plans where plan_code=current_plan;
      select count(*) into active_count from public.services service join public.listing_submissions submission
        on submission.listing_type='service' and submission.listing_id=service.service_id
      where submission.owner_id=owner and submission.status='approved' and submission.archived_at is null and service.is_archived=false;
    end if;
    if coalesce(active_count,0)>=coalesce(active_cap,0) then
      raise exception 'Active listing limit reached. Archive an active listing or change plans before restoring';
    end if;
    update public.listing_submissions set archived_at=null
    where listing_type=listing_kind and listing_id=target_listing_id;
    insert into public.listing_moderation_events(submission_id,actor_id,actor_kind,action,explanation)
    select submission_id,auth.uid(),'system','restored','Owner restored the approved listing.'
    from public.listing_submissions where listing_type=listing_kind and listing_id=target_listing_id;
  end if;
  return new;
end;
$$;
revoke all on function public.worksync_guard_listing_archive() from public,anon,authenticated;

create or replace function public.worksync_remove_archived_listing(p_kind text,p_listing uuid)
returns void language plpgsql security definer set search_path='' as $$
declare submission public.listing_submissions%rowtype;
begin
  if auth.uid() is null or p_kind not in ('job','service') then
    raise exception 'Sign in and choose a valid listing';
  end if;
  select * into submission from public.listing_submissions
  where listing_type=p_kind and listing_id=p_listing for update;
  if not found or submission.owner_id is distinct from auth.uid() then
    raise exception 'Listing owner required';
  end if;
  if submission.archived_at is null then
    raise exception 'Only archived listings can be removed from My Listings';
  end if;
  if submission.owner_removed_at is not null then return; end if;
  update public.listing_submissions set owner_removed_at=pg_catalog.now()
  where submission_id=submission.submission_id;
  insert into public.listing_moderation_events(submission_id,actor_id,actor_kind,action,explanation)
  values(submission.submission_id,auth.uid(),'owner','removed_from_my_listings',
    'Owner hid this archived listing from My Listings. Listing data and moderation history are retained for administrators.');
end;
$$;
revoke all on function public.worksync_remove_archived_listing(text,uuid) from public,anon;
grant execute on function public.worksync_remove_archived_listing(text,uuid) to authenticated;

commit;
