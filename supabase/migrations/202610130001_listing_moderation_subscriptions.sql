-- WorkSync listing safety, moderation and provisional subscription limits.
-- PREPARED ONLY: review and apply through the existing Supabase migration workflow.
-- Requires existing jobs/services, user profiles, notifications, admin_members,
-- and worksync_is_admin() from the earlier core/admin migrations.
begin;
create table if not exists public.subscription_plans (
  plan_code text primary key check(plan_code in ('free','pro','pro_plus')),
  display_name text not null,
  monthly_job_limit integer not null check(monthly_job_limit > 0),
  monthly_service_limit integer not null check(monthly_service_limit > 0),
  active_job_limit integer not null check(active_job_limit > 0),
  active_service_limit integer not null check(active_service_limit > 0),
  provisional_monthly_price numeric(10,2),
  updated_at timestamptz not null default now()
);
insert into public.subscription_plans(plan_code,display_name,monthly_job_limit,monthly_service_limit,active_job_limit,active_service_limit,provisional_monthly_price)
values ('free','Free',3,3,3,3,0),('pro','Pro',15,15,10,10,null),('pro_plus','Pro Plus',40,40,25,25,null)
on conflict(plan_code) do nothing;
alter table public.subscription_plans enable row level security;
drop policy if exists subscription_plans_read on public.subscription_plans;
create policy subscription_plans_read on public.subscription_plans for select to anon,authenticated using(true);
grant select on public.subscription_plans to anon,authenticated;

create table if not exists public.user_subscriptions (
  user_id uuid primary key references public."Users"(user_id) on delete cascade,
  plan_code text not null default 'free' references public.subscription_plans(plan_code),
  period_started_at timestamptz not null default date_trunc('month',now()),
  period_ends_at timestamptz not null default (date_trunc('month',now()) + interval '1 month'),
  updated_at timestamptz not null default now()
);
insert into public.user_subscriptions(user_id) select user_id from public."Users" on conflict(user_id) do nothing;
alter table public.user_subscriptions enable row level security;
drop policy if exists user_subscriptions_owner_read on public.user_subscriptions;
create policy user_subscriptions_owner_read on public.user_subscriptions for select to authenticated using(user_id=auth.uid() or public.worksync_is_admin());
revoke all on public.user_subscriptions from anon,authenticated;
grant select on public.user_subscriptions to authenticated;


create or replace function public.worksync_assign_free_subscription()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.role::text in ('client','freelancer') then
  insert into public.user_subscriptions(user_id,plan_code) values(new.user_id,'free') on conflict(user_id) do nothing;
 end if;
 return new;
end; $$;
revoke all on function public.worksync_assign_free_subscription() from public;
drop trigger if exists worksync_assign_free_subscription on public."Users";
create trigger worksync_assign_free_subscription after insert on public."Users" for each row execute function public.worksync_assign_free_subscription();
create table if not exists public.listing_submissions (
  submission_id uuid primary key default gen_random_uuid(),
  listing_type text not null check(listing_type in ('job','service')),
  listing_id uuid not null,
  owner_id uuid not null references public."Users"(user_id),
  title text not null,
  description text not null,
  status text not null default 'pending_review' check(status in ('pending_review','manual_review','approved','rejected')),
  ai_risk text check(ai_risk is null or ai_risk in ('low','medium','high','critical')),
  ai_explanation text,
  ai_categories jsonb not null default '[]'::jsonb,
  ai_evidence jsonb not null default '[]'::jsonb,
  ai_confidence numeric(4,3) check(ai_confidence is null or ai_confidence between 0 and 1),
  ai_recommendation text check(ai_recommendation is null or ai_recommendation in ('approve_for_review','flag_for_review','recommend_rejection')),
  decision text,
  failure_reason text,
  assessment_started_at timestamptz,
  assessed_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(listing_type,listing_id)
);
create index if not exists listing_submissions_queue on public.listing_submissions(status,created_at desc);
create index if not exists listing_submissions_owner_month on public.listing_submissions(owner_id,created_at desc);
alter table public.listing_submissions enable row level security;
drop policy if exists listing_submissions_read on public.listing_submissions;
create policy listing_submissions_read on public.listing_submissions for select to authenticated using(owner_id=auth.uid() or public.worksync_is_admin());
revoke all on public.listing_submissions from anon,authenticated;
grant select on public.listing_submissions to authenticated;
grant select,update on public.listing_submissions to service_role;
grant insert on public.notifications to service_role;

