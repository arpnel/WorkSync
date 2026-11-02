-- PREPARED, NOT APPLIED.
-- Limit freelancer service prices to PHP 100,000 at the database boundary.
begin;
set local lock_timeout='3s';

do $$
begin
  if to_regclass('public.services') is null then
    raise exception 'The public.services table is required';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='services' and column_name='price'
  ) then
    raise exception 'The services price column is unavailable';
  end if;
  if exists (select 1 from public.services where price>100000) then
    raise exception 'Existing service prices exceed PHP 100,000; review them before applying this cap';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.services'::regclass
      and conname='services_price_max_100000_check'
  ) then
    alter table public.services
      add constraint services_price_max_100000_check
      check (price<=100000);
  end if;
end;
$$;

commit;
