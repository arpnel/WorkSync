-- Application submission only. Review against the deployed schema before applying.
-- Requires the existing worksync_listing_visible and worksync_marketplace_active helpers.
-- No Gemini call, new table, or screening write is involved.
begin;
create or replace function public.worksync_apply_for_job(p_job uuid,p_proposal text,p_price numeric,p_days integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare freelancer uuid; owner uuid; job_status text; result uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if not public.worksync_marketplace_active(auth.uid()) then raise exception 'Marketplace activity is suspended'; end if;
 select freelancer_id into freelancer from public.freelancer_profiles where user_id=auth.uid();
 select c.user_id,j.status::text into owner,job_status from public.jobs j join public.client_profiles c using(client_id) where j.job_id=p_job for update of j;
 if exists(select 1 from public.jobs where job_id=p_job and is_archived) or not public.worksync_listing_visible('job',p_job) then raise exception 'This listing is unavailable'; end if;
 if freelancer is null or owner is null or owner=auth.uid() or job_status<>'open' then raise exception 'Only a freelancer may apply to an open job owned by another user'; end if;
 if coalesce(length(trim(p_proposal)),0)=0 or length(p_proposal)>10000 or p_price<=0 or p_days<1 or p_price is null or p_days is null then raise exception 'Invalid proposal, price or delivery'; end if;
 if exists(select 1 from public.job_applications where job_id=p_job and freelancer_id=freelancer) then raise exception 'You have already applied to this job'; end if;
 insert into public.job_applications(job_id,freelancer_id,proposal,proposed_price,estimated_days,status)
 values(p_job,freelancer,p_proposal,p_price,p_days,'pending') returning application_id into result;
 insert into public.notifications(user_id,type,title,message,related_id,is_read) values(owner,'job_application','New job application','A freelancer applied to your job.',p_job,false);
 return result;
end; $$;
revoke all on function public.worksync_apply_for_job(uuid,text,numeric,integer) from public,anon;
grant execute on function public.worksync_apply_for_job(uuid,text,numeric,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
