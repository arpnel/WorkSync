-- PREPARED, NOT APPLIED.
-- Show linked account user IDs for both participants in the admin Projects table.
-- Profile IDs and account IDs are not always the same (client_profiles is one
-- example), so presenting one of each looked like a mismatched participant.
begin;

do $$
declare
  fn text;
begin
  fn := pg_catalog.pg_get_functiondef(
    'public.worksync_admin_records(text,text,integer)'::regprocedure
  );

  if pg_catalog.strpos(fn, 'Client account:') = 0 then
    if pg_catalog.strpos(fn, 'Client profile:') = 0 then
      raise exception 'Unexpected admin project client mapping; inspect worksync_admin_records before applying';
    end if;
    fn := pg_catalog.regexp_replace(
      fn,
      $re$Client profile: ',p\.client_id$re$,
      $replacement$Client account: ',(select cp.user_id from public.client_profiles cp where cp.client_id=p.client_id)$replacement$,
      'g'
    );
    if pg_catalog.strpos(fn, 'Client account:') = 0 then
      raise exception 'Unable to replace the admin project client mapping';
    end if;
  end if;

  if pg_catalog.strpos(fn, 'Freelancer account:') = 0 then
    if pg_catalog.strpos(fn, 'Freelancer profile:') = 0 then
      raise exception 'Unexpected admin project freelancer mapping; inspect worksync_admin_records before applying';
    end if;
    fn := pg_catalog.regexp_replace(
      fn,
      $re$Freelancer profile: ',p\.freelancer_id$re$,
      $replacement$Freelancer account: ',(select fp.user_id from public.freelancer_profiles fp where fp.freelancer_id=p.freelancer_id)$replacement$,
      'g'
    );
    if pg_catalog.strpos(fn, 'Freelancer account:') = 0 then
      raise exception 'Unable to replace the admin project freelancer mapping';
    end if;
  end if;

  execute fn;
end;
$$;

notify pgrst, 'reload schema';
commit;