create table if not exists public.listing_moderation_events (
  event_id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.listing_submissions(submission_id),
  actor_id uuid references public."Users"(user_id),
  actor_kind text not null check(actor_kind in ('system','admin')),
  action text not null,
  category text,
  explanation text not null,
  created_at timestamptz not null default now()
);
create index if not exists listing_moderation_events_history on public.listing_moderation_events(submission_id,created_at desc);
alter table public.listing_moderation_events enable row level security;
drop policy if exists listing_moderation_events_read on public.listing_moderation_events;
create policy listing_moderation_events_read on public.listing_moderation_events for select to authenticated using(public.worksync_is_admin() or exists(select 1 from public.listing_submissions s where s.submission_id=listing_moderation_events.submission_id and s.owner_id=auth.uid()));
revoke all on public.listing_moderation_events from anon,authenticated;
grant select on public.listing_moderation_events to authenticated;

-- Existing published listings are grandfathered as approved; history is preserved.
insert into public.listing_submissions(listing_type,listing_id,owner_id,title,description,status,created_at,archived_at,assessment_started_at,assessed_at)
select 'job',j.job_id,c.user_id,j.title,j.description,'approved',j.created_at,case when j.is_archived then j.updated_at end,j.created_at,j.created_at
from public.jobs j join public.client_profiles c using(client_id)
on conflict(listing_type,listing_id) do nothing;
insert into public.listing_submissions(listing_type,listing_id,owner_id,title,description,status,created_at,archived_at,assessment_started_at,assessed_at)
select 'service',s.service_id,f.user_id,s.title,s.description,'approved',s.created_at,case when s.is_archived then s.updated_at end,s.created_at,s.created_at
from public.services s join public.freelancer_profiles f using(freelancer_id)
on conflict(listing_type,listing_id) do nothing;

create or replace function public.worksync_capture_listing_submission()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid; plan text; monthly_cap integer; used bigint; duplicate_found boolean; kind text;
begin
 if tg_table_name='jobs' then kind:='job'; select user_id into owner from public.client_profiles where client_id=new.client_id;
 else kind:='service'; select user_id into owner from public.freelancer_profiles where freelancer_id=new.freelancer_id; end if;
 if owner is null then raise exception 'Complete the owner profile before posting'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
 insert into public.user_subscriptions(user_id) values(owner) on conflict(user_id) do nothing;
 select plan_code into plan from public.user_subscriptions where user_id=owner;
 select case when kind='job' then monthly_job_limit else monthly_service_limit end into monthly_cap from public.subscription_plans where plan_code=plan;
 select count(*) into used from public.listing_submissions where owner_id=owner and listing_type=kind and created_at>=date_trunc('month',now()) and created_at<date_trunc('month',now())+interval '1 month';
 if used>=monthly_cap then raise exception 'Monthly % submission limit reached for the % plan',kind,plan using errcode='P0001'; end if;
 select exists(select 1 from public.listing_submissions s where s.owner_id=owner and s.listing_type=kind and s.created_at>=now()-interval '30 days' and lower(regexp_replace(s.title||s.description,'[[:space:][:punct:]]','','g'))=lower(regexp_replace(new.title||new.description,'[[:space:][:punct:]]','','g'))) into duplicate_found;
 if duplicate_found then raise exception 'A substantially identical listing was submitted recently. Edit the existing listing or contact an administrator.' using errcode='P0001'; end if;
 insert into public.listing_submissions(listing_type,listing_id,owner_id,title,description,status)
 values(kind,case when kind='job' then new.job_id else new.service_id end,owner,new.title,new.description,'pending_review');
 return new;
