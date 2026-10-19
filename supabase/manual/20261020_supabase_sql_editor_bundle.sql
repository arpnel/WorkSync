-- WorkSync Supabase SQL Editor bundle for pending migrations prepared Oct 19-20, 2026.
-- Includes 202610190001, 202610200001, and 202610200002.
-- IMPORTANT: 202610190001 replaces worksync_submit_work. Before running this
-- bundle, confirm the deployed RPC body and the public.milestones.status enum
-- support the milestone statuses used below. If not confirmed, do not run this
-- bundle yet; remove that section only after deciding how to handle that change.
-- Policies are dropped before recreation and grants/functions are repeatable.

begin;

-- 202610190001_current_milestone_submission.sql
-- Recreate this exact signature because the deployed return type differs.
-- No CASCADE: a database dependency will stop the transaction for review.
drop function if exists public.worksync_submit_work(uuid,uuid,uuid,text,text,text,text,text);

create or replace function public.worksync_submit_work(
 p_id uuid,p_project uuid,p_milestone uuid,p_body text,p_link text,p_kind text,p_path text,p_name text
) returns void
language plpgsql security definer set search_path='' as $$
declare p public.projects; recipient uuid; milestone_type boolean; locked uuid; current_milestone uuid;
begin
 select * into p from public.projects where project_id=p_project;
 select contract_id into locked from public.contracts where order_id=p.order_id for update;
 select * into p from public.projects where project_id=p_project for update;
 if p_kind is null or p_kind not in ('progress','delivery') then raise exception 'Invalid submission type'; end if;
 if coalesce(length(trim(p_body)),0)=0 and p_link is null and p_path is null then raise exception 'Add notes, a link, or an attachment'; end if;
 if p_link is not null and p_link !~ '^https?://' then raise exception 'Use an HTTP or HTTPS link'; end if;
 if length(p_body)>10000 then raise exception 'Submission text is too long'; end if;
 if p_kind='delivery' and public.worksync_order_on_hold(p.order_id) then raise exception 'Delivery is paused pending resolution'; end if;
 if public.worksync_project_party(p_project) is distinct from 'freelancer' or p.status::text not in ('active','in_progress','revision') then raise exception 'Only the project freelancer can submit active work'; end if;
 select s.service_type::text='milestone' into milestone_type from public.service_orders o join public.services s using(service_id) where o.order_id=p.order_id;
 if (milestone_type or exists(select 1 from public.milestones where project_id=p_project)) and p_milestone is null then raise exception 'Choose a milestone'; end if;
 if p_milestone is not null and not exists(select 1 from public.milestones where milestone_id=p_milestone and project_id=p_project and status::text not in ('approved','completed','cancelled')) then raise exception 'Milestone unavailable'; end if;
 if p_milestone is not null then
  select m.milestone_id into current_milestone
  from public.milestones m
  where m.project_id=p_project and m.status::text not in ('approved','completed','cancelled')
  order by m.display_order,m.milestone_id
  limit 1;
  if current_milestone is distinct from p_milestone then
   raise exception 'Submit work for the current milestone only';
  end if;
 end if;
 if p_kind='delivery' and exists(select 1 from public.project_submissions where project_id=p_project and milestone_id is not distinct from p_milestone and kind='delivery' and status='submitted') then raise exception 'Wait for the client to review your current delivery'; end if;
 if p_path is not null and (p_path not like p_project::text||'/'||auth.uid()::text||'/'||p_id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='project-attachments' and name=p_path)) then raise exception 'Invalid attachment'; end if;
 insert into public.project_submissions(submission_id,project_id,milestone_id,author_id,body,link,kind,attachment_path,attachment_name) values(p_id,p_project,p_milestone,auth.uid(),p_body,p_link,p_kind,p_path,p_name);
 if p_kind='delivery' then
  update public.milestones set status='submitted' where milestone_id=p_milestone and project_id=p_project;
  update public.revision_requests r set status='addressed' from public.project_submissions s where r.submission_id=s.submission_id and r.project_id=p_project and s.milestone_id is not distinct from p_milestone and r.status='open';
 end if;
 select user_id into recipient from public.client_profiles where client_id=p.client_id;
 insert into public.notifications(user_id,type,title,message,related_id,is_read) values(recipient,'project_update','Project work submitted','New work is ready in your project workspace.',p.order_id,false);
end; $$;
revoke all on function public.worksync_submit_work(uuid,uuid,uuid,text,text,text,text,text) from public,anon;
grant execute on function public.worksync_submit_work(uuid,uuid,uuid,text,text,text,text,text) to authenticated;
notify pgrst, 'reload schema';

-- 202610200001_service_media_upload_policy.sql
-- Allow authenticated freelancers to upload media only under their own service paths.
drop policy if exists worksync_service_media_owner_upload on storage.objects;
create policy worksync_service_media_owner_upload
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'service-media'
  and (storage.foldername(name))[1] = auth.uid()::text
  and cardinality(storage.foldername(name)) = 2
  and exists (
    select 1
    from public.services as service
    join public.freelancer_profiles as freelancer
      on freelancer.freelancer_id = service.freelancer_id
    where service.service_id::text = (storage.foldername(name))[2]
      and freelancer.user_id = auth.uid()
  )
);

-- 202610200002_public_category_read_access.sql
grant select on public.job_categories, public.category_skills, public.skills
to anon, authenticated;

drop policy if exists worksync_public_job_categories_read
on public.job_categories;
create policy worksync_public_job_categories_read
on public.job_categories
for select
to anon, authenticated
using (true);

drop policy if exists worksync_public_category_skills_read
on public.category_skills;
create policy worksync_public_category_skills_read
on public.category_skills
for select
to anon, authenticated
using (true);

drop policy if exists worksync_public_skills_read
on public.skills;
create policy worksync_public_skills_read
on public.skills
for select
to anon, authenticated
using (true);

commit;
