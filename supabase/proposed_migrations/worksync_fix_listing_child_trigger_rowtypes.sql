-- PREPARED, NOT APPLIED.
-- The deployed child-edit trigger assumes every NEW/OLD row has listing_type
-- and job_id, but service_media and service_milestones only have service_id.
-- The deployed content-update guard combines a table-name check with job-only
-- NEW.job_id access in one boolean expression; PostgreSQL can evaluate that
-- access for service rows too. Keep job-only fields inside a jobs-only branch.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.worksync_guard_listing_content_update()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  kind text;
  target_listing_id uuid;
  review_status text;
begin
  if (to_jsonb(new) - 'is_archived' - 'updated_at')
      = (to_jsonb(old) - 'is_archived' - 'updated_at') then
    return new;
  end if;

  if tg_table_name = 'jobs' then
    kind := 'job';
    target_listing_id := new.job_id;

    if old.status is distinct from new.status
      and new.status::text = 'closed'
      and (to_jsonb(new) - 'status' - 'updated_at')
          = (to_jsonb(old) - 'status' - 'updated_at')
      and exists (
        select 1
        from public.worksync_workflow_write_context x
        join public.contracts c on c.contract_id = x.object_id
        join public.job_applications a on a.application_id = c.application_id
        where x.backend_pid = pg_catalog.pg_backend_pid()
          and x.transaction_id = pg_catalog.txid_current()
          and x.purpose = 'activation'
          and c.status::text = 'active'
          and a.job_id = new.job_id
      ) then
      return new;
    end if;
  elsif tg_table_name = 'services' then
    kind := 'service';
    target_listing_id := new.service_id;
  else
    raise exception 'Unsupported listing table for content updates: %', tg_table_name;
  end if;

  select status into review_status
  from public.listing_submissions
  where listing_type = kind and listing_id = target_listing_id
  for update;

  if review_status is distinct from 'editing' then
    raise exception 'Submit approved or rejected listings through the review workflow; listings under review cannot be edited';
  end if;
  return new;
end;
$function$;

create or replace function public.worksync_guard_service_child_edit()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  target_service_id uuid;
  old_service_id uuid;
  review_status text;
begin
  if tg_op = 'DELETE' then
    target_service_id := old.service_id;
  else
    target_service_id := new.service_id;
    if tg_op = 'UPDATE' then
      old_service_id := old.service_id;
    end if;
  end if;

  if target_service_id is null then
    raise exception 'Service details require a service ID';
  end if;

  if old_service_id is not null and old_service_id is distinct from target_service_id then
    select status into review_status
    from public.listing_submissions
    where listing_type = 'service' and listing_id = old_service_id
    for update;

    if review_status is distinct from 'editing' then
      raise exception 'Listing details cannot be moved from a listing outside its edit workflow';
    end if;
  end if;

  select status into review_status
  from public.listing_submissions
  where listing_type = 'service' and listing_id = target_service_id
  for update;

  if review_status is distinct from 'editing' then
    raise exception 'Listing details cannot be edited unless the listing is in its edit workflow';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function public.worksync_guard_service_child_edit()
  from public, anon, authenticated;
grant execute on function public.worksync_guard_service_child_edit()
  to service_role;

drop trigger if exists worksync_guard_service_media_edit on public.service_media;
create trigger worksync_guard_service_media_edit
  before insert or update or delete on public.service_media
  for each row execute function public.worksync_guard_service_child_edit();

drop trigger if exists worksync_guard_service_milestones_edit on public.service_milestones;
create trigger worksync_guard_service_milestones_edit
  before insert or update or delete on public.service_milestones
  for each row execute function public.worksync_guard_service_child_edit();

commit;
