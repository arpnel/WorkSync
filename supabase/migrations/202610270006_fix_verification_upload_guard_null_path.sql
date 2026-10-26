-- PREPARED, NOT APPLIED.
-- Legacy freelancer setup stores resumes at <user id>/<filename>.
-- foldername(name)[2] is NULL for that path; SQL NULL propagation in the
-- seller-only restrictive guard otherwise rejects the legitimate upload.
-- Keep seller-verification paths ticket-gated and let the existing owner
-- upload policy authorize the other verification-document paths.
begin;

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
