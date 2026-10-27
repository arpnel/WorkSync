-- PREPARED, NOT APPLIED.
-- Freelancer setup stores resumes, portfolio samples, and certifications at
-- <user id>/<kind>/<filename>; older uploads may be at <user id>/<filename>.
-- Keep setup uploads owner-scoped, and keep seller-verification paths gated
-- by their server-issued upload tickets.
begin;

-- Make setup authorization explicit instead of depending on the legacy
-- verification_files_insert policy being present in every deployed database.
drop policy if exists freelancer_setup_documents_upload on storage.objects;
create policy freelancer_setup_documents_upload
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'verification-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
  and coalesce((storage.foldername(name))[2], '') in (
    '', 'resume', 'portfolio', 'certifications'
  )
);

drop policy if exists freelancer_seller_upload_guard on storage.objects;
create policy freelancer_seller_upload_guard
on storage.objects as restrictive
for insert to authenticated
with check (
  bucket_id <> 'verification-documents'
  or coalesce((storage.foldername(name))[2] <> 'seller-verification', true)
  or public.worksync_seller_document_upload_allowed(name)
);

commit;
