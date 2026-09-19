-- Run in Supabase SQL Editor. Read-only: no user rows, secrets, or mutations.
-- Returns policy conditions, effective grants, and installed trigger metadata.
select jsonb_build_object(
  'tables', (
    select jsonb_agg(jsonb_build_object(
      'schema', n.nspname, 'table', c.relname,
      'rls_enabled', c.relrowsecurity, 'rls_forced', c.relforcerowsecurity,
      'authenticated_select', has_table_privilege('authenticated', c.oid, 'SELECT'),
      'authenticated_insert', has_table_privilege('authenticated', c.oid, 'INSERT'),
      'authenticated_update', has_table_privilege('authenticated', c.oid, 'UPDATE'),
      'authenticated_delete', has_table_privilege('authenticated', c.oid, 'DELETE')
    ) order by n.nspname, c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p') and (n.nspname='public' or (n.nspname='storage' and c.relname='objects'))
  ),
  'policies', (
    select jsonb_agg(to_jsonb(p) order by p.schemaname,p.tablename,p.policyname)
    from pg_policies p where p.schemaname in ('public','storage')
  ),
  'functions', (
    select jsonb_agg(jsonb_build_object(
      'name', p.proname, 'arguments', pg_get_function_arguments(p.oid),
      'result', pg_get_function_result(p.oid),
      'security_definer', p.prosecdef, 'owner', pg_get_userbyid(p.proowner),
      'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
      'anon_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
      'service_role_execute', has_function_privilege('service_role', p.oid, 'EXECUTE')
    ) order by p.proname, p.oid)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'worksync_%'
  ),
  'column_grants', (
    select jsonb_agg(to_jsonb(g)) from information_schema.column_privileges g
    where g.table_schema='public' and g.grantee in ('authenticated','anon')
  ),
  'triggers', (
    select jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,
      'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)))
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal
  )
) as rls_audit;
