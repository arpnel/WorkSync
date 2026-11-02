-- PREPARED, NOT APPLIED.
-- Hiding a job or service returns it to the owner's review queue. Owners can
-- edit and resubmit it; a subsequent administrator approval clears the hidden
-- flag so the approved listing can appear in the marketplace again.
begin;

create or replace function public.worksync_admin_hide_listing(
  p_listing_type text,
  p_listing_id uuid,
  p_notes text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission public.listing_submissions%rowtype;
  v_notes text := pg_catalog.btrim(coalesce(p_notes, ''));
begin
  if not public.worksync_is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_listing_type not in ('job', 'service') or p_listing_id is null then
    raise exception 'A valid job or service listing is required' using errcode = '22023';
  end if;
  if v_notes = '' or pg_catalog.length(v_notes) > 5000 then
    raise exception 'Review notes are required (up to 5000 characters)' using errcode = '22023';
  end if;

  select * into v_submission
  from public.listing_submissions
  where listing_type = p_listing_type and listing_id = p_listing_id;
  if not found then
    raise exception 'Listing submission not found' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_submission.owner_id::text, 0)
  );
  select * into v_submission
  from public.listing_submissions
  where submission_id = v_submission.submission_id
  for update;

  insert into public.listing_moderation(
    listing_type, listing_id, hidden, notes, reviewed_by, updated_at
  ) values (
    p_listing_type, p_listing_id, true, v_notes, auth.uid(), pg_catalog.now()
  )
  on conflict (listing_type, listing_id) do update
    set hidden = true,
        notes = excluded.notes,
        reviewed_by = excluded.reviewed_by,
        updated_at = excluded.updated_at;

  -- manual_review is surfaced to owners as "Awaiting review" and remains
  -- editable/resubmittable. It also avoids treating an admin re-review as a
  -- new public submission for seller-eligibility and similarity guards.
  update public.listing_submissions
  set status = 'manual_review',
      decision = 'administrator_hide',
      decision_category = null,
      decision_reason = v_notes
  where submission_id = v_submission.submission_id;

  insert into public.listing_moderation_events(
    submission_id, actor_id, actor_kind, action, explanation
  ) values (
    v_submission.submission_id, auth.uid(), 'admin', 'hide', v_notes
  );

  insert into public.admin_audit_log(admin_id, action, target_id, details)
  values (
    auth.uid(),
    p_listing_type || ':hide',
    p_listing_id,
    jsonb_build_object(
      'notes', v_notes,
      'previous_status', v_submission.status,
      'status', 'manual_review'
    )
  );

  insert into public.notifications(user_id, type, title, message, related_id, is_read)
  values (
    v_submission.owner_id,
    'listing_moderation',
    'Listing sent back for review',
    'Your listing is hidden while it awaits review. You can edit it in My Listings and resubmit it for approval. Administrator note: ' || v_notes,
    p_listing_id,
    false
  );

  return jsonb_build_object(
    'listing_type', p_listing_type,
    'listing_id', p_listing_id,
    'status', 'manual_review',
    'hidden', true
  );
end;
$$;

create or replace function public.worksync_admin_restore_listing(
  p_listing_type text,
  p_listing_id uuid,
  p_notes text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission public.listing_submissions%rowtype;
  v_hidden boolean;
  v_notes text := pg_catalog.btrim(coalesce(p_notes, ''));
begin
  if not public.worksync_is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_listing_type not in ('job', 'service') or p_listing_id is null then
    raise exception 'A valid job or service listing is required' using errcode = '22023';
  end if;
  if v_notes = '' or pg_catalog.length(v_notes) > 5000 then
    raise exception 'Review notes are required (up to 5000 characters)' using errcode = '22023';
  end if;

  select * into v_submission
  from public.listing_submissions
  where listing_type = p_listing_type and listing_id = p_listing_id;
  if not found then
    raise exception 'Listing submission not found' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_submission.owner_id::text, 0)
  );
  select * into v_submission
  from public.listing_submissions
  where submission_id = v_submission.submission_id
  for update;

  select hidden into v_hidden
  from public.listing_moderation
  where listing_type = p_listing_type and listing_id = p_listing_id
  for update;
  if not coalesce(v_hidden, false) then
    raise exception 'Listing is not hidden' using errcode = 'P0002';
  end if;

  if v_submission.status = 'editing' then
    raise exception 'The owner is editing this listing; review is not ready';
  elsif v_submission.status = 'approved' then
    update public.listing_moderation
    set hidden = false, reviewed_by = auth.uid(), updated_at = pg_catalog.now()
    where listing_type = p_listing_type and listing_id = p_listing_id;

    insert into public.listing_moderation_events(
      submission_id, actor_id, actor_kind, action, explanation
    ) values (
      v_submission.submission_id, auth.uid(), 'admin', 'restored', v_notes
    );
    insert into public.notifications(user_id, type, title, message, related_id, is_read)
    values (
      v_submission.owner_id,
      'listing_moderation',
      'Listing restored',
      'Your listing has been restored to the marketplace. Administrator note: ' || v_notes,
      p_listing_id,
      false
    );
  else
    -- Use the normal approval workflow so owner listing limits, audit events,
    -- and approval notifications continue to apply.
    perform public.worksync_admin_decide_listing(
      v_submission.submission_id, 'approve', null, v_notes
    );
  end if;

  insert into public.admin_audit_log(admin_id, action, target_id, details)
  values (
    auth.uid(),
    p_listing_type || ':restore',
    p_listing_id,
    jsonb_build_object('notes', v_notes, 'status', 'approved', 'hidden', false)
  );

  return jsonb_build_object(
    'listing_type', p_listing_type,
    'listing_id', p_listing_id,
    'status', 'approved',
    'hidden', false
  );
end;
$$;

-- Every successful approval, including the normal Listing Moderation page,
-- clears an earlier administrative hide in the same transaction.
create or replace function public.worksync_clear_listing_hide_after_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update public.listing_moderation
    set hidden = false, updated_at = pg_catalog.now()
    where listing_type = new.listing_type
      and listing_id = new.listing_id
      and hidden;
  end if;
  return new;
end;
$$;

revoke all on function public.worksync_admin_hide_listing(text, uuid, text) from public, anon;
grant execute on function public.worksync_admin_hide_listing(text, uuid, text) to authenticated;
revoke all on function public.worksync_admin_restore_listing(text, uuid, text) from public, anon;
grant execute on function public.worksync_admin_restore_listing(text, uuid, text) to authenticated;
revoke all on function public.worksync_clear_listing_hide_after_approval() from public, anon, authenticated;

drop trigger if exists worksync_clear_listing_hide_after_approval on public.listing_submissions;
create trigger worksync_clear_listing_hide_after_approval
  after update of status on public.listing_submissions
  for each row execute function public.worksync_clear_listing_hide_after_approval();

notify pgrst, 'reload schema';
commit;
