-- Prepared only. Apply through the normal database review/deployment process.
-- Generic job/service triggers must select their table-specific id before use;
-- a CASE expression can still resolve a nonexistent NEW record field.
begin;

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
 values(kind,listing_id,owner,new.title,new.description,'pending_review');
 return new;
end; $$;

create or replace function public.worksync_guard_listing_archive()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid; active_count bigint; active_cap integer; current_plan text; status_now text; target_listing_id uuid; listing_kind text;
begin
 if old.is_archived is not distinct from new.is_archived then return new; end if;
 if tg_table_name='jobs' then
  listing_kind:='job';
  target_listing_id:=new.job_id;
  select user_id into owner from public.client_profiles where client_id=new.client_id;
 else
  listing_kind:='service';
  target_listing_id:=new.service_id;
  select user_id into owner from public.freelancer_profiles where freelancer_id=new.freelancer_id;
 end if;
 if auth.uid() is distinct from owner and not public.worksync_is_admin() then raise exception 'Only the listing owner can archive or restore this listing'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
 select status into status_now from public.listing_submissions
 where listing_type=listing_kind and listing_id=target_listing_id for update;
 if status_now is distinct from 'approved' then
  raise exception 'Only approved listings can be archived or restored';
 end if;
 if new.is_archived then
  if tg_table_name='jobs' then
   if exists(select 1 from public.job_applications a where a.job_id=target_listing_id and a.status::text='accepted') then raise exception 'Resolve accepted applications before archiving this job'; end if;
  else
   if exists(select 1 from public.service_orders o where o.service_id=target_listing_id and o.status::text in ('accepted','converted')) then raise exception 'Complete or resolve active service orders before archiving this service'; end if;
  end if;
  update public.listing_submissions set archived_at=now() where listing_type=listing_kind and listing_id=target_listing_id;
  insert into public.listing_moderation_events(submission_id,actor_id,actor_kind,action,explanation)
   select submission_id,auth.uid(),'system','archived','Owner archived the listing.' from public.listing_submissions where listing_type=listing_kind and listing_id=target_listing_id;
 else
  select status into status_now from public.listing_submissions where listing_type=listing_kind and listing_id=target_listing_id for update;
  if status_now is distinct from 'approved' then raise exception 'Only approved listings can be restored; contact an administrator for review'; end if;
  insert into public.user_subscriptions(user_id) values(owner) on conflict(user_id) do nothing;
  select plan_code into current_plan from public.user_subscriptions where user_id=owner;
  if listing_kind='job' then
   select active_job_limit into active_cap from public.subscription_plans where plan_code=current_plan;
   select count(*) into active_count from public.jobs j join public.listing_submissions s on s.listing_type='job' and s.listing_id=j.job_id where s.owner_id=owner and s.status='approved' and j.is_archived=false;
  else
   select active_service_limit into active_cap from public.subscription_plans where plan_code=current_plan;
   select count(*) into active_count from public.services v join public.listing_submissions s on s.listing_type='service' and s.listing_id=v.service_id where s.owner_id=owner and s.status='approved' and v.is_archived=false;
  end if;
  if coalesce(active_count,0)>=coalesce(active_cap,0) then raise exception 'Active listing limit reached. Archive an active listing or change plans before restoring'; end if;
  update public.listing_submissions set archived_at=null where listing_type=listing_kind and listing_id=target_listing_id;
  insert into public.listing_moderation_events(submission_id,actor_id,actor_kind,action,explanation)
   select submission_id,auth.uid(),'system','restored','Owner restored the approved listing.' from public.listing_submissions where listing_type=listing_kind and listing_id=target_listing_id;
 end if;
 return new;
end; $$;

revoke all on function public.worksync_capture_listing_submission() from public;
revoke all on function public.worksync_guard_listing_archive() from public;

commit;
