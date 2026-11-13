-- PREPARED, NOT APPLIED.
-- Allows authenticated conversation participants to read message files so
-- private image attachments can render inline. Audit existing Storage policies
-- and bucket configuration before applying this to a connected project.
begin;

do $$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'message-attachments'
      and public = false
  ) then
    raise exception 'Expected the message-attachments bucket to exist and remain private';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'worksync_message_attachments_participant_read'
  ) then
    execute $policy$
      create policy worksync_message_attachments_participant_read
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'message-attachments'
        and exists (
          select 1
          from public.conversation_participants as participant
          where participant.conversation_id::text = (storage.foldername(name))[2]
            and participant.user_id = (select auth.uid())
        )
      )
    $policy$;
  end if;
end;
$$;

commit;
