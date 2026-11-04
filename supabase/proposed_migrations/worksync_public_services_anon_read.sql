-- PREPARED, NOT APPLIED.
-- Remove the legacy services_read policy because its active/unarchived branch
-- bypasses listing approval and hidden checks for anon reads.
-- Keep the deployed services_moderation_anon policy as the public row filter.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'services'
      and policyname = 'services_moderation_anon'
      and cmd = 'SELECT'
      and 'anon' = any(roles)
      and qual like '%worksync_listing_visible%'
  ) then
    raise exception 'Expected public service moderation policy is missing; refusing to grant anon SELECT.';
  end if;
end;
$$;

drop policy if exists services_read on public.services;
grant select (
  service_id,
  freelancer_id,
  category_id,
  title,
  description,
  price,
  pricing_mode,
  delivery_time_days,
  revisions_count,
  service_type,
  status,
  slug,
  cover_image_url,
  created_at,
  updated_at,
  is_archived
) on table public.services to anon;
