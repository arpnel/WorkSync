-- Read-only prerequisite check. Run in Supabase SQL Editor and return the result.
-- No business records, credentials, document contents, or mutations.
select jsonb_build_object(
  'columns', (
    select jsonb_agg(jsonb_build_object(
      'name',column_name,'type',udt_name,'nullable',is_nullable,'default',column_default
    ) order by ordinal_position)
    from information_schema.columns
    where table_schema='public' and table_name='verification_requests'
  ),
  'indexes', (
    select jsonb_agg(jsonb_build_object(
      'name',i.relname,'unique',x.indisunique,'valid',x.indisvalid,
      'definition',pg_get_indexdef(x.indexrelid),
      'predicate',pg_get_expr(x.indpred,x.indrelid)
    ) order by i.relname)
    from pg_index x join pg_class i on i.oid=x.indexrelid
    where x.indrelid='public.verification_requests'::regclass
  ),
  'constraints', (
    select jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid)))
    from pg_constraint where conrelid='public.verification_requests'::regclass
  ),
  'triggers', (
    select jsonb_agg(jsonb_build_object(
      'table',c.relname,'name',t.tgname,'enabled',t.tgenabled,
      'definition',pg_get_triggerdef(t.oid),
      'function_definition',pg_get_functiondef(t.tgfoid)
    ) order by c.relname,t.tgname)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where not t.tgisinternal and t.tgrelid in (
      'public.verification_requests'::regclass,
      'public.freelancer_profiles'::regclass
    )
  ),
  'service_role_grants', (
    select jsonb_build_object(
      'request_select',has_table_privilege('service_role','public.verification_requests','SELECT'),
      'request_insert',has_table_privilege('service_role','public.verification_requests','INSERT'),
      'request_update',has_table_privilege('service_role','public.verification_requests','UPDATE'),
      'profile_select',has_table_privilege('service_role','public.freelancer_profiles','SELECT'),
      'profile_update',has_table_privilege('service_role','public.freelancer_profiles','UPDATE')
    )
  )
) as didit_sync_prerequisites;
