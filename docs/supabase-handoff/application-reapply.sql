-- Review deployed application status enum/check constraints before applying.
-- Cancellation below uses 'withdrawn'; map to existing 'cancelled' if that is the deployed label.
-- Preserve RPC parameter names. No new tables and no unique-constraint removal.
begin;
create or replace function public.worksync_cancel_application(p_application uuid)
returns text language plpgsql security definer set search_path='' as $$
declare a public.job_applications;
begin
 select * into a from public.job_applications where application_id=p_application for update;
 if auth.uid() is null or a.application_id is null or not exists(select 1 from public.freelancer_profiles f where f.freelancer_id=a.freelancer_id and f.user_id=auth.uid()) then raise exception 'Only the applicant may cancel'; end if;
 if a.status::text in ('cancelled','withdrawn') then return a.status::text; end if;
 if a.status::text is null or a.status::text not in ('pending','in_review') then raise exception 'Only a pending application can be cancelled'; end if;
 update public.job_applications set status='withdrawn',updated_at=now() where application_id=p_application returning * into a;
 return a.status::text;
end; $$;
create or replace function public.worksync_apply_for_job(p_job_id uuid,p_proposal text,p_proposed_price numeric,p_estimated_days integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare f uuid; owner_user uuid; j public.jobs; a public.job_applications; result uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select freelancer_id into f from public.freelancer_profiles where user_id=auth.uid();
 select * into j from public.jobs where job_id=p_job_id for update;
 select user_id into owner_user from public.client_profiles where client_id=j.client_id;
 if f is null or owner_user is null or owner_user=auth.uid() or j.status::text is distinct from 'open' or coalesce(j.is_archived,false) then raise exception 'This job cannot be applied to'; end if;
 if not public.worksync_marketplace_active(auth.uid()) or not public.worksync_listing_visible('job',p_job_id) then raise exception 'This listing is unavailable'; end if;
 if coalesce(length(trim(p_proposal)),0) not between 1 and 10000 or p_proposed_price is null or p_proposed_price<=0 or p_proposed_price::text in ('NaN','Infinity','-Infinity') or p_estimated_days is null or p_estimated_days<1 then raise exception 'Enter a valid proposal, price and delivery time'; end if;
 select * into a from public.job_applications where job_id=p_job_id and freelancer_id=f for update;
 if a.application_id is not null then
   if a.status::text='rejected' then raise exception 'Your application was rejected. You cannot reapply to this job'; end if;
   if a.status::text is null or a.status::text not in ('cancelled','withdrawn') then raise exception 'You already have an application for this job'; end if;
   update public.job_applications set proposal=trim(p_proposal),proposed_price=p_proposed_price,estimated_days=p_estimated_days,status='pending',screening_id=null,created_at=now(),updated_at=now()
   where application_id=a.application_id returning application_id into result;
 else
   insert into public.job_applications(application_id,job_id,freelancer_id,proposal,proposed_price,estimated_days)
   values(gen_random_uuid(),p_job_id,f,trim(p_proposal),p_proposed_price,p_estimated_days) returning application_id into result;
 end if;
 insert into public.notifications(user_id,type,title,message,related_id,is_read)
 values(owner_user,'job_application','New job application','A freelancer applied to your job.',result,false);
 return result;
end; $$;
revoke all on function public.worksync_cancel_application(uuid),public.worksync_apply_for_job(uuid,text,numeric,integer) from public,anon;
grant execute on function public.worksync_cancel_application(uuid),public.worksync_apply_for_job(uuid,text,numeric,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
