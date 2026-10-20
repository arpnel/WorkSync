-- PREPARED, NOT APPLIED. Adds admin-configurable skill assessment audiences.
-- Existing openings keep the current category-only, 30-day eligibility rules.
-- Review the deployed assessment schema/RPCs and enum-independent constraints before applying.
begin;

alter table public.skill_assessment_openings
  add column audience_scope text not null default 'category'
    check (audience_scope in ('category', 'all_freelancers')),
  add column minimum_account_age_days integer not null default 30
    check (minimum_account_age_days between 0 and 3650);

create or replace function public.worksync_skill_assessment_eligible_count(
  p_category uuid,
  p_audience_scope text,
  p_minimum_account_age_days integer
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare eligible integer;
begin
  if auth.uid() is null or public.worksync_is_admin() is distinct from true then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  if p_audience_scope is null or p_audience_scope not in ('category', 'all_freelancers')
     or p_minimum_account_age_days is null
     or p_minimum_account_age_days not between 0 and 3650 then
    raise exception 'Invalid assessment audience settings' using errcode='22023';
  end if;
  if not exists(select 1 from public.job_categories where id=p_category) then
    raise exception 'Category not found';
  end if;

  select count(distinct u.user_id)::integer into eligible
  from public."Users" u
  join public.freelancer_profiles f using(user_id)
  left join public.freelancer_categories fc on fc.freelancer_id=f.freelancer_id
  where u.role::text='freelancer'
    and u.created_at <= now() - make_interval(days => p_minimum_account_age_days)
    and public.worksync_marketplace_active(u.user_id)
    and (p_audience_scope='all_freelancers' or fc.category_id=p_category);

  return jsonb_build_object('count', coalesce(eligible,0));
end; $$;
revoke all on function public.worksync_skill_assessment_eligible_count(uuid,text,integer) from public,anon;
grant execute on function public.worksync_skill_assessment_eligible_count(uuid,text,integer) to authenticated;

create or replace function public.worksync_open_skill_assessment(
  p_category uuid,
  p_expected_version integer,
  p_opening uuid,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_audience_scope text,
  p_minimum_account_age_days integer
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.skill_assessments; existing public.skill_assessment_openings; starts timestamptz; eligible integer;
begin
  if auth.uid() is null or public.worksync_is_admin() is distinct from true then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  if p_audience_scope is null or p_audience_scope not in ('category', 'all_freelancers')
     or p_minimum_account_age_days is null
     or p_minimum_account_age_days not between 0 and 3650 then
    raise exception 'Invalid assessment audience settings' using errcode='22023';
  end if;

  perform 1 from public.job_categories where id=p_category for update;
  if not found then raise exception 'Category not found'; end if;

  select * into existing from public.skill_assessment_openings where opening_id=p_opening;
  if found then
    if existing.category_id is distinct from p_category
       or existing.opened_by is distinct from auth.uid()
       or existing.audience_scope is distinct from p_audience_scope
       or existing.minimum_account_age_days is distinct from p_minimum_account_age_days
       or existing.closes_at is distinct from p_closes_at then
      raise exception 'Opening ID conflict';
    end if;
    return jsonb_build_object(
      'id', existing.opening_id,
      'reused', true,
      'eligible', (select count(*) from public.skill_assessment_eligible where opening_id=existing.opening_id)
    );
  end if;

  select * into d from public.skill_assessments where category_id=p_category for update;
  if not found then raise exception 'Save an assessment first'; end if;
  if d.version is distinct from p_expected_version then
    raise exception 'Draft changed. Reload before opening.' using errcode='40001';
  end if;
  perform public.worksync_validate_skill_quiz(d.quiz,p_category);

  starts:=greatest(now(),coalesce(p_opens_at,now()));
  if p_closes_at is null or p_closes_at<=starts or p_closes_at>now()+interval '180 days' then
    raise exception 'Choose a closing time after opening and within 180 days';
  end if;
  if exists(
    select 1 from public.skill_assessment_openings
    where category_id=p_category and status='open' and closes_at>now()
  ) then
    raise exception 'Close the current assessment opening before publishing another';
  end if;

  select count(distinct u.user_id)::integer into eligible
  from public."Users" u
  join public.freelancer_profiles f using(user_id)
  left join public.freelancer_categories fc on fc.freelancer_id=f.freelancer_id
  where u.role::text='freelancer'
    and u.created_at <= now() - make_interval(days => p_minimum_account_age_days)
    and public.worksync_marketplace_active(u.user_id)
    and (p_audience_scope='all_freelancers' or fc.category_id=p_category);
  if coalesce(eligible,0)=0 then
    raise exception 'No active freelancers match these audience settings';
  end if;

  update public.skill_assessment_openings
  set status='closed', closed_at=closes_at
  where category_id=p_category and status='open' and closes_at<=now();

  insert into public.skill_assessment_openings(
    opening_id,assessment_id,category_id,category_name,version,quiz,opened_by,
    opens_at,closes_at,audience_scope,minimum_account_age_days
  )
  select p_opening,d.assessment_id,p_category,c.name,d.version,d.quiz,auth.uid(),
    starts,p_closes_at,p_audience_scope,p_minimum_account_age_days
  from public.job_categories c where c.id=p_category;

  insert into public.skill_assessment_eligible(opening_id,user_id,freelancer_id)
  select p_opening,u.user_id,f.freelancer_id
  from public."Users" u
  join public.freelancer_profiles f using(user_id)
  left join public.freelancer_categories fc on fc.freelancer_id=f.freelancer_id
  where u.role::text='freelancer'
    and u.created_at <= now() - make_interval(days => p_minimum_account_age_days)
    and public.worksync_marketplace_active(u.user_id)
    and (p_audience_scope='all_freelancers' or fc.category_id=p_category)
  on conflict(opening_id,user_id) do nothing;

  insert into public.notifications(user_id,type,title,message,related_id,is_read)
  select e.user_id,'skill_assessment',c.name||' Skill Assessment Available',
    'A WorkSync '||c.name||' Skill Assessment is available from '||
    to_char(starts at time zone 'UTC','YYYY-MM-DD HH24:MI')||' UTC until '||
    to_char(p_closes_at at time zone 'UTC','YYYY-MM-DD HH24:MI')||' UTC. Complete it to demonstrate category knowledge.',
    p_opening,false
  from public.skill_assessment_eligible e
  join public.job_categories c on c.id=p_category
  where e.opening_id=p_opening;

  return jsonb_build_object(
    'id',p_opening,
    'eligible',(select count(*) from public.skill_assessment_eligible where opening_id=p_opening)
  );
end; $$;
revoke all on function public.worksync_open_skill_assessment(uuid,integer,uuid,timestamptz,timestamptz,text,integer) from public,anon;
grant execute on function public.worksync_open_skill_assessment(uuid,integer,uuid,timestamptz,timestamptz,text,integer) to authenticated;

create or replace function public.worksync_skill_assessment_opening_settings(p_openings uuid[])
returns table(
  "openingId" uuid,
  "audienceScope" text,
  "minimumAccountAgeDays" integer,
  "eligibleCount" integer
)
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or public.worksync_is_admin() is distinct from true then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  return query
  select o.opening_id,o.audience_scope,o.minimum_account_age_days,count(e.user_id)::integer
  from public.skill_assessment_openings o
  left join public.skill_assessment_eligible e using(opening_id)
  where o.opening_id=any(coalesce(p_openings,'{}'::uuid[]))
  group by o.opening_id,o.audience_scope,o.minimum_account_age_days;
end; $$;
revoke all on function public.worksync_skill_assessment_opening_settings(uuid[]) from public,anon;
grant execute on function public.worksync_skill_assessment_opening_settings(uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;