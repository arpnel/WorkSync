-- PREPARED, NOT APPLIED.
-- Only currently active marketplace postings block an identical or highly
-- similar repost. Closed, paused, completed, archived, hidden, rejected, and
-- otherwise inactive postings no longer prevent a new submission.
begin;

create or replace function public.worksync_capture_listing_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
  duplicate_found boolean;
  kind text;
  listing_id uuid;
begin
  if tg_table_name = 'jobs' then
    kind := 'job';
    listing_id := new.job_id;
    select user_id into owner
    from public.client_profiles
    where client_id = new.client_id;
  else
    kind := 'service';
    listing_id := new.service_id;
    select user_id into owner
    from public.freelancer_profiles
    where freelancer_id = new.freelancer_id;
  end if;

  if owner is null then
    raise exception 'Complete the owner profile before posting';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(owner::text, 0)
  );
  insert into public.user_subscriptions(user_id)
  values (owner)
  on conflict (user_id) do nothing;

  select exists (
    select 1
    from public.listing_submissions s
    where s.owner_id = owner
      and s.listing_type = kind
      and s.status = 'approved'
      and s.archived_at is null
      and not exists (
        select 1
        from public.listing_moderation m
        where m.listing_type = s.listing_type
          and m.listing_id = s.listing_id
          and m.hidden
      )
      and (
        (
          s.listing_type = 'job'
          and exists (
            select 1 from public.jobs j
            where j.job_id = s.listing_id
              and j.status = 'open'
              and not coalesce(j.is_archived, false)
          )
        )
        or (
          s.listing_type = 'service'
          and exists (
            select 1 from public.services v
            where v.service_id = s.listing_id
              and v.status = 'Active'
              and not coalesce(v.is_archived, false)
          )
        )
      )
      and lower(regexp_replace(s.title || s.description,
        '[[:space:][:punct:]]', '', 'g'))
        = lower(regexp_replace(new.title || new.description,
          '[[:space:][:punct:]]', '', 'g'))
  ) into duplicate_found;

  if duplicate_found then
    raise exception 'An identical active listing already exists. Edit the existing listing instead.'
      using errcode = 'P0001';
  end if;

  insert into public.listing_submissions(
    listing_type, listing_id, owner_id, title, description, status
  )
  values (kind, listing_id, owner, new.title, new.description, 'editing');
  return new;
end;
$$;

create or replace function public.worksync_guard_listing_similarity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  duplicate_submission uuid;
begin
  if new.status <> 'pending_review' then
    return new;
  end if;
  if pg_catalog.btrim(coalesce(new.title, '')) = ''
    or pg_catalog.btrim(coalesce(new.description, '')) = '' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.owner_id::text, 0)
  );

  select existing.submission_id into duplicate_submission
  from public.listing_submissions existing
  where existing.owner_id = new.owner_id
    and existing.submission_id is distinct from new.submission_id
    and existing.status = 'approved'
    and existing.archived_at is null
    and not exists (
      select 1
      from public.listing_moderation m
      where m.listing_type = existing.listing_type
        and m.listing_id = existing.listing_id
        and m.hidden
    )
    and (
      (
        existing.listing_type = 'job'
        and exists (
          select 1 from public.jobs j
          where j.job_id = existing.listing_id
            and j.status = 'open'
            and not coalesce(j.is_archived, false)
        )
      )
      or (
        existing.listing_type = 'service'
        and exists (
          select 1 from public.services v
          where v.service_id = existing.listing_id
            and v.status = 'Active'
            and not coalesce(v.is_archived, false)
        )
      )
    )
    and (
      0.35 * public.worksync_listing_text_similarity(existing.title, new.title)
      + 0.65 * public.worksync_listing_text_similarity(existing.description, new.description)
    ) >= 0.80
  limit 1;

  if duplicate_submission is not null then
    raise exception 'This listing is at least 80%% similar to another active listing. Edit the existing listing instead.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.worksync_capture_listing_submission()
  from public, anon, authenticated;
revoke all on function public.worksync_guard_listing_similarity()
  from public, anon, authenticated;

commit;
