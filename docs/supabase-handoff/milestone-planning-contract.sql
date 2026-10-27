-- Read-only diagnostic: deployed milestone planning and project creation logic.
-- Returns definitions only, not business records or credentials.
select p.oid::regprocedure as signature, pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.proname in ('worksync_add_milestone', 'worksync_remove_milestone')
    or p.oid in (
      select t.tgfoid from pg_trigger t
      where not t.tgisinternal
        and t.tgrelid in ('public.contracts'::regclass, 'public.service_orders'::regclass)
    ))
order by p.proname, p.oid;

-- Follow-up: activation uses contract_milestones, while the current add RPC
-- writes milestones. Inspect the draft-to-project mapping before patching.
select p.oid::regprocedure as signature, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and (p.proname in ('worksync_activate_contract', 'worksync_contract_party',
    'worksync_project_party', 'worksync_respond_agreement_item',
    'worksync_respond_agreement')
    or pg_get_functiondef(p.oid) ilike '%contract_milestones%')
order by p.proname, p.oid;

select table_name, column_name, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('contract_milestones', 'milestones', 'projects')
order by table_name, ordinal_position;

select c.relname as table_name, t.tgname,
  pg_get_triggerdef(t.oid) as definition,
  pg_get_functiondef(t.tgfoid) as function_definition
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and t.tgrelid in (
  'public.contract_milestones'::regclass, 'public.milestones'::regclass,
  'public.projects'::regclass, 'public.contract_item_approvals'::regclass
)
order by c.relname, t.tgname;