end; $$;
revoke all on function public.worksync_capture_listing_submission() from public;
drop trigger if exists jobs_capture_submission on public.jobs;
create trigger jobs_capture_submission after insert on public.jobs for each row execute function public.worksync_capture_listing_submission();
drop trigger if exists services_capture_submission on public.services;
create trigger services_capture_submission after insert on public.services for each row execute function public.worksync_capture_listing_submission();

create or replace function public.worksync_listing_visible(p_kind text,p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.listing_moderation m where m.listing_type=p_kind and m.listing_id=p_id and m.hidden)
 and not exists(select 1 from public.listing_submissions s where s.listing_type=p_kind and s.listing_id=p_id and (s.status<>'approved' or s.archived_at is not null));
$$;
revoke all on function public.worksync_listing_visible(text,uuid) from public;
grant execute on function public.worksync_listing_visible(text,uuid) to anon,authenticated;

create or replace function public.worksync_admin_decide_listing(p_submission uuid,p_action text,p_category text,p_explanation text)
returns void language plpgsql security definer set search_path='' as $$
declare row_data public.listing_submissions%rowtype; cap integer; active_count bigint;
begin
 if not public.worksync_is_admin() then raise exception 'Administrator access required'; end if;
 if p_action not in ('approve','reject','flag') then raise exception 'Invalid moderation action'; end if;
 if p_action='reject' and (length(trim(coalesce(p_explanation,'')))<12 or length(trim(coalesce(p_category,'')))<2) then raise exception 'A rejection category and meaningful explanation are required'; end if;
 select * into row_data from public.listing_submissions where submission_id=p_submission for update;
 if not found then raise exception 'Submission not found'; end if;
 if p_action='approve' then
   if row_data.listing_type='job' then
    select active_job_limit into cap from public.subscription_plans p join public.user_subscriptions u using(plan_code) where u.user_id=row_data.owner_id;
    select count(*) into active_count from public.listing_submissions s join public.jobs j on j.job_id=s.listing_id where s.owner_id=row_data.owner_id and s.listing_type='job' and s.status='approved' and s.archived_at is null and j.is_archived=false;
   else
    select active_service_limit into cap from public.subscription_plans p join public.user_subscriptions u using(plan_code) where u.user_id=row_data.owner_id;
    select count(*) into active_count from public.listing_submissions s join public.services v on v.service_id=s.listing_id where s.owner_id=row_data.owner_id and s.listing_type='service' and s.status='approved' and s.archived_at is null and v.is_archived=false;
   end if;
   if coalesce(active_count,0)>=coalesce(cap,0) then raise exception 'Owner has reached the active listing limit'; end if;
 end if;
 update public.listing_submissions set status=case when p_action='approve' then 'approved' when p_action='reject' then 'rejected' else 'manual_review' end,decision='administrator_'||p_action where submission_id=p_submission;
 insert into public.listing_moderation_events(submission_id,actor_id,actor_kind,action,category,explanation) values(p_submission,auth.uid(),'admin',p_action,nullif(trim(p_category),''),trim(coalesce(p_explanation,'')));
 if p_action in ('approve','reject') then
  insert into public.notifications(user_id,type,title,message,related_id,is_read) values(row_data.owner_id,'listing_moderation',case when p_action='approve' then 'Listing approved' else 'Listing rejected' end,case when p_action='approve' then '“'||row_data.title||'” was approved and is now eligible for marketplace display.' else '“'||row_data.title||'” was rejected ('||trim(p_category)||'): '||trim(p_explanation)||' You may edit and resubmit it or request an administrator review.' end,row_data.listing_id,false);
 end if;
end; $$;
revoke all on function public.worksync_admin_decide_listing(uuid,text,text,text) from public,anon;
grant execute on function public.worksync_admin_decide_listing(uuid,text,text,text) to authenticated;

