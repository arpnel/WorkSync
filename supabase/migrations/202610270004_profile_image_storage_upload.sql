-- PREPARED, NOT APPLIED.
-- Profile setup uploads avatar and banner files as <auth user id>/<filename>.
-- Permit authenticated users to add files only within their own folder.
begin;

drop policy if exists worksync_avatar_owner_upload on storage.objects;
create policy worksync_avatar_owner_upload
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and cardinality(storage.foldername(name)) = 1
);

drop policy if exists worksync_banner_owner_upload on storage.objects;
create policy worksync_banner_owner_upload
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'banners'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and cardinality(storage.foldername(name)) = 1
);

commit;
