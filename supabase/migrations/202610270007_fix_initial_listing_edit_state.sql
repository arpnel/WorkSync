-- PREPARED, NOT APPLIED.
-- New listings must remain in the edit workflow while the client attaches
-- skills, media, and milestones. /api/listings/moderate then calls
-- worksync_submit_listing to transition the completed listing to review.
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
 values(kind,listing_id,owner,new.title,new.description,'editing');
 return new;
end; $$;

revoke all on function public.worksync_capture_listing_submission() from public,anon,authenticated;
commit;