-- Archive/restore keeps the same submission record and applies active limits atomically.
create or replace function public.worksync_guard_listing_archive()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid; active_count bigint; active_cap integer; current_plan text; status_now text;
begin
 if old.is_archived is not distinct from new.is_archived then return new; end if;
 if tg_table_name='jobs' then select user_id into owner from public.client_profiles where client_id=new.client_id;
 else select user_id into owner from public.freelancer_profiles where freelancer_id=new.freelancer_id; end if;
 if auth.uid() is distinct from owner and not public.worksync_is_admin() then raise exception 'Only the listing owner can archive or restore this listing'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
 if new.is_archived then
  if tg_table_name='jobs' and exists(select 1 from public.job_applications a where a.job_id=new.job_id and a.status::text='accepted') then raise exception 'Resolve accepted applications before archiving this job'; end if;
  if tg_table_name='services' and exists(select 1 from public.service_orders o where o.service_id=new.service_id and o.status::text in ('accepted','converted')) then raise exception 'Complete or resolve active service orders before archiving this service'; end if;
  update public.listing_submissions set archived_at=now() where listing_type=case when tg_table_name='jobs' then 'job' else 'service' end and listing_id=case when tg_table_name='jobs' then new.job_id else new.service_id end;
  insert into public.listing_moderation_events(submission_id,actor_id,actor_kind,action,explanation) select submission_id,auth.uid(),'system','archived','Owner archived the listing.' from public.listing_submissions where listing_type=case when tg_table_name='jobs' then 'job' else 'service' end and listing_id=case when tg_table_name='jobs' then new.job_id else new.service_id end;
 else
  select status into status_now from public.listing_submissions where listing_type=case when tg_table_name='jobs' then 'job' else 'service' end and listing_id=case when tg_table_name='jobs' then new.job_id else new.service_id end for update;
  if status_now is distinct from 'approved' then raise exception 'Only approved listings can be restored; contact an administrator for review'; end if;
  insert into public.user_subscriptions(user_id) values(owner) on conflict(user_id) do nothing;
  select plan_code into current_plan from public.user_subscriptions where user_id=owner;
  if tg_table_name='jobs' then
   select active_job_limit into active_cap from public.subscription_plans where plan_code=current_plan;
   select count(*) into active_count from public.jobs j join public.listing_submissions s on s.listing_type='job' and s.listing_id=j.job_id where s.owner_id=owner and s.status='approved' and j.is_archived=false;
  else
   select active_service_limit into active_cap from public.subscription_plans where plan_code=current_plan;
   select count(*) into active_count from public.services v join public.listing_submissions s on s.listing_type='service' and s.listing_id=v.service_id where s.owner_id=owner and s.status='approved' and v.is_archived=false;
  end if;
  if coalesce(active_count,0)>=coalesce(active_cap,0) then raise exception 'Active listing limit reached. Archive an active listing or change plans before restoring'; end if;
  update public.listing_submissions set archived_at=null where listing_type=case when tg_table_name='jobs' then 'job' else 'service' end and listing_id=case when tg_table_name='jobs' then new.job_id else new.service_id end;
  insert into public.listing_moderation_events(submission_id,actor_id,actor_kind,action,explanation) select submission_id,auth.uid(),'system','restored','Owner restored the approved listing.' from public.listing_submissions where listing_type=case when tg_table_name='jobs' then 'job' else 'service' end and listing_id=case when tg_table_name='jobs' then new.job_id else new.service_id end;
 end if;
 return new;
end; $$;
revoke all on function public.worksync_guard_listing_archive() from public;
drop trigger if exists jobs_guard_archive on public.jobs;
create trigger jobs_guard_archive before update of is_archived on public.jobs for each row execute function public.worksync_guard_listing_archive();
drop trigger if exists services_guard_archive on public.services;
create trigger services_guard_archive before update of is_archived on public.services for each row execute function public.worksync_guard_listing_archive();
commit;








