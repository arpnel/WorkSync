-- Prepared only. Apply after the listing moderation, participant-access,
-- and generic listing-trigger migrations.
-- Listings are hidden while editing/reviewing. Approved edits must enter the
-- edit lifecycle and return to review before they become visible again.
begin;

alter table public.listing_submissions
  add column if not exists decision_category text,
  add column if not exists decision_reason text;

alter table public.listing_submissions
  drop constraint if exists listing_submissions_status_check;
alter table public.listing_submissions
  add constraint worksync_listing_submission_status_check
  check (status in ('editing','pending_review','manual_review','approved','rejected'));

create or replace function public.worksync_listing_visible(p_kind text,p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.listing_submissions s
  where s.listing_type=p_kind and s.listing_id=p_id
    and s.status='approved' and s.archived_at is null
 ) and not exists(
  select 1 from public.listing_moderation m
  where m.listing_type=p_kind and m.listing_id=p_id and m.hidden
 );
$$;
revoke all on function public.worksync_listing_visible(text,uuid) from public;
grant execute on function public.worksync_listing_visible(text,uuid) to anon,authenticated;

-- Define these policy helpers here as well so this migration does not rely
-- on the separate participant-access migration having been applied first.
create or replace function public.worksync_job_participant(p_job uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.job_applications a
  join public.freelancer_profiles f using(freelancer_id)
  where a.job_id=p_job and f.user_id=auth.uid()
 );
$$;
create or replace function public.worksync_service_participant(p_service uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.service_orders o
  join public.client_profiles c using(client_id)
  join public.freelancer_profiles f using(freelancer_id)
  where o.service_id=p_service and (c.user_id=auth.uid() or f.user_id=auth.uid())
 );
$$;
revoke all on function public.worksync_job_participant(uuid),public.worksync_service_participant(uuid) from public,anon,authenticated;
grant execute on function public.worksync_job_participant(uuid),public.worksync_service_participant(uuid) to authenticated;

drop policy if exists jobs_moderation_visibility on public.jobs;
create policy jobs_moderation_visibility on public.jobs as restrictive for select to authenticated
using(public.worksync_listing_visible('job',job_id) or public.worksync_job_participant(job_id) or public.worksync_is_admin() or exists(select 1 from public.client_profiles c where c.client_id=jobs.client_id and c.user_id=auth.uid()));
drop policy if exists jobs_moderation_anon on public.jobs;
create policy jobs_moderation_anon on public.jobs as restrictive for select to anon
using(public.worksync_listing_visible('job',job_id));
drop policy if exists services_moderation_visibility on public.services;
create policy services_moderation_visibility on public.services as restrictive for select to authenticated
using(public.worksync_listing_visible('service',service_id) or public.worksync_service_participant(service_id) or public.worksync_is_admin() or exists(select 1 from public.freelancer_profiles f where f.freelancer_id=services.freelancer_id and f.user_id=auth.uid()));
drop policy if exists services_moderation_anon on public.services;
create policy services_moderation_anon on public.services as restrictive for select to anon
using(public.worksync_listing_visible('service',service_id));

create or replace function public.worksync_capture_listing_submission()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid; plan text; monthly_cap integer; used bigint; duplicate_found boolean; kind text; listing_id uuid;
begin
 if tg_table_name='jobs' then
  kind:='job';
  listing_id:=new.job_id;
  select user_id into owner from public.client_profiles where client_id=new.client_id;
 else
  kind:='service';
  listing_id:=new.service_id;
  select user_id into owner from public.freelancer_profiles where freelancer_id=new.freelancer_id;
 end if;
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
 values(kind,listing_id,owner,new.title,new.description,'editing');
 return new;
end; $$;

