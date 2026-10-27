-- Read-only: retrieve deployed response contracts, not business records.
-- Run in Supabase SQL Editor and return both definitions.
select
  p.oid::regprocedure as signature,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('worksync_list_disputes', 'worksync_admin_analytics')
order by p.proname, p.oid;
