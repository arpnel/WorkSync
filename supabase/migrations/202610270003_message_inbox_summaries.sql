-- PREPARED, NOT APPLIED.
-- The inbox needs only the latest preview and unread count per conversation;
-- do not transfer the full message history just to build the conversation list.
begin;

create index if not exists messages_conversation_latest_idx
  on public.messages(conversation_id, created_at desc, message_id desc);
create index if not exists messages_unread_conversation_idx
  on public.messages(conversation_id, sender_id)
  where read_at is null;

create or replace function public.worksync_get_message_conversation_summaries()
returns table(
  conversation_id uuid,
  last_message text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select cp.conversation_id,
    latest.message,
    coalesce(latest.created_at, c.created_at),
    (
      select count(*)
      from public.messages unread
      where unread.conversation_id = cp.conversation_id
        and unread.sender_id <> auth.uid()
        and unread.read_at is null
    )::bigint
  from public.conversation_participants cp
  join public.conversations c using (conversation_id)
  left join lateral (
    select m.message, m.created_at
    from public.messages m
    where m.conversation_id = cp.conversation_id
    order by m.created_at desc, m.message_id desc
    limit 1
  ) latest on true
  where auth.uid() is not null
    and cp.user_id = auth.uid()
  order by coalesce(latest.created_at, c.created_at) desc;
$$;

revoke all on function public.worksync_get_message_conversation_summaries()
  from public, anon;
grant execute on function public.worksync_get_message_conversation_summaries()
  to authenticated;

notify pgrst, 'reload schema';
commit;
