-- Remove monthly submission quotas. Enforce only the combined active listing
-- allowance when a listing is approved or restored.
begin;

create or replace function public.worksync_capture_listing_submission()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid; duplicate_found boolean; kind text; listing_id uuid;
begin
 if tg_table_name='jobs' then
  kind:='job'; listing_id:=new.job_id;
  select user_id into owner from public.client_profiles where client_id=new.client_id;
 else
  kind:='service'; listing_id:=new.service_id;
  select user_id into owner from public.freelancer_profiles where freelancer_id=new.freelancer_id;
 end if;
 if owner is null then raise exception 'Complete the owner profile before posting'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,0));
 insert into public.user_subscriptions(user_id) values(owner) on conflict(user_id) do nothing;
 select exists(
  select 1 from public.listing_submissions s
  where s.owner_id=owner and s.listing_type=kind
   and s.created_at>=pg_catalog.now()-interval '30 days'
   and lower(regexp_replace(s.title||s.description,'[[:space:][:punct:]]','','g'))
       =lower(regexp_replace(new.title||new.description,'[[:space:][:punct:]]','','g'))
 ) into duplicate_found;
 if duplicate_found then
  raise exception 'A substantially identical listing was submitted recently. Edit the existing listing or contact an administrator.' using errcode='P0001';
 end if;
 insert into public.listing_submissions(listing_type,listing_id,owner_id,title,description,status)
 values(kind,listing_id,owner,new.title,new.description,'pending_review');
 return new;
end; $$;

create or replace function public.worksync_admin_decide_listing(p_submission uuid,p_action text,p_category text,p_explanation text)
returns void language plpgsql security definer set search_path='' as $$
declare row_data public.listing_submissions%rowtype; cap integer; active_count bigint;
begin
 if not public.worksync_is_admin() then raise exception 'Administrator access required'; end if;
 if p_action not in ('approve','reject','flag') then raise exception 'Invalid moderation action'; end if;
 if p_action='reject' and (length(trim(coalesce(p_explanation,'')))<12 or length(trim(coalesce(p_category,'')))<2) then raise exception 'A rejection category and meaningful explanation are required'; end if;
 if p_action='approve' then
  select * into row_data from public.listing_submissions where submission_id=p_submission;
  if not found then raise exception 'Submission not found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(row_data.owner_id::text,0));
  select * into row_data from public.listing_submissions where submission_id=p_submission for update;
 else
  select * into row_data from public.listing_submissions where submission_id=p_submission for update;
 end if;
 if not found then raise exception 'Submission not found'; end if;
 if row_data.status='editing' then raise exception 'The owner is editing this listing; review is not ready'; end if;
 if p_action='approve' then
  select active_listing_limit into cap
   from public.subscription_plans
   where plan_code=public.worksync_effective_subscription_plan(row_data.owner_id);
  select count(*) into active_count from (
   select j.job_id from public.listing_submissions s
    join public.jobs j on j.job_id=s.listing_id
    where s.owner_id=row_data.owner_id and s.listing_type='job'
     and s.status='approved' and s.archived_at is null and j.is_archived=false
   union all
   select v.service_id from public.listing_submissions s
    join public.services v on v.service_id=s.listing_id
    where s.owner_id=row_data.owner_id and s.listing_type='service'
     and s.status='approved' and s.archived_at is null and v.is_archived=false
  ) active_listings;
  if coalesce(active_count,0)>=coalesce(cap,0) then
   raise exception 'Owner has reached the active listing limit';
  end if;
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

create or replace function public.worksync_guard_listing_archive()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid; active_count bigint; active_cap integer; current_plan text; status_now text; target_listing_id uuid; listing_kind text;
begin
 if old.is_archived is not distinct from new.is_archived then return new; end if;
 if tg_table_name='jobs' then
  listing_kind:='job'; target_listing_id:=new.job_id;
  select user_id into owner from public.client_profiles where client_id=new.client_id;
 else
  listing_kind:='service'; target_listing_id:=new.service_id;
  select user_id into owner from public.freelancer_profiles where freelancer_id=new.freelancer_id;
 end if;
 if auth.uid() is distinct from owner and not public.worksync_is_admin() then
  raise exception 'Only the listing owner can archive or restore this listing';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,0));
 select status into status_now from public.listing_submissions
  where listing_type=listing_kind and listing_id=target_listing_id for update;
 if status_now is distinct from 'approved' then raise exception 'Only approved listings can be archived or restored'; end if;

 if new.is_archived then
  if tg_table_name='jobs' then
   if exists(select 1 from public.job_applications a where a.job_id=target_listing_id and a.status::text='accepted') then
    raise exception 'Resolve accepted applications before archiving this job';
   end if;
  elsif exists(select 1 from public.service_orders o where o.service_id=target_listing_id and o.status::text in ('accepted','converted')) then
   raise exception 'Complete or resolve active service orders before archiving this service';
  end if;
  update public.listing_submissions set archived_at=pg_catalog.now()
   where listing_type=listing_kind and listing_id=target_listing_id;
  insert into public.listing_moderation_events(submission_id,actor_id,actor_kind,action,explanation)
   select submission_id,auth.uid(),'system','archived','Owner archived the listing.'
   from public.listing_submissions where listing_type=listing_kind and listing_id=target_listing_id;
 else
  if tg_table_name='jobs' and exists(select 1 from public.job_applications a where a.job_id=target_listing_id and a.status::text='accepted') then
   raise exception 'A job with an accepted applicant cannot be restored';
  end if;
  insert into public.user_subscriptions(user_id) values(owner) on conflict(user_id) do nothing;
  current_plan:=public.worksync_effective_subscription_plan(owner);
  select active_listing_limit into active_cap from public.subscription_plans where plan_code=current_plan;
  select count(*) into active_count from (
   select j.job_id from public.jobs j join public.listing_submissions s
    on s.listing_type='job' and s.listing_id=j.job_id
    where s.owner_id=owner and s.status='approved' and s.archived_at is null and j.is_archived=false
   union all
   select v.service_id from public.services v join public.listing_submissions s
    on s.listing_type='service' and s.listing_id=v.service_id
    where s.owner_id=owner and s.status='approved' and s.archived_at is null and v.is_archived=false
  ) active_listings;
  if coalesce(active_count,0)>=coalesce(active_cap,0) then
   raise exception 'Active listing limit reached. Archive an active listing or change plans before restoring';
  end if;
  update public.listing_submissions set archived_at=null
   where listing_type=listing_kind and listing_id=target_listing_id;
  insert into public.listing_moderation_events(submission_id,actor_id,actor_kind,action,explanation)
   select submission_id,auth.uid(),'system','restored','Owner restored the approved listing.'
   from public.listing_submissions where listing_type=listing_kind and listing_id=target_listing_id;
 end if;
 return new;
end; $$;

commit;
