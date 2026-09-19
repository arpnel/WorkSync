begin;
create or replace function public.worksync_list_disputes(p_search text default '',p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.worksync_is_admin() then raise exception 'Administrator access required'; end if;
 return (with records as (select d.dispute_id id,p.title,d.status,d.created_at,concat(d.category,E'\n',d.description,E'\nReview: ',d.admin_notes) detail,d.opened_by owner_id from public.project_disputes d join public.projects p using(project_id) where coalesce(p_search,'')='' or p.title ilike '%'||p_search||'%' or d.status ilike '%'||p_search||'%' or d.dispute_id::text=p_search),paged as(select * from records order by created_at desc,id limit 25 offset greatest(p_offset,0)) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),'total',(select count(*) from records)));
end; $$;
create or replace function public.worksync_dispute_context(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.project_disputes; p public.projects; result jsonb;
begin
 if not public.worksync_is_admin() then raise exception 'Administrator access required'; end if;
 select * into d from public.project_disputes where dispute_id=p_id;
 if d.dispute_id is null then raise exception 'Dispute not found'; end if;
 select * into p from public.projects where project_id=d.project_id;
 select jsonb_build_object('dispute',to_jsonb(d),'project',to_jsonb(p),
 'contract',(select to_jsonb(c) from public.contracts c where c.order_id=p.order_id),
 'parties',(select jsonb_agg(x) from (select 'client' role,c.user_id,pr.display_name from public.client_profiles c left join public.profiles pr using(user_id) where c.client_id=p.client_id union all select 'freelancer',f.user_id,pr.display_name from public.freelancer_profiles f left join public.profiles pr using(user_id) where f.freelancer_id=p.freelancer_id) x),
 'milestones',coalesce((select jsonb_agg(m order by m.display_order) from public.milestones m where m.project_id=p.project_id),'[]'::jsonb),
 'submissions',coalesce((select jsonb_agg(s order by s.created_at desc) from public.project_submissions s where s.project_id=p.project_id),'[]'::jsonb),
 'revisions',coalesce((select jsonb_agg(r order by r.created_at desc) from public.revision_requests r where r.project_id=p.project_id),'[]'::jsonb),
 'messages',coalesce((select jsonb_agg(x order by x.created_at) from (select m.message_id,m.sender_id,m.message,m.created_at from public.messages m join public.conversations c using(conversation_id) where c.project_id=p.project_id or c.order_id=p.order_id order by m.created_at desc limit 100) x),'[]'::jsonb)) into result;
 insert into public.admin_audit_log(admin_id,action,target_id,details) values(auth.uid(),'dispute:inspect',p_id,jsonb_build_object('project_id',p.project_id));
 return result;
end; $$;
-- Definer helpers see all references, preventing hidden rows from weakening orphan checks.
create or replace function public.worksync_project_file_read(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.project_submissions s where s.attachment_path=p_path and (public.worksync_project_party(s.project_id) is not null or (public.worksync_is_admin() and exists(select 1 from public.project_disputes d where d.project_id=s.project_id))))
 or exists(select 1 from public.project_disputes d where d.evidence_path=p_path and (public.worksync_project_party(d.project_id) is not null or public.worksync_is_admin()));
$$;
create or replace function public.worksync_private_file_orphan(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select case when p_bucket='project-attachments' then (storage.foldername(p_path))[2]=auth.uid()::text and not exists(select 1 from public.project_submissions where attachment_path=p_path) and not exists(select 1 from public.project_disputes where evidence_path=p_path)
 when p_bucket='verification-documents' then (storage.foldername(p_path))[1]=auth.uid()::text and not exists(select 1 from public.verification_requests where p_path=any(document_paths)) else false end;
$$;
create or replace function public.worksync_project_file_upload(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select (storage.foldername(p_path))[2]=auth.uid()::text and cardinality(storage.foldername(p_path))=3 and exists(select 1 from public.projects p where p.project_id::text=(storage.foldername(p_path))[1] and p.status::text in ('active','in_progress') and public.worksync_project_party(p.project_id) is not null);
$$;
drop policy if exists worksync_private_files_guard on storage.objects;
create policy worksync_private_files_guard on storage.objects as restrictive for select to authenticated using(bucket_id not in ('project-attachments','verification-documents') or (bucket_id='project-attachments' and (public.worksync_project_file_read(name) or public.worksync_private_file_orphan(bucket_id,name))) or (bucket_id='verification-documents' and ((storage.foldername(name))[1]=auth.uid()::text or (public.worksync_is_admin() and exists(select 1 from public.verification_requests v where name=any(v.document_paths))))));
create policy worksync_resolution_files_read on storage.objects for select to authenticated using(bucket_id='project-attachments' and (public.worksync_project_file_read(name) or public.worksync_private_file_orphan(bucket_id,name)));
create policy worksync_resolution_files_upload on storage.objects for insert to authenticated with check(bucket_id='project-attachments' and public.worksync_project_file_upload(name));
create policy worksync_private_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id not in ('project-attachments','verification-documents') or (bucket_id='project-attachments' and public.worksync_project_file_upload(name)) or (bucket_id='verification-documents' and (storage.foldername(name))[1]=auth.uid()::text));
create policy worksync_private_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id not in ('project-attachments','verification-documents') or public.worksync_private_file_orphan(bucket_id,name));
create policy worksync_orphan_cleanup on storage.objects for delete to authenticated using(public.worksync_private_file_orphan(bucket_id,name));
revoke all on function public.worksync_list_disputes(text,integer),public.worksync_dispute_context(uuid),public.worksync_project_file_read(text),public.worksync_private_file_orphan(text,text),public.worksync_project_file_upload(text) from public;
grant execute on function public.worksync_list_disputes(text,integer),public.worksync_dispute_context(uuid),public.worksync_project_file_read(text),public.worksync_private_file_orphan(text,text),public.worksync_project_file_upload(text) to authenticated;
commit;
