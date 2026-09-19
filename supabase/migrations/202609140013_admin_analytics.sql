begin;
create or replace function public.worksync_admin_analytics(p_from timestamptz,p_to timestamptz,p_status text default 'all') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; categories jsonb; activity jsonb;
begin
 if not public.worksync_is_admin() then raise exception 'Administrator access required'; end if;
 if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>interval '5 years' or p_status is null then raise exception 'Choose a date range of at most five years'; end if;
 with projects as (select * from public.projects where created_at>=p_from and created_at<p_to and (p_status='all' or status::text=p_status)),
 counts as (
 select 'users' k,count(*) v from public."Users" where created_at>=p_from and created_at<p_to
 union all select 'clients',count(*) from public.client_profiles where created_at>=p_from and created_at<p_to
 union all select 'freelancers',count(*) from public.freelancer_profiles where created_at>=p_from and created_at<p_to
 union all select 'jobs',count(*) from public.jobs where created_at>=p_from and created_at<p_to
 union all select 'services',count(*) from public.services where created_at>=p_from and created_at<p_to
 union all select 'applications',count(*) from public.job_applications where created_at>=p_from and created_at<p_to
 union all select 'service_orders',count(*) from public.service_orders where created_at>=p_from and created_at<p_to
 union all select 'projects',count(*) from projects
 union all select 'completed_projects',count(*) from projects where status::text='completed'
 union all select 'cancelled_projects',count(*) from projects where status::text='cancelled'
 union all select 'reports',count(*) from public.listing_reports where created_at>=p_from and created_at<p_to
 union all select 'verification_requests',count(*) from public.verification_requests where created_at>=p_from and created_at<p_to
 union all select 'reviews',count(*) from public.reviews where created_at>=p_from and created_at<p_to
 union all select 'transactions',count(*) from public.payments where created_at>=p_from and created_at<p_to
 union all select 'disputes',count(*) from public.project_disputes where created_at>=p_from and created_at<p_to
 ) select jsonb_build_object('counts',(select jsonb_object_agg(k,v) from counts),
 'completion_rate',(select round(100.0*count(*) filter(where status::text='completed')/nullif(count(*),0),1) from projects),
 'average_project_value',(select round(avg(budget)::numeric,2) from projects),
 'average_rating',(select round(avg(rating)::numeric,2) from public.reviews where created_at>=p_from and created_at<p_to)) into result;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into categories from (
 select c.name,(select count(*) from public.jobs j where j.category_id=c.id and j.created_at>=p_from and j.created_at<p_to) jobs,
 (select count(*) from public.services s where s.category_id=c.id and s.created_at>=p_from and s.created_at<p_to) services
 from public.job_categories c order by c.name) x;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.month),'[]'::jsonb) into activity from (
 select to_char(d,'YYYY-MM') month,
 (select count(*) from public."Users" u where u.created_at>=greatest(d,p_from) and u.created_at<least(d+interval '1 month',p_to)) users,
 (select count(*) from public.projects p where p.created_at>=greatest(d,p_from) and p.created_at<least(d+interval '1 month',p_to) and (p_status='all' or p.status::text=p_status)) projects
 from generate_series(date_trunc('month',p_from),date_trunc('month',p_to-interval '1 microsecond'),interval '1 month') d) x;
 return result||jsonb_build_object('categories',categories,'activity',activity);
end; $$;
revoke all on function public.worksync_admin_analytics(timestamptz,timestamptz,text) from public;
grant execute on function public.worksync_admin_analytics(timestamptz,timestamptz,text) to authenticated;
commit;
