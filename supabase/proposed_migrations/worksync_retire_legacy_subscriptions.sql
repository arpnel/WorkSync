-- PREPARED, NOT APPLIED.
-- Retire the empty legacy public.subscriptions table only.
-- The lock keeps the zero-row precondition stable against concurrent writes.
-- A plain DROP TABLE intentionally fails if any dependency still references it.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

lock table public.subscriptions in access exclusive mode;

do $$
begin
  if exists (select 1 from public.subscriptions limit 1) then
    raise exception
      'public.subscriptions is not empty; refusing to retire it';
  end if;
end;
$$;

drop table public.subscriptions;

commit;
