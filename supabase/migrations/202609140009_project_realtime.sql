begin;
do $$
declare table_name text;
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach table_name in array array['contracts','contract_item_approvals','projects','milestones','project_submissions','revision_requests','reviews','notifications'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name) then
 execute format('alter publication supabase_realtime add table public.%I',table_name);
 end if;
 end loop;
 end if;
end; $$;
commit;
