-- Remove broad default table grants left on saved_listings by the initial merge.
begin;
revoke all privileges on table public.saved_listings from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.saved_listings to authenticated;
grant all privileges on table public.saved_listings to service_role;
commit;
