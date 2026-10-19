-- Allow authenticated listing owners to upload media for their own services.
-- Object paths use: <auth user id>/<service id>/<unique file name>.
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
