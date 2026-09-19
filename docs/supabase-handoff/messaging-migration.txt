-- Apply in the Supabase SQL editor as the database owner.
-- Based on the supplied schema: Users(user_id), conversations(conversation_id),
-- conversation_participants(conversation_id, user_id), messages(attachment_url, attachment_type).
-- This adds policies for new tables/storage only; existing messaging RLS stays in place.
begin;

create table if not exists public.conversation_preferences (
  conversation_id uuid not null,
  user_id uuid not null,
  is_archived boolean not null default false,
  is_pinned boolean not null default false,
  primary key (conversation_id, user_id),
  foreign key (conversation_id, user_id)
    references public.conversation_participants(conversation_id, user_id) on delete cascade
);
create index if not exists conversation_preferences_user_idx on public.conversation_preferences(user_id);
create table if not exists public.user_blocks (
  blocker_id uuid not null references public."Users"(user_id) on delete cascade,
  blocked_id uuid not null references public."Users"(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks(blocked_id);
alter table public.conversation_preferences enable row level security;
alter table public.user_blocks enable row level security;
revoke all on public.conversation_preferences, public.user_blocks from anon;
grant select, insert, update, delete on public.conversation_preferences to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;

drop policy if exists messaging_preferences_own on public.conversation_preferences;
create policy messaging_preferences_own on public.conversation_preferences for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists messaging_blocks_read on public.user_blocks;
create policy messaging_blocks_read on public.user_blocks for select to authenticated
using (blocker_id = (select auth.uid()) or blocked_id = (select auth.uid()));
drop policy if exists messaging_blocks_insert on public.user_blocks;
create policy messaging_blocks_insert on public.user_blocks for insert to authenticated
with check (blocker_id = (select auth.uid()));
drop policy if exists messaging_blocks_delete on public.user_blocks;
create policy messaging_blocks_delete on public.user_blocks for delete to authenticated
using (blocker_id = (select auth.uid()));

-- A trigger enforces blocks even when another client writes directly or an
-- existing permissive INSERT policy would otherwise allow the message.
create or replace function public.worksync_enforce_message_block()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.conversation_participants cp
    join public.user_blocks b on
      (b.blocker_id = new.sender_id and b.blocked_id = cp.user_id)
      or (b.blocked_id = new.sender_id and b.blocker_id = cp.user_id)
    where cp.conversation_id = new.conversation_id
  ) then
    raise exception 'Messaging is unavailable for this conversation.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.worksync_enforce_message_block() from public, anon, authenticated;
drop trigger if exists worksync_message_block_guard on public.messages;
create trigger worksync_message_block_guard before insert or update of sender_id, conversation_id, message, attachment_url, attachment_type
on public.messages for each row execute function public.worksync_enforce_message_block();

-- Match existing project-chat paths: senderId/conversationId/uniqueId-filename.
-- Definer reads avoid self-referencing participant policies. Auth identity is
-- checked inside the helper; callers cannot choose an alternative user ID.
create or replace function public.worksync_message_file_access(object_name text, writing boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id::text = split_part(object_name, '/', 2)
      and cp.user_id = auth.uid()
      and (not writing or (
        split_part(object_name, '/', 1) = auth.uid()::text
        and not exists (
          select 1 from public.conversation_participants other
          join public.user_blocks b on
            (b.blocker_id = auth.uid() and b.blocked_id = other.user_id)
            or (b.blocked_id = auth.uid() and b.blocker_id = other.user_id)
          where other.conversation_id = cp.conversation_id
        )
      ))
  );
$$;
revoke all on function public.worksync_message_file_access(text, boolean) from public, anon;
grant execute on function public.worksync_message_file_access(text, boolean) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('message-attachments', 'message-attachments', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists messaging_files_read on storage.objects;
create policy messaging_files_read on storage.objects for select to authenticated
using (bucket_id = 'message-attachments' and public.worksync_message_file_access(name, false));
drop policy if exists messaging_files_insert on storage.objects;
create policy messaging_files_insert on storage.objects for insert to authenticated
with check (bucket_id = 'message-attachments' and public.worksync_message_file_access(name, true));
drop policy if exists messaging_files_cleanup on storage.objects;
create policy messaging_files_cleanup on storage.objects for delete to authenticated
using (bucket_id = 'message-attachments' and split_part(name, '/', 1) = auth.uid()::text
  and public.worksync_message_file_access(name, false));
-- Restrictive guards keep broader pre-existing storage policies from granting
-- nonparticipants access to this bucket. Other buckets are unaffected.
drop policy if exists messaging_files_read_guard on storage.objects;
create policy messaging_files_read_guard on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'message-attachments' or public.worksync_message_file_access(name, false));
drop policy if exists messaging_files_insert_guard on storage.objects;
create policy messaging_files_insert_guard on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'message-attachments' or public.worksync_message_file_access(name, true));
drop policy if exists messaging_files_update_guard on storage.objects;
create policy messaging_files_update_guard on storage.objects as restrictive for update to authenticated
using (bucket_id <> 'message-attachments') with check (bucket_id <> 'message-attachments');
drop policy if exists messaging_files_delete_guard on storage.objects;
create policy messaging_files_delete_guard on storage.objects as restrictive for delete to authenticated
using (bucket_id <> 'message-attachments' or (split_part(name, '/', 1) = auth.uid()::text
  and public.worksync_message_file_access(name, false)));
drop policy if exists messaging_files_anon_guard on storage.objects;
create policy messaging_files_anon_guard on storage.objects as restrictive for all to anon
using (bucket_id <> 'message-attachments') with check (bucket_id <> 'message-attachments');
commit;
