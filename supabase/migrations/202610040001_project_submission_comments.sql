-- PREPARED, NOT APPLIED. Apply before using project submission comments.
begin;

create table if not exists public.project_submission_comments (
  comment_id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.project_submissions(submission_id) on delete cascade,
  project_id uuid not null references public.projects(project_id) on delete cascade,
  author_id uuid not null references public."Users"(user_id),
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists project_submission_comments_history
  on public.project_submission_comments(submission_id, created_at asc);

alter table public.project_submission_comments enable row level security;

create policy project_submission_comments_read
  on public.project_submission_comments for select to authenticated
  using (public.worksync_project_party(project_id) is not null);

create policy project_submission_comments_add
  on public.project_submission_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.worksync_project_party(project_id) is not null
    and exists (
      select 1 from public.project_submissions s
      where s.submission_id = project_submission_comments.submission_id
        and s.project_id = project_submission_comments.project_id
    )
  );

revoke all on public.project_submission_comments from anon, authenticated;
grant select on public.project_submission_comments to authenticated;
grant insert (submission_id, project_id, author_id, body)
  on public.project_submission_comments to authenticated;

commit;
