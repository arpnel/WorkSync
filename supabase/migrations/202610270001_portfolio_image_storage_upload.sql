-- PREPARED, NOT APPLIED.
-- PortfolioEditor uploads to portfolio_images at <auth user id>/<timestamp>.<ext>.
-- Allow authenticated users to add objects only beneath their own top-level folder.
drop policy if exists portfolio_images_owner_upload on storage.objects;
create policy portfolio_images_owner_upload
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'portfolio_images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and cardinality(storage.foldername(name)) = 1
);
