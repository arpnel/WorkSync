-- PREPARED, NOT APPLIED.
-- Restore the original skill tables, constraints, access rules, and data split.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
lock table public.listing_skills in access exclusive mode;

create table public.job_skills (
  job_id uuid not null references public.jobs(job_id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint job_skills_pkey primary key (job_id, skill_id)
);
alter table public.job_skills owner to postgres;
alter table public.job_skills enable row level security;
revoke all privileges on table public.job_skills from public, anon, authenticated, service_role;
grant all privileges on table public.job_skills to authenticated, service_role;
create policy job_skills_all on public.job_skills for all to authenticated
  using (exists (
    select 1 from public.jobs j where j.job_id = job_skills.job_id
      and (public.is_client_owner(j.client_id) or public.is_admin())
  ))
  with check (exists (
    select 1 from public.jobs j where j.job_id = job_skills.job_id
      and (public.is_client_owner(j.client_id) or public.is_admin())
  ));

create table public.service_skills (
  service_id uuid not null references public.services(service_id),
  skill_id uuid not null references public.skills(id) on delete cascade,
  constraint service_skills_pkey primary key (service_id, skill_id)
);
alter table public.service_skills owner to postgres;
create index idx_service_skills_skill_id on public.service_skills(skill_id);
alter table public.service_skills enable row level security;
revoke all privileges on table public.service_skills from public, anon, authenticated, service_role;
grant select on table public.service_skills to anon;
grant all privileges on table public.service_skills to authenticated, service_role;
create policy service_skills_owner_delete on public.service_skills for delete to authenticated
  using (exists (
    select 1 from public.services s
    join public.freelancer_profiles fp on fp.freelancer_id = s.freelancer_id
    where s.service_id = service_skills.service_id and fp.user_id = (select auth.uid())
  ));
create policy service_skills_owner_insert on public.service_skills for insert to authenticated
  with check (exists (
    select 1 from public.services s
    join public.freelancer_profiles fp on fp.freelancer_id = s.freelancer_id
    where s.service_id = service_skills.service_id and fp.user_id = (select auth.uid())
  ));
create policy service_skills_public_select on public.service_skills for select to anon, authenticated
  using (exists (
    select 1 from public.services s where s.service_id = service_skills.service_id
      and s.status = 'Active'::public.service_status and s.is_archived = false
  ));

insert into public.job_skills(job_id, skill_id, created_at)
select job_id, skill_id, created_at from public.listing_skills where listing_type = 'job';
insert into public.service_skills(service_id, skill_id)
select service_id, skill_id from public.listing_skills where listing_type = 'service';

do $$ begin
  if (select count(*) from public.job_skills)
       <> (select count(*) from public.listing_skills where listing_type = 'job')
     or (select count(*) from public.service_skills)
       <> (select count(*) from public.listing_skills where listing_type = 'service')
     or exists (
       select 1 from public.listing_skills l left join public.job_skills j
         on j.job_id = l.job_id and j.skill_id = l.skill_id
       where l.listing_type = 'job' and (j.job_id is null or j.created_at is distinct from l.created_at)
     )
     or exists (
       select 1 from public.listing_skills l left join public.service_skills s
         on s.service_id = l.service_id and s.skill_id = l.skill_id
       where l.listing_type = 'service' and s.service_id is null
     ) then
    raise exception 'Skill rollback data verification failed';
  end if;
end $$;

create or replace function public.worksync_guard_listing_child_edit()
returns trigger language plpgsql security definer set search_path to ''
as $function$
declare kind text; target_listing_id uuid; old_listing_id uuid; review_status text;
begin
  if tg_table_name = 'job_skills' then
    kind := 'job';
    if tg_op = 'DELETE' then target_listing_id := old.job_id;
    else target_listing_id := new.job_id; if tg_op = 'UPDATE' then old_listing_id := old.job_id; end if;
    end if;
  else
    kind := 'service';
    if tg_op = 'DELETE' then target_listing_id := old.service_id;
    else target_listing_id := new.service_id; if tg_op = 'UPDATE' then old_listing_id := old.service_id; end if;
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
    join public.service_skills ss on ss.service_id = s.service_id
    where s.sample_number <= case when t.total_count > 100 then 1 else 2 end
    group by s.category_id
  )
  select c.id, c.name, counts.listing_count, coalesce(skills.subcategory_ids, '{}'::uuid[])
  from category_counts counts join public.job_categories c on c.id = counts.category_id
  left join sampled_skills skills on skills.category_id = counts.category_id
  order by c.name;
$function$;

drop trigger worksync_guard_listing_skills_edit on public.listing_skills;
drop table public.listing_skills;
create trigger worksync_guard_job_skills_edit before insert or delete or update
  on public.job_skills for each row execute function public.worksync_guard_listing_child_edit();
create trigger worksync_guard_service_skills_edit before insert or delete or update
  on public.service_skills for each row execute function public.worksync_guard_listing_child_edit();

notify pgrst, 'reload schema';
commit;
