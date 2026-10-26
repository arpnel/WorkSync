-- PREPARED, NOT APPLIED.
-- Project chat must create/reuse the order conversation and connect both
-- parties atomically. Direct browser INSERTs into conversations are denied by
-- the existing table RLS, and a conversation without participants is unusable.
begin;

create or replace function public.worksync_ensure_order_conversation(p_order uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.service_orders%rowtype;
  client_user uuid;
  freelancer_user uuid;
  conversation uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to open this conversation' using errcode = '42501';
  end if;

  -- Serialize concurrent first messages for the same order.
  select * into order_row
  from public.service_orders
  where order_id = p_order
  for update;
  if not found then
    raise exception 'Order conversation is unavailable';
  end if;

  select user_id into client_user
  from public.client_profiles
  where client_id = order_row.client_id;
  select user_id into freelancer_user
  from public.freelancer_profiles
  where freelancer_id = order_row.freelancer_id;

  if client_user is null or freelancer_user is null
     or auth.uid() not in (client_user, freelancer_user) then
    raise exception 'Only the order participants can open this conversation'
      using errcode = '42501';
  end if;

  select c.conversation_id into conversation
  from public.conversations c
  where c.order_id = p_order
  order by c.created_at, c.conversation_id
  limit 1;

  if conversation is null then
    insert into public.conversations(order_id)
    values (p_order)
    returning conversation_id into conversation;
  end if;

  -- Do not silently attach order parties to a conversation already containing
  -- unrelated accounts. Preserve it for explicit reconciliation instead.
  if exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = conversation
      and cp.user_id not in (client_user, freelancer_user)
  ) then
    raise exception 'Order conversation has unexpected participants; administrator review is required';
  end if;

  insert into public.conversation_participants(conversation_id, user_id)
  values (conversation, client_user), (conversation, freelancer_user)
  on conflict (conversation_id, user_id) do nothing;

  return conversation;
end;
$$;

revoke all on function public.worksync_ensure_order_conversation(uuid)
  from public, anon;
grant execute on function public.worksync_ensure_order_conversation(uuid)
  to authenticated;

notify pgrst, 'reload schema';
commit;
