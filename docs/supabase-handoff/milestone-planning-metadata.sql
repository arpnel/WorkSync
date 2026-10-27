-- Read-only. Returns ONE row containing both missing metadata sections.
-- No business records or credentials are selected.
with functions as materialized (
  select p.oid::regprocedure::text as signature,
    pg_get_functiondef(p.oid) as definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
)
select jsonb_build_object(
  'functions', (
    select jsonb_agg(to_jsonb(f) order by f.signature)
    from functions f
    where f.signature like 'worksync_activate_contract(%'
      or f.signature like 'worksync_contract_party(%'
      or f.signature like 'worksync_project_party(%'
      or f.signature like 'worksync_respond_agreement%'
      or f.definition ilike '%contract_milestones%'
  ),
  'columns', (
    select jsonb_agg(to_jsonb(c) order by c.table_name, c.ordinal_position)
    from (
      select table_name, ordinal_position, column_name, udt_name,
        is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('contract_milestones', 'milestones', 'projects')
    ) c
  )
) as milestone_planning_metadata;
