-- PREPARED, NOT APPLIED.
-- Let an administrator cancel a non-terminal project from its admin detail view.
-- This records the reason and project status change; it does not initiate a refund
-- or payout.
begin;

create or replace function public.worksync_admin_cancel_project(
  p_project uuid,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_project public.projects;
  v_previous_status text;
begin
  if v_admin is null or not public.worksync_is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_project is null then
    raise exception 'Project is required' using errcode = '22023';
  end if;
  if p_notes is null or length(btrim(p_notes)) not between 1 and 500 then
    raise exception 'Enter a cancellation reason of up to 500 characters' using errcode = '22023';
  end if;

  select * into v_project
  from public.projects
  where project_id = p_project
  for update;
  if not found then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;

  v_previous_status := v_project.status::text;
  if v_previous_status in ('completed', 'cancelled') then
    raise exception 'Completed or already cancelled projects cannot be cancelled again' using errcode = '22023';
  end if;

  update public.projects
  set status = 'cancelled'::public.project_status,
      updated_at = pg_catalog.now()
  where project_id = p_project;

  insert into public.admin_audit_log(admin_id, action, target_id, details)
  values (
    v_admin,
    'cancel_project',
    p_project,
    pg_catalog.jsonb_build_object(
      'project_id', p_project,
      'project_title', v_project.title,
      'previous_status', v_previous_status,
      'status', 'cancelled',
      'notes', btrim(p_notes)
    )
  );

  return pg_catalog.jsonb_build_object(
    'project_id', p_project,
    'status', 'cancelled',
    'previous_status', v_previous_status
  );
end;
$$;

revoke all on function public.worksync_admin_cancel_project(uuid, text) from public, anon;
grant execute on function public.worksync_admin_cancel_project(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
