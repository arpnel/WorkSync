-- No new payment columns or tables. Apply in Supabase SQL Editor before checkout.
begin;
-- Payments are written only by the verified server integration. Existing SELECT
-- policies are preserved; API reads additionally verify project membership.
revoke insert, update, delete, truncate, references, trigger on public.payments from public, anon, authenticated;
grant select, insert, update on public.payments to service_role;

create or replace function public.worksync_payment_storage_ready()
returns boolean language sql stable security definer set search_path = '' as $$
  select not (
    has_table_privilege('anon', 'public.payments', 'INSERT,UPDATE,DELETE,TRUNCATE')
    or has_table_privilege('authenticated', 'public.payments', 'INSERT,UPDATE,DELETE,TRUNCATE')
    or exists (
      select 1 from information_schema.column_privileges
      where table_schema='public' and table_name='payments'
        and grantee in ('PUBLIC','anon','authenticated')
        and privilege_type in ('INSERT','UPDATE')
    )
  );
$$;
revoke all on function public.worksync_payment_storage_ready() from public, anon, authenticated;
grant execute on function public.worksync_payment_storage_ready() to service_role;
commit;
