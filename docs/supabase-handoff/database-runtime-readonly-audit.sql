-- Read-only metadata audit for the 2026-09-30 compatibility findings.
-- Run in Supabase SQL Editor. No business rows, auth tokens, or environment values.
-- Function definitions can contain custom SQL: inspect before sharing externally.
select jsonb_build_object(
  'columns', (
    select jsonb_agg(to_jsonb(c) order by c.table_name,c.ordinal_position)
    from information_schema.columns c
    where c.table_schema='public'
  ),
  'constraints', (
    select jsonb_agg(jsonb_build_object(
      'table',c.relname,'name',k.conname,'type',k.contype,
      'definition',pg_get_constraintdef(k.oid)
    ) order by c.relname,k.conname)
    from pg_constraint k join pg_class c on c.oid=k.conrelid
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
  ),
  'indexes', (
    select jsonb_agg(to_jsonb(i) order by i.tablename,i.indexname)
    from pg_indexes i where i.schemaname='public'
  ),
  'functions', (
    select jsonb_agg(jsonb_build_object(
      'name',p.proname,'arguments',pg_get_function_arguments(p.oid),
      'result',pg_get_function_result(p.oid),
      'definition',pg_get_functiondef(p.oid)
    ) order by p.proname,p.oid)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proname in (
      'worksync_admin_records','worksync_admin_analytics','worksync_admin_action',
      'worksync_is_admin','worksync_list_disputes','worksync_dispute_context',
      'worksync_review_submission','worksync_submit_work','worksync_save_meeting',
      'worksync_guard_contract','worksync_activate_contract',
      'worksync_settle_project','worksync_claim_payout','worksync_payment_storage_ready'
    )
  ),
  'triggers', (
    select jsonb_agg(jsonb_build_object(
      'schema',n.nspname,'table',c.relname,'name',t.tgname,'enabled',t.tgenabled,
      'definition',pg_get_triggerdef(t.oid),
      'function_definition',pg_get_functiondef(t.tgfoid)
    ) order by n.nspname,c.relname,t.tgname)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and (
      n.nspname='public' or (n.nspname='auth' and c.relname='users')
    )
  ),
  'realtime_tables', (
    select jsonb_agg(to_jsonb(p) order by p.schemaname,p.tablename)
    from pg_publication_tables p where p.pubname='supabase_realtime'
  ),
  'buckets', (
    select jsonb_agg(jsonb_build_object('id',b.id,'public',b.public,
      'file_size_limit',b.file_size_limit,'allowed_mime_types',b.allowed_mime_types)
      order by b.id) from storage.buckets b
  )
) as database_runtime_audit;
