-- PREPARED, NOT APPLIED.
-- Persist task-level discussion for both project participants.
begin;

create table if not exists public.project_task_comments (
  comment_id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(project_id) on delete cascade,
  task_key text not null check (length(btrim(task_key)) between 1 and 120),
  author_id uuid not null references public."Users"(user_id),
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists project_task_comments_project_task_created_idx
  on public.project_task_comments(project_id, task_key, created_at, comment_id);

alter table public.project_task_comments enable row level security;
revoke all on public.project_task_comments from public, anon, authenticated;
grant select on public.project_task_comments to authenticated;
grant insert (project_id, task_key, author_id, body)
  on public.project_task_comments to authenticated;

drop policy if exists project_task_comments_participant_read
  on public.project_task_comments;
create policy project_task_comments_participant_read
  on public.project_task_comments for select to authenticated
  using (public.worksync_project_party(project_id) is not null);

drop policy if exists project_task_comments_participant_insert
  on public.project_task_comments;
create policy project_task_comments_participant_insert
  on public.project_task_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.worksync_project_party(project_id) is not null
  );

do $migration$
begin
  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'project_task_comments'
  ) then
    execute 'alter publication supabase_realtime add table public.project_task_comments';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
