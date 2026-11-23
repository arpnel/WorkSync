begin;

-- Keep client organization details out of the publicly exposed client_profiles
-- row. Server routes access this private table with the service role.
create table if not exists public.client_organization_profiles (
  client_id uuid primary key references public.client_profiles(client_id) on delete cascade,
  client_type text not null default 'individual',
  organization_name text,
  organization_address text,
  updated_at timestamptz not null default now(),
  constraint client_organization_type check (client_type in ('individual', 'organization')),
  constraint client_organization_name_length check (
    organization_name is null or char_length(btrim(organization_name)) between 1 and 200
  ),
  constraint client_organization_address_length check (
    organization_address is null or char_length(btrim(organization_address)) between 1 and 500
  ),
  constraint client_organization_details_required check (
    client_type <> 'organization'
    or (organization_name is not null and organization_address is not null)
  )
);

alter table public.client_organization_profiles enable row level security;
revoke all on public.client_organization_profiles from public, anon, authenticated;
grant select, insert, update on public.client_organization_profiles to service_role;

commit;
