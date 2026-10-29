-- Counter the project's default table privileges for new public tables.
revoke all on table public.freelancer_tax_identifiers from service_role;
grant select, insert, update on table public.freelancer_tax_identifiers to service_role;
