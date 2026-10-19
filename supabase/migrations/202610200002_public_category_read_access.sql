-- Allow the public marketplace to read its category and skill directory.
-- PREPARED ONLY: apply through the existing Supabase migration workflow.
begin;

grant select on public.job_categories, public.category_skills, public.skills
to anon, authenticated;

drop policy if exists worksync_public_job_categories_read
on public.job_categories;
create policy worksync_public_job_categories_read
on public.job_categories
for select
to anon, authenticated
using (true);

drop policy if exists worksync_public_category_skills_read
on public.category_skills;
create policy worksync_public_category_skills_read
on public.category_skills
for select
to anon, authenticated
using (true);

drop policy if exists worksync_public_skills_read
on public.skills;
create policy worksync_public_skills_read
on public.skills
for select
to anon, authenticated
using (true);

commit;
