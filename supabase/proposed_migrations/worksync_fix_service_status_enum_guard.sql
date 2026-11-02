-- PREPARED, NOT APPLIED.
-- The shared listing content guard handles both jobs and services. Comparing
-- a service_status enum directly to the job-only value 'closed' raises 22P02
-- even when the job branch is not taken. Compare as text to keep service
-- content updates (such as cover-image updates) valid.
begin;

do $$
declare
  fn text;
  original_fn text;
begin
  fn := pg_catalog.pg_get_functiondef(
    'public.worksync_guard_listing_content_update()'::regprocedure
  );

  if pg_catalog.strpos(
    pg_catalog.lower(fn),
    'new.status::text = ''closed'''
  ) > 0 then
    return;
  end if;

  original_fn := fn;
  fn := pg_catalog.regexp_replace(
    fn,
    '(?i)new\.status[[:space:]]*=[[:space:]]*''closed''',
    'new.status::text = ''closed'''
  );

  if fn = original_fn then
    raise exception 'Expected job-only closed status check was not found; inspect worksync_guard_listing_content_update before applying';
  end if;

  execute fn;
end;
$$;

commit;