create or replace function public.worksync_begin_listing_edit(p_kind text,p_listing uuid)
returns void language plpgsql security definer set search_path='' as $$
declare submission public.listing_submissions;
begin
 if p_kind not in ('job','service') then raise exception 'Invalid listing type'; end if;
 select * into submission from public.listing_submissions
 where listing_type=p_kind and listing_id=p_listing for update;
 if not found or submission.owner_id is distinct from auth.uid() then raise exception 'Listing owner required'; end if;
 if submission.status in ('pending_review','manual_review') then raise exception 'This listing cannot be edited while it is under review'; end if;
 if submission.status not in ('approved','rejected','editing') then raise exception 'This listing cannot be edited in its current state'; end if;
 if submission.status<>'editing' then
  update public.listing_submissions set status='editing' where submission_id=submission.submission_id;
 end if;
end; $$;

create or replace function public.worksync_submit_listing(p_kind text,p_listing uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare submission public.listing_submissions; current_title text; current_description text;
begin
 if p_kind not in ('job','service') then raise exception 'Invalid listing type'; end if;
 select * into submission from public.listing_submissions
 where listing_type=p_kind and listing_id=p_listing for update;
 if not found or submission.owner_id is distinct from auth.uid() then raise exception 'Listing owner required'; end if;
 if submission.status in ('pending_review','manual_review') then return false; end if;
 if submission.status<>'editing' then raise exception 'Submit the listing through the edit workflow'; end if;
 if p_kind='job' then
  select title,description into current_title,current_description from public.jobs where job_id=p_listing;
 else
  select title,description into current_title,current_description from public.services where service_id=p_listing;
 end if;
 if current_title is null or current_description is null then raise exception 'Listing content is unavailable'; end if;
 update public.listing_submissions set
  title=current_title, description=current_description, status='pending_review',
  ai_risk=null, ai_explanation=null, ai_categories='[]'::jsonb,
  ai_evidence='[]'::jsonb, ai_confidence=null, ai_recommendation=null,
  decision=null, decision_category=null, decision_reason=null,
  assessment_started_at=null, assessed_at=null, failure_reason=null
 where submission_id=submission.submission_id;
 insert into public.notifications(user_id,type,title,message,related_id,is_read)
 values(auth.uid(),'listing_moderation','Listing submitted for review','Your listing is hidden from the marketplace while it is reviewed. We will notify you when a decision is made.',p_listing,false);
 return true;
end; $$;

create or replace function public.worksync_guard_listing_content_update()
returns trigger language plpgsql security definer set search_path='' as $$
declare kind text; target_listing_id uuid; review_status text;
begin
 if (to_jsonb(new)-'is_archived'-'updated_at')=(to_jsonb(old)-'is_archived'-'updated_at') then return new; end if;
 if tg_table_name='jobs' then kind:='job'; target_listing_id:=new.job_id;
 else kind:='service'; target_listing_id:=new.service_id; end if;
 select status into review_status from public.listing_submissions
 where listing_type=kind and listing_id=target_listing_id for update;
 if review_status is distinct from 'editing' then
  raise exception 'Submit approved or rejected listings through the review workflow; listings under review cannot be edited';
 end if;
 return new;
end; $$;

drop trigger if exists jobs_guard_listing_content_update on public.jobs;
create trigger jobs_guard_listing_content_update before update on public.jobs
for each row execute function public.worksync_guard_listing_content_update();
drop trigger if exists services_guard_listing_content_update on public.services;
create trigger services_guard_listing_content_update before update on public.services
for each row execute function public.worksync_guard_listing_content_update();

create or replace function public.worksync_guard_listing_child_edit()
returns trigger language plpgsql security definer set search_path='' as $$
declare kind text; target_listing_id uuid; old_listing_id uuid; review_status text;
begin
 if tg_table_name='job_skills' then
  kind:='job';
  if tg_op='DELETE' then target_listing_id:=old.job_id;
  else target_listing_id:=new.job_id; if tg_op='UPDATE' then old_listing_id:=old.job_id; end if; end if;
 else
  kind:='service';
  if tg_op='DELETE' then target_listing_id:=old.service_id;
  else target_listing_id:=new.service_id; if tg_op='UPDATE' then old_listing_id:=old.service_id; end if; end if;
 end if;
 if old_listing_id is not null and old_listing_id is distinct from target_listing_id then
  select status into review_status from public.listing_submissions
  where listing_type=kind and listing_id=old_listing_id for update;
  if review_status is distinct from 'editing' then
   raise exception 'Listing details cannot be moved from a listing outside its edit workflow';
  end if;
 end if;
 select status into review_status from public.listing_submissions
 where listing_type=kind and listing_id=target_listing_id for update;
 if review_status is distinct from 'editing' then
  raise exception 'Listing details cannot be edited unless the listing is in its edit workflow';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;

drop trigger if exists worksync_guard_job_skills_edit on public.job_skills;
create trigger worksync_guard_job_skills_edit before insert or update or delete on public.job_skills
for each row execute function public.worksync_guard_listing_child_edit();
drop trigger if exists worksync_guard_service_skills_edit on public.service_skills;
create trigger worksync_guard_service_skills_edit before insert or update or delete on public.service_skills
for each row execute function public.worksync_guard_listing_child_edit();
drop trigger if exists worksync_guard_service_media_edit on public.service_media;
create trigger worksync_guard_service_media_edit before insert or update or delete on public.service_media
for each row execute function public.worksync_guard_listing_child_edit();
drop trigger if exists worksync_guard_service_milestones_edit on public.service_milestones;
create trigger worksync_guard_service_milestones_edit before insert or update or delete on public.service_milestones
for each row execute function public.worksync_guard_listing_child_edit();

create or replace function public.worksync_admin_decide_listing(p_submission uuid,p_action text,p_category text,p_explanation text)
returns void language plpgsql security definer set search_path='' as $$
declare row_data public.listing_submissions%rowtype; cap integer; active_count bigint;
begin
 if not public.worksync_is_admin() then raise exception 'Administrator access required'; end if;
 if p_action not in ('approve','reject','flag') then raise exception 'Invalid moderation action'; end if;
 if p_action='reject' and (length(trim(coalesce(p_explanation,'')))<12 or length(trim(coalesce(p_category,'')))<2) then raise exception 'A rejection category and meaningful explanation are required'; end if;
 select * into row_data from public.listing_submissions where submission_id=p_submission for update;
 if not found then raise exception 'Submission not found'; end if;
 if row_data.status='editing' then raise exception 'The owner is editing this listing; review is not ready'; end if;
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
 update public.listing_submissions set
  status=case when p_action='approve' then 'approved' when p_action='reject' then 'rejected' else 'manual_review' end,
  decision='administrator_'||p_action,
  decision_category=case when p_action='approve' then null else nullif(trim(p_category),'') end,
  decision_reason=case when p_action='approve' then null else nullif(trim(p_explanation),'') end
 where submission_id=p_submission;
 insert into public.listing_moderation_events(submission_id,actor_id,actor_kind,action,category,explanation)
 values(p_submission,auth.uid(),'admin',p_action,nullif(trim(p_category),''),trim(coalesce(p_explanation,'')));
 if p_action in ('approve','reject') then
  insert into public.notifications(user_id,type,title,message,related_id,is_read)
  values(row_data.owner_id,'listing_moderation',case when p_action='approve' then 'Listing approved' else 'Listing rejected' end,
   case when p_action='approve' then '“'||row_data.title||'” was approved and is now eligible for marketplace display.'
   else '“'||row_data.title||'” was rejected ('||trim(p_category)||'): '||trim(p_explanation)||' You may edit and resubmit it or request an administrator review.' end,
   row_data.listing_id,false);
 end if;
end; $$;

revoke all on function public.worksync_begin_listing_edit(text,uuid) from public,anon;
grant execute on function public.worksync_begin_listing_edit(text,uuid) to authenticated;
revoke all on function public.worksync_submit_listing(text,uuid) from public,anon;
grant execute on function public.worksync_submit_listing(text,uuid) to authenticated;
revoke all on function public.worksync_guard_listing_content_update(),public.worksync_guard_listing_child_edit(),public.worksync_capture_listing_submission() from public,anon,authenticated;
revoke all on function public.worksync_admin_decide_listing(uuid,text,text,text) from public,anon;
grant execute on function public.worksync_admin_decide_listing(uuid,text,text,text) to authenticated;

commit;
