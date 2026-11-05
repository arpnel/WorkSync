-- PREPARED, NOT APPLIED.
-- Remove the legacy services_read policy because its active/unarchived branch
-- bypasses listing approval and hidden checks for anon reads.
-- Replace its permissive role with an allow-all policy whose rows remain
-- restricted by the deployed anon and authenticated moderation policies.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  services_rls_enabled boolean;
begin
  select relrowsecurity into services_rls_enabled
  from pg_class
  where oid = 'public.services'::regclass;

  if services_rls_enabled is distinct from true then
    raise exception 'RLS must be enabled on public.services before allowing public reads';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'services'
      and policyname = 'services_moderation_anon'
      and cmd = 'SELECT'
      and permissive = 'RESTRICTIVE'
      and 'anon' = any(roles)
      and qual like '%worksync_listing_visible%'
  ) then
    raise exception 'Expected restrictive anon moderation policy is missing; refusing to grant anon SELECT.';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'services'
      and policyname = 'services_moderation_visibility'
      and cmd = 'SELECT'
      and permissive = 'RESTRICTIVE'
      and 'authenticated' = any(roles)
      and qual like '%worksync_listing_visible%'
  ) then
    raise exception 'Expected restrictive authenticated moderation policy is missing; refusing to replace services_read.';
  end if;
end;
$$;

drop policy if exists services_read on public.services;
drop policy if exists services_public_select on public.services;
create policy services_public_select on public.services
  as permissive for select to anon, authenticated
  using (true);

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

commit;
