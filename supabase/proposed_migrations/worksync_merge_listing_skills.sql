-- Merge job_skills and service_skills while retaining listing FKs and access rules.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
lock table public.job_skills, public.service_skills in access exclusive mode;

do $$ begin
  if to_regclass('public.listing_skills') is not null then
    raise exception 'public.listing_skills already exists';
  end if;
end $$;

create table public.listing_skills (
  listing_skill_id uuid not null default gen_random_uuid(),
  listing_type text not null,
  job_id uuid,
  service_id uuid,
  skill_id uuid not null,
  created_at timestamptz not null default now(),
  constraint listing_skills_pkey primary key (listing_skill_id),
  constraint listing_skills_type_shape_check check (
    (listing_type = 'job' and job_id is not null and service_id is null)
    or (listing_type = 'service' and job_id is null and service_id is not null)
  ),
  constraint listing_skills_job_id_fkey foreign key (job_id)
    references public.jobs(job_id) on delete cascade,
  constraint listing_skills_service_id_fkey foreign key (service_id)
    references public.services(service_id),
  constraint listing_skills_skill_id_fkey foreign key (skill_id)
    references public.skills(id) on delete cascade
);
alter table public.listing_skills owner to postgres;
create unique index listing_skills_job_skill_key
  on public.listing_skills(job_id, skill_id) where listing_type = 'job';
create unique index listing_skills_service_skill_key
  on public.listing_skills(service_id, skill_id) where listing_type = 'service';
create index listing_skills_skill_id_idx on public.listing_skills(skill_id);

alter table public.listing_skills enable row level security;
revoke all privileges on table public.listing_skills from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.listing_skills to authenticated;
grant select on table public.listing_skills to anon;
grant all privileges on table public.listing_skills to service_role;

create policy listing_skills_job_owner_all on public.listing_skills
  for all to authenticated
  using (listing_type = 'job' and exists (
    select 1 from public.jobs j where j.job_id = listing_skills.job_id
      and (public.is_client_owner(j.client_id) or public.is_admin())
  ))
  with check (listing_type = 'job' and exists (
    select 1 from public.jobs j where j.job_id = listing_skills.job_id
      and (public.is_client_owner(j.client_id) or public.is_admin())
  ));
create policy listing_skills_service_public_select on public.listing_skills
  for select to anon, authenticated
  using (listing_type = 'service' and exists (
    select 1 from public.services s where s.service_id = listing_skills.service_id
      and s.status = 'Active'::public.service_status and s.is_archived = false
  ));
create policy listing_skills_service_owner_insert on public.listing_skills
  for insert to authenticated
  with check (listing_type = 'service' and exists (
    select 1 from public.services s
    join public.freelancer_profiles fp on fp.freelancer_id = s.freelancer_id
    where s.service_id = listing_skills.service_id and fp.user_id = (select auth.uid())
  ));
create policy listing_skills_service_owner_delete on public.listing_skills
  for delete to authenticated
  using (listing_type = 'service' and exists (
    select 1 from public.services s
    join public.freelancer_profiles fp on fp.freelancer_id = s.freelancer_id
    where s.service_id = listing_skills.service_id and fp.user_id = (select auth.uid())
  ));

do $$
declare jobs_before bigint := (select count(*) from public.job_skills);
        services_before bigint := (select count(*) from public.service_skills);
begin
  insert into public.listing_skills(listing_type, job_id, skill_id, created_at)
    select 'job', job_id, skill_id, created_at from public.job_skills;
  insert into public.listing_skills(listing_type, service_id, skill_id)
    select 'service', service_id, skill_id from public.service_skills;
  if (select count(*) from public.listing_skills where listing_type = 'job') <> jobs_before
     or (select count(*) from public.listing_skills where listing_type = 'service') <> services_before
     or exists (
       select 1 from public.job_skills j left join public.listing_skills l
         on l.listing_type = 'job' and l.job_id = j.job_id and l.skill_id = j.skill_id
       where l.listing_skill_id is null or l.created_at is distinct from j.created_at
     )
     or exists (
       select 1 from public.service_skills s left join public.listing_skills l
         on l.listing_type = 'service' and l.service_id = s.service_id and l.skill_id = s.skill_id
       where l.listing_skill_id is null
     ) then
    raise exception 'Listing skill data verification failed';
  end if;
end $$;

create or replace function public.worksync_guard_listing_child_edit()
returns trigger language plpgsql security definer set search_path to ''
as $function$
declare kind text; target_listing_id uuid; old_listing_id uuid; review_status text;
begin
  if tg_op = 'DELETE' then
    kind := old.listing_type;
    target_listing_id := coalesce(old.job_id, old.service_id);
  else
    kind := new.listing_type;
    target_listing_id := coalesce(new.job_id, new.service_id);
    if tg_op = 'UPDATE' then
      if old.listing_type is distinct from new.listing_type then
        raise exception 'A skill cannot be moved between listing kinds';
      end if;
      old_listing_id := coalesce(old.job_id, old.service_id);
    end if;
  end if;
  if old_listing_id is not null and old_listing_id is distinct from target_listing_id then
    select status into review_status from public.listing_submissions
    where listing_type = kind and listing_id = old_listing_id for update;
    if review_status is distinct from 'editing' then
      raise exception 'Listing details cannot be moved from a listing outside its edit workflow';
    end if;
  end if;
  select status into review_status from public.listing_submissions
  where listing_type = kind and listing_id = target_listing_id for update;
  if review_status is distinct from 'editing' then
    raise exception 'Listing details cannot be edited unless the listing is in its edit workflow';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

create or replace function public.worksync_service_category_explorer()
returns table(category_id uuid, category_name text, listing_count bigint, subcategory_ids uuid[])
language sql stable set search_path to ''
as $function$
  with active_services as materialized (
    select s.service_id, s.category_id, s.created_at from public.services s
    where s.status = 'Active' and s.is_archived = false and s.category_id is not null
      and public.worksync_listing_visible('service', s.service_id)
  ), category_counts as (
    select s.category_id, count(*)::bigint as listing_count from active_services s group by s.category_id
  ), totals as (
    select coalesce(sum(c.listing_count), 0)::bigint as total_count from category_counts c
  ), sampled_services as (
    select s.service_id, s.category_id,
      row_number() over (partition by s.category_id order by s.created_at desc, s.service_id) as sample_number
    from active_services s
  ), sampled_skills as (
    select s.category_id, array_agg(distinct ss.skill_id order by ss.skill_id) as subcategory_ids
    from sampled_services s cross join totals t
    join public.listing_skills ss on ss.service_id = s.service_id and ss.listing_type = 'service'
    where s.sample_number <= case when t.total_count > 100 then 1 else 2 end
    group by s.category_id
  )
  select c.id, c.name, counts.listing_count, coalesce(skills.subcategory_ids, '{}'::uuid[])
  from category_counts counts join public.job_categories c on c.id = counts.category_id
  left join sampled_skills skills on skills.category_id = counts.category_id
  order by c.name;
$function$;

drop table public.job_skills;
drop table public.service_skills;
create trigger worksync_guard_listing_skills_edit
  before insert or update or delete on public.listing_skills
  for each row execute function public.worksync_guard_listing_child_edit();

notify pgrst, 'reload schema';
commit;
