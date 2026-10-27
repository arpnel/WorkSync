-- READ ONLY: one result, definitions/constraints/grants only, no business rows.
with relevant_tables as (
 select c.oid,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('payments','projects','project_submissions',
 'milestones','contracts','service_orders','client_profiles','freelancer_profiles',
 'freelancer_payout_accounts','project_payouts','project_cancellations','project_disputes','notifications')
), functions as materialized (
 select p.oid,p.proname,p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f'
)
select jsonb_build_object(
 'tables',(select jsonb_agg(jsonb_build_object('name',relname,'rls',relrowsecurity)) from relevant_tables),
 'columns',(select jsonb_agg(to_jsonb(c)) from information_schema.columns c where c.table_schema='public' and c.table_name in (select relname from relevant_tables)),
 'constraints',(select jsonb_agg(jsonb_build_object('table',t.relname,'name',c.conname,'definition',pg_get_constraintdef(c.oid))) from pg_constraint c join relevant_tables t on t.oid=c.conrelid),
 'indexes',(select jsonb_agg(jsonb_build_object('table',t.relname,'definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid)) from pg_index i join relevant_tables t on t.oid=i.indrelid),
 'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='public' and tablename in(select relname from relevant_tables)),
 'grants',(select jsonb_agg(to_jsonb(g)) from information_schema.role_table_grants g where table_schema='public' and table_name in(select relname from relevant_tables)),
 'column_grants',(select jsonb_agg(to_jsonb(g)) from information_schema.column_privileges g where table_schema='public' and table_name in(select relname from relevant_tables) and privilege_type in ('INSERT','UPDATE')),
 'triggers',(select jsonb_agg(jsonb_build_object('table',r.relname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid))) from pg_trigger t join relevant_tables r on r.oid=t.tgrelid where not t.tgisinternal),
 'functions',(select jsonb_agg(jsonb_build_object('signature',f.signature,'definition',f.definition,
 'anon_execute',has_function_privilege('anon',f.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',f.oid,'EXECUTE'),'service_execute',has_function_privilege('service_role',f.oid,'EXECUTE')))
 from functions f where f.proname in ('worksync_settle_project','worksync_claim_payout','worksync_payment_storage_ready','worksync_order_on_hold','worksync_review_submission','worksync_request_cancellation','worksync_respond_cancellation','worksync_open_dispute','worksync_resolve_dispute','worksync_guard_contract','worksync_guard_contract_update')),
 'enums',(select jsonb_agg(jsonb_build_object('name',t.typname,'label',e.enumlabel)) from pg_type t join pg_enum e on e.enumtypid=t.oid where t.typnamespace='public'::regnamespace)
) as payment_readiness_metadata;
