-- PREPARED, NOT APPLIED. Meetings require at least 20 minutes' notice and
-- use a fixed 30-minute duration; the form only asks for the start time.
begin;

create or replace function public.worksync_save_meeting(
  p_id uuid,
  p_project uuid,
  p_title text,
  p_start timestamptz,
  p_end timestamptz,
  p_link text,
  p_cancel boolean
) returns public.project_meetings
language plpgsql security definer set search_path='' as $$
declare
  project_row public.projects;
  meeting_row public.project_meetings;
  recipient uuid;
  meeting_end timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  select * into project_row from public.projects where project_id=p_project for update;
  if project_row.project_id is null
     or public.worksync_project_party(p_project) is null
     or project_row.status::text not in ('active','in_progress') then
    raise exception 'An active project and participant access are required';
  end if;

  if p_cancel then
    update public.project_meetings
      set status='cancelled',updated_at=now()
      where meeting_id=p_id and project_id=p_project and status='scheduled'
      returning * into meeting_row;
  else
    if p_start is null
       or p_start < pg_catalog.clock_timestamp()+interval '20 minutes'
       or coalesce(length(trim(p_title)),0) not between 1 and 200 then
      raise exception 'Enter a title and schedule the meeting at least 20 minutes in advance';
    end if;

    -- p_end stays in the RPC signature for existing clients, but meeting
    -- duration is fixed because the scheduling form only collects a start.
    meeting_end:=p_start+interval '30 minutes';
    if p_id is null then
      insert into public.project_meetings(project_id,created_by,title,starts_at,ends_at,link)
      values(p_project,auth.uid(),trim(p_title),p_start,meeting_end,null)
      returning * into meeting_row;
    else
      update public.project_meetings
        set title=trim(p_title),starts_at=p_start,ends_at=meeting_end,
            link=null,updated_at=now()
        where meeting_id=p_id and project_id=p_project and status='scheduled'
        returning * into meeting_row;
    end if;
  end if;

  if meeting_row.meeting_id is null then raise exception 'Meeting unavailable'; end if;
  for recipient in
    select user_id from public.client_profiles where client_id=project_row.client_id
    union
    select user_id from public.freelancer_profiles where freelancer_id=project_row.freelancer_id
  loop
    insert into public.notifications(user_id,type,title,message,related_id,is_read)
    values(recipient,'project_update',
      case when p_cancel then 'Meeting cancelled' else 'Project meeting scheduled' end,
      coalesce(p_title,'Meeting updated'),project_row.order_id,false);
  end loop;
  return meeting_row;
end;
$$;

revoke all on function public.worksync_save_meeting(uuid,uuid,text,timestamptz,timestamptz,text,boolean) from public,anon;
grant execute on function public.worksync_save_meeting(uuid,uuid,text,timestamptz,timestamptz,text,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
