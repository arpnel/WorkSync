begin;
-- Review current policies first. These guards supplement existing permissive policies.
create policy project_participant_read_guard on public.projects as restrictive for select to authenticated using(public.worksync_project_party(project_id) is not null);
create policy order_participant_read_guard on public.service_orders as restrictive for select to authenticated using(exists(select 1 from public.client_profiles c where c.client_id=service_orders.client_id and c.user_id=auth.uid()) or exists(select 1 from public.freelancer_profiles f where f.freelancer_id=service_orders.freelancer_id and f.user_id=auth.uid()));
create policy services_owner_update_guard on public.services as restrictive for update to authenticated using(exists(select 1 from public.freelancer_profiles f where f.freelancer_id=services.freelancer_id and f.user_id=auth.uid())) with check(exists(select 1 from public.freelancer_profiles f where f.freelancer_id=services.freelancer_id and f.user_id=auth.uid()));
create policy jobs_owner_update_guard on public.jobs as restrictive for update to authenticated using(exists(select 1 from public.client_profiles c where c.client_id=jobs.client_id and c.user_id=auth.uid())) with check(exists(select 1 from public.client_profiles c where c.client_id=jobs.client_id and c.user_id=auth.uid()));
revoke update,delete on public.reviews from anon,authenticated;
-- Avoid a broad legacy Storage policy accidentally exposing private files.
create policy worksync_private_files_guard on storage.objects as restrictive for select to authenticated using(
 bucket_id not in ('project-attachments','verification-documents') or
 (bucket_id='project-attachments' and exists(select 1 from public.project_submissions s where s.attachment_path=name and public.worksync_project_party(s.project_id) is not null)) or
 (bucket_id='verification-documents' and ((storage.foldername(name))[1]=auth.uid()::text or (public.worksync_is_admin() and exists(select 1 from public.verification_requests v where name=any(v.document_paths))))));
create policy worksync_private_files_anon_guard on storage.objects as restrictive for select to anon using(bucket_id not in ('project-attachments','verification-documents'));
create policy worksync_private_files_update_guard on storage.objects as restrictive for update to authenticated using(bucket_id not in ('project-attachments','verification-documents')) with check(bucket_id not in ('project-attachments','verification-documents'));
-- Fail closed rather than reuse an existing public bucket for private files.
do $$ begin
 if exists(select 1 from storage.buckets where id in ('project-attachments','verification-documents') and public) then raise exception 'Private WorkSync buckets must not be public. Reconcile bucket settings first.'; end if;
end; $$;
commit;
