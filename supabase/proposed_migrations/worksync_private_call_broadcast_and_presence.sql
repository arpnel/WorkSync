-- PREPARED, NOT APPLIED.
-- Private call-event Broadcasts and conversation-scoped Presence.
-- The call event intentionally contains identifiers only; clients must load
-- verified call state and any Daily token through the authenticated call API.
begin;

create schema if not exists worksync_private;
revoke all on schema worksync_private from public, anon, authenticated;

-- Presence topic authorization is scoped to the conversation membership row.
drop policy if exists worksync_conversation_presence_select
  on realtime.messages;
create policy worksync_conversation_presence_select
  on realtime.messages
  for select
  to authenticated
  using (
    extension = 'presence'
    and exists (
      select 1
      from public.conversation_participants as participant
      where participant.user_id = (select auth.uid())
        and (select realtime.topic()) =
          'conversation:' || participant.conversation_id::text || ':presence'
    )
  );

drop policy if exists worksync_conversation_presence_insert
  on realtime.messages;
create policy worksync_conversation_presence_insert
  on realtime.messages
  for insert
  to authenticated
  with check (
    extension = 'presence'
    and exists (
      select 1
      from public.conversation_participants as participant
      where participant.user_id = (select auth.uid())
        and (select realtime.topic()) =
          'conversation:' || participant.conversation_id::text || ':presence'
    )
  );

-- Clients may receive Broadcasts only from their own call topic. There is no
-- client INSERT policy: the database trigger below is the only publisher.
drop policy if exists worksync_user_call_broadcast_select
  on realtime.messages;
create policy worksync_user_call_broadcast_select
  on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and (select realtime.topic()) =
      'user:' || (select auth.uid())::text || ':calls'
  );

create or replace function worksync_private.broadcast_call_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  call_record jsonb;
  call_id uuid;
  caller_id uuid;
  recipient_id uuid;
begin
  if new.message is null
    or left(new.message, char_length('[WorkSync video call] '))
      <> '[WorkSync video call] ' then
    return new;
  end if;

  begin
    call_record := substring(
      new.message from char_length('[WorkSync video call] ') + 1
    )::jsonb -> 'call';
    call_id := (call_record ->> 'id')::uuid;
    caller_id := (call_record ->> 'callerId')::uuid;
    recipient_id := (call_record ->> 'recipientId')::uuid;

    if call_id is distinct from new.message_id
      or (call_record ->> 'conversationId') is distinct from new.conversation_id::text
      or caller_id is distinct from new.sender_id
      or caller_id = recipient_id then
      return new;
    end if;

    -- Calls are supported only for two-person conversations. Confirm both
    -- recipients still belong to this conversation before routing the event.
    if (
      select count(*)
      from public.conversation_participants as participant
      where participant.conversation_id = new.conversation_id
    ) <> 2
      or not exists (
        select 1
        from public.conversation_participants as participant
        where participant.conversation_id = new.conversation_id
          and participant.user_id = caller_id
      )
      or not exists (
        select 1
        from public.conversation_participants as participant
        where participant.conversation_id = new.conversation_id
          and participant.user_id = recipient_id
      ) then
      return new;
    end if;

    perform realtime.send(
      jsonb_build_object(
        'messageId', new.message_id,
        'conversationId', new.conversation_id
      ),
      'call-changed',
      'user:' || caller_id::text || ':calls',
      true
    );
    perform realtime.send(
      jsonb_build_object(
        'messageId', new.message_id,
        'conversationId', new.conversation_id
      ),
      'call-changed',
      'user:' || recipient_id::text || ':calls',
      true
    );
  exception when others then
    -- Persisted call rows and the authenticated list API remain authoritative.
    -- A temporary Broadcast failure must not roll back an otherwise valid call.
    raise warning 'WorkSync call Broadcast failed (SQLSTATE %)', sqlstate;
  end;

  return new;
end;
$$;

revoke all on function worksync_private.broadcast_call_event()
  from public, anon, authenticated;

drop trigger if exists worksync_broadcast_call_event on public.messages;
create trigger worksync_broadcast_call_event
  after insert or update of message on public.messages
  for each row
  execute function worksync_private.broadcast_call_event();

-- The Presence RLS predicate and initial membership lookup use user_id first.
-- Review existing indexes before applying to avoid adding a duplicate index.
create index if not exists worksync_conversation_participants_user_conversation_idx
  on public.conversation_participants (user_id, conversation_id);

commit;
