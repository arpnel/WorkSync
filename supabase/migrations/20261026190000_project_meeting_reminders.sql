-- PREPARED, NOT APPLIED. Creates idempotent in-app and email reminders for
-- upcoming project meetings. Invoke the protected worker every 5 minutes.
begin;

create table public.project_meeting_reminders (
  event_id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.project_meetings(meeting_id) on delete cascade,
  user_id uuid not null references public."Users"(user_id),
  starts_at timestamptz not null,
  last_attempt_at timestamptz,
  email_sent_at timestamptz,
  attempt_count integer not null default 0 check(attempt_count >= 0),
  last_error text not null default '',
  created_at timestamptz not null default now(),
  unique(meeting_id,user_id,starts_at)
);
create index project_meeting_reminders_pending
  on public.project_meeting_reminders(starts_at,last_attempt_at)
  where email_sent_at is null;
alter table public.project_meeting_reminders enable row level security;
revoke all on public.project_meeting_reminders from public,anon,authenticated;
grant all on public.project_meeting_reminders to service_role;

create or replace function public.worksync_claim_project_meeting_reminders(p_window_minutes integer default 30)
returns table(event_id uuid,meeting_id uuid,user_id uuid,starts_at timestamptz,meeting_title text,order_id uuid,project_title text)
language plpgsql security definer set search_path='' as $$
declare meeting record; participant uuid; inserted_event uuid;
begin
  if p_window_minutes not between 1 and 60 then raise exception 'Meeting reminder window must be between 1 and 60 minutes'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('worksync:project-meeting-reminders',0));

  for meeting in
    select m.meeting_id,m.project_id,m.title,m.starts_at,p.order_id,p.title as project_title,
           c.user_id as client_user_id,f.user_id as freelancer_user_id
    from public.project_meetings m
    join public.projects p on p.project_id=m.project_id
    join public.client_profiles c on c.client_id=p.client_id
    join public.freelancer_profiles f on f.freelancer_id=p.freelancer_id
    where m.status='scheduled' and p.status::text in ('active','in_progress','revision')
      and m.starts_at>pg_catalog.now()
      and m.starts_at<=pg_catalog.now()+pg_catalog.make_interval(mins=>p_window_minutes)
  loop
    for participant in
      select distinct x.user_id from pg_catalog.unnest(array[meeting.client_user_id,meeting.freelancer_user_id]) as x(user_id)
      where x.user_id is not null
    loop
      inserted_event:=null;
      insert into public.project_meeting_reminders(meeting_id,user_id,starts_at)
      values(meeting.meeting_id,participant,meeting.starts_at)
      on conflict(meeting_id,user_id,starts_at) do nothing
      returning project_meeting_reminders.event_id into inserted_event;
      if inserted_event is not null then
        insert into public.notifications(user_id,type,title,message,related_id,is_read)
        values(participant,'project_update','Meeting starts soon',
          coalesce(meeting.title,'Your project meeting')||' starts within 30 minutes. Open the project conversation to start a video call.',
          meeting.order_id,false);
      end if;
    end loop;
  end loop;

  return query
  with candidates as (
    select r.event_id,r.meeting_id
    from public.project_meeting_reminders r
    join public.project_meetings m on m.meeting_id=r.meeting_id and m.starts_at=r.starts_at and m.status='scheduled'
    join public.projects p on p.project_id=m.project_id and p.status::text in ('active','in_progress','revision')
    where r.email_sent_at is null
      and m.starts_at>pg_catalog.now()
      and m.starts_at<=pg_catalog.now()+pg_catalog.make_interval(mins=>p_window_minutes)
      and (r.last_attempt_at is null or r.last_attempt_at<pg_catalog.now()-interval '10 minutes')
    order by m.starts_at
    for update of r skip locked
    limit 3
  ), claimed as (
    update public.project_meeting_reminders r
      set last_attempt_at=pg_catalog.now(),attempt_count=r.attempt_count+1,last_error=''
    from candidates c
    where r.event_id=c.event_id
    returning r.event_id,r.meeting_id,r.user_id,r.starts_at
  )
  select claimed.event_id,claimed.meeting_id,claimed.user_id,claimed.starts_at,
         m.title,p.order_id,p.title
  from claimed
  join public.project_meetings m on m.meeting_id=claimed.meeting_id and m.starts_at=claimed.starts_at
  join public.projects p on p.project_id=m.project_id;
end; $$;
revoke all on function public.worksync_claim_project_meeting_reminders(integer) from public,anon,authenticated;
grant execute on function public.worksync_claim_project_meeting_reminders(integer) to service_role;

create or replace function public.worksync_finish_project_meeting_reminder(p_event_id uuid,p_sent boolean,p_error text default '')
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.project_meeting_reminders set
    email_sent_at=case when p_sent then pg_catalog.now() else email_sent_at end,
    last_error=case when p_sent then '' else left(coalesce(p_error,'email_delivery_failed'),120) end
  where event_id=p_event_id and email_sent_at is null;
end; $$;
revoke all on function public.worksync_finish_project_meeting_reminder(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.worksync_finish_project_meeting_reminder(uuid,boolean,text) to service_role;

notify pgrst,'reload schema';
commit;
