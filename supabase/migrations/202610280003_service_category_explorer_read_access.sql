-- PREPARED, NOT APPLIED.
-- Keep the category explorer caller-scoped and RLS-protected while granting
-- only the service columns it reads. Counts and samples include public listings
-- only, even when authenticated-user RLS also exposes owner/participant rows.
begin;

grant select (service_id, category_id, created_at, status, is_archived)
  on table public.services to anon, authenticated;

create or replace function public.worksync_service_category_explorer()
returns table(
  category_id uuid,
  category_name text,
  listing_count bigint,
  subcategory_ids uuid[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  with active_services as materialized (
    select s.service_id, s.category_id, s.created_at
    from public.services s
    where s.status = 'Active'
      and s.is_archived = false
      and s.category_id is not null
      and public.worksync_listing_visible('service', s.service_id)
  ), category_counts as (
    select s.category_id, count(*)::bigint as listing_count
    from active_services s
    group by s.category_id
  ), totals as (
    select coalesce(sum(c.listing_count), 0)::bigint as total_count
    from category_counts c
  ), sampled_services as (
    select s.service_id, s.category_id,
      row_number() over (
        partition by s.category_id
        order by s.created_at desc, s.service_id
      ) as sample_number
    from active_services s
  ), sampled_skills as (
    select s.category_id,
      array_agg(distinct ss.skill_id order by ss.skill_id) as subcategory_ids
    from sampled_services s
    cross join totals t
    join public.service_skills ss on ss.service_id = s.service_id
    where s.sample_number <= case when t.total_count > 100 then 1 else 2 end
    group by s.category_id
  )
  select c.id, c.name, counts.listing_count,
    coalesce(skills.subcategory_ids, '{}'::uuid[])
  from category_counts counts
  join public.job_categories c on c.id = counts.category_id
  left join sampled_skills skills on skills.category_id = counts.category_id
  order by c.name;
$$;

revoke all on function public.worksync_service_category_explorer()
  from public;
grant execute on function public.worksync_service_category_explorer()
  to anon, authenticated;

commit;
