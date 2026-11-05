-- PREPARED, NOT APPLIED.
-- Keep task attachments private, freelancer-uploaded, and readable by both project participants.
begin;

create table if not exists public.project_task_attachments (
  attachment_id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(project_id) on delete cascade,
  task_key text not null check (length(btrim(task_key)) between 1 and 120),
  author_id uuid not null references public."Users"(user_id),
  storage_path text not null unique,
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  content_type text not null default 'application/octet-stream' check (length(content_type) between 1 and 255),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);

create index if not exists project_task_attachments_project_task_created_idx
  on public.project_task_attachments(project_id, task_key, created_at, attachment_id);

alter table public.project_task_attachments enable row level security;
revoke all on public.project_task_attachments from public, anon, authenticated;
grant select on public.project_task_attachments to authenticated;
grant insert (project_id, task_key, author_id, storage_path, file_name, content_type, size_bytes)
  on public.project_task_attachments to authenticated;

drop policy if exists project_task_attachments_participant_read
  on public.project_task_attachments;
create policy project_task_attachments_participant_read
  on public.project_task_attachments for select to authenticated
  using (public.worksync_project_party(project_id) is not null);

drop policy if exists project_task_attachments_freelancer_insert
  on public.project_task_attachments;
create policy project_task_attachments_freelancer_insert
  on public.project_task_attachments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.worksync_project_party(project_id) = 'freelancer'
    and (storage.foldername(storage_path))[1] = project_id::text
    and (storage.foldername(storage_path))[2] = (select auth.uid())::text
    and (storage.foldername(storage_path))[3] = 'task-files'
    and cardinality(storage.foldername(storage_path)) = 4
    and exists (
      select 1 from storage.objects o
      where o.bucket_id = 'project-attachments'
        and o.name = project_task_attachments.storage_path
    )
  );

-- Restrict the task upload path to the freelancer on an active project.
create or replace function public.worksync_project_task_file_upload(p_path text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select cardinality(storage.foldername(p_path)) = 4
    and (storage.foldername(p_path))[2] = (select auth.uid())::text
    and (storage.foldername(p_path))[3] = 'task-files'
    and exists (
      select 1 from public.projects p
      where p.project_id::text = (storage.foldername(p_path))[1]
        and p.status::text in ('active', 'in_progress')
        and public.worksync_project_party(p.project_id) = 'freelancer'
    );
$$;

-- Keep the existing project-delivery upload path working on databases where
-- the dispute-access migration that introduced this helper was not applied.
create or replace function public.worksync_project_file_upload(p_path text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select (storage.foldername(p_path))[2] = (select auth.uid())::text
    and cardinality(storage.foldername(p_path)) = 3
    and exists (
      select 1 from public.projects p
      where p.project_id::text = (storage.foldername(p_path))[1]
        and p.status::text in ('active', 'in_progress')
        and public.worksync_project_party(p.project_id) is not null
    );
$$;

-- Extend the existing private-file read check with linked task attachments.
create or replace function public.worksync_project_file_read(p_path text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from public.project_submissions s
      where s.attachment_path = p_path
        and (public.worksync_project_party(s.project_id) is not null or
          (public.worksync_is_admin() and exists (
            select 1 from public.project_disputes d where d.project_id = s.project_id
          )))
    )
    or exists (
      select 1 from public.project_disputes d
      where d.evidence_path = p_path
        and (public.worksync_project_party(d.project_id) is not null or public.worksync_is_admin())
    )
    or exists (
      select 1 from public.project_task_attachments a
      where a.storage_path = p_path
        and public.worksync_project_party(a.project_id) is not null
    );
$$;

-- Never treat a linked task file as an unreferenced upload that its author may delete.
create or replace function public.worksync_private_file_orphan(p_bucket text, p_path text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_bucket = 'project-attachments' then
      (storage.foldername(p_path))[2] = (select auth.uid())::text
      and not exists (select 1 from public.project_submissions where attachment_path = p_path)
      and not exists (select 1 from public.project_disputes where evidence_path = p_path)
      and not exists (select 1 from public.project_task_attachments where storage_path = p_path)
    when p_bucket = 'verification-documents' then
      (storage.foldername(p_path))[1] = (select auth.uid())::text
      and not exists (select 1 from public.verification_requests where p_path = any(document_paths))
    else false
  end;
$$;

revoke all on function public.worksync_project_task_file_upload(text),
  public.worksync_project_file_upload(text),
  public.worksync_project_file_read(text), public.worksync_private_file_orphan(text, text)
  from public, anon;
grant execute on function public.worksync_project_task_file_upload(text),
  public.worksync_project_file_upload(text),
  public.worksync_project_file_read(text), public.worksync_private_file_orphan(text, text)
  to authenticated;

drop policy if exists worksync_project_task_files_read on storage.objects;
create policy worksync_project_task_files_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-attachments'
    and exists (
      select 1 from public.project_task_attachments a
      where a.storage_path = name
        and public.worksync_project_party(a.project_id) is not null
    )
  );

drop policy if exists worksync_project_task_files_insert on storage.objects;
create policy worksync_project_task_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'project-attachments'
    and public.worksync_project_task_file_upload(name)
  );

-- Preserve the existing private bucket checks while allowing the new task upload path.
drop policy if exists worksync_private_insert_guard on storage.objects;
create policy worksync_private_insert_guard on storage.objects as restrictive
  for insert to authenticated
  with check (
    bucket_id not in ('project-attachments', 'verification-documents')
    or (bucket_id = 'project-attachments' and (
      public.worksync_project_file_upload(name)
      or public.worksync_project_task_file_upload(name)
    ))
    or (bucket_id = 'verification-documents' and (storage.foldername(name))[1] = auth.uid()::text)
  );

do $migration$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'project_task_attachments'
    ) then
    execute 'alter publication supabase_realtime add table public.project_task_attachments';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
