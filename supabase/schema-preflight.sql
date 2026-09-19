-- READ ONLY. Run before reconciling the prepared migration batch.
select c.relname table_name,a.attname column_name,format_type(a.atttypid,a.atttypmod) data_type,
 array(select e.enumlabel from pg_enum e where e.enumtypid=a.atttypid order by e.enumsortorder) enum_labels,
 pg_get_expr(d.adbin,d.adrelid) column_default
from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
where n.nspname='public' and a.attnum>0 and not a.attisdropped
order by c.relname,a.attnum;
select conrelid::regclass table_name,conname,pg_get_constraintdef(oid) definition from pg_constraint where connamespace='public'::regnamespace order by conrelid::regclass::text,conname;
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname;
select event_object_table,trigger_name,action_timing,event_manipulation,action_statement from information_schema.triggers where trigger_schema='public';
select id,public,file_size_limit,allowed_mime_types from storage.buckets;
select * from pg_publication_tables where pubname='supabase_realtime';
