-- PREPARED, NOT APPLIED.
-- Ensure both participants can read accepted job applications and their linked
-- service order, project, and milestone records. These policies expose rows only
-- when auth.uid() belongs to the row's client or assigned freelancer.
begin;

-- Accepted applications remain visible to the applicant and the owning client.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'job_applications'
      and policyname = 'worksync_job_application_participant_read'
  ) then
    create policy worksync_job_application_participant_read
      on public.job_applications for select to authenticated
      using (
        exists (
          select 1 from public.freelancer_profiles fp
          where fp.freelancer_id = job_applications.freelancer_id
            and fp.user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.jobs j
          join public.client_profiles cp on cp.client_id = j.client_id
          where j.job_id = job_applications.job_id
            and cp.user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'service_orders'
      and policyname = 'worksync_service_order_participant_read'
  ) then
    create policy worksync_service_order_participant_read
      on public.service_orders for select to authenticated
      using (
        exists (
          select 1 from public.client_profiles cp
          where cp.client_id = service_orders.client_id
            and cp.user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.freelancer_profiles fp
          where fp.freelancer_id = service_orders.freelancer_id
            and fp.user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'projects'
      and policyname = 'worksync_project_participant_read'
  ) then
    create policy worksync_project_participant_read
      on public.projects for select to authenticated
      using (
        exists (
          select 1 from public.client_profiles cp
          where cp.client_id = projects.client_id
            and cp.user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.freelancer_profiles fp
          where fp.freelancer_id = projects.freelancer_id
            and fp.user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'milestones'
      and policyname = 'worksync_milestone_project_participant_read'
  ) then
    create policy worksync_milestone_project_participant_read
      on public.milestones for select to authenticated
      using (
        exists (
          select 1 from public.projects p
          join public.client_profiles cp on cp.client_id = p.client_id
          where p.project_id = milestones.project_id
            and cp.user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.projects p
          join public.freelancer_profiles fp on fp.freelancer_id = p.freelancer_id
          where p.project_id = milestones.project_id
            and fp.user_id = (select auth.uid())
        )
      );
  end if;
end;
$$;

commit;
