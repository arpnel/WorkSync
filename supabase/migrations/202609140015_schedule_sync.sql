begin;
create table if not exists public.planner_documents (
 user_id uuid primary key references public."Users"(user_id), state jsonb not null check(jsonb_typeof(state)='object'), revision bigint not null default 1, updated_at timestamptz not null default now()
);
alter table public.planner_documents enable row level security;
revoke all on public.planner_documents from anon,authenticated;
grant select on public.planner_documents to authenticated;
create policy planner_owner_read on public.planner_documents for select to authenticated using(user_id=auth.uid());
create or replace function public.worksync_save_planner(p_state jsonb,p_revision bigint) returns bigint
language plpgsql security definer set search_path='' as $$
declare result bigint;
begin
 if auth.uid() is null then raise exception 'Sign in to save your planner'; end if;
 if p_state is null or jsonb_typeof(p_state)<>'object' or jsonb_typeof(p_state->'boards') is distinct from 'array' or octet_length(p_state::text)>1048576 then raise exception 'Invalid planner or planner exceeds 1 MB'; end if;
 if p_revision=0 then
 insert into public.planner_documents(user_id,state) values(auth.uid(),p_state) on conflict(user_id) do nothing returning revision into result;
 else update public.planner_documents set state=p_state,revision=revision+1,updated_at=now() where user_id=auth.uid() and revision=p_revision returning revision into result; end if;
 if result is null then raise exception 'Planner changed on another device. Review the saved copy before syncing.' using errcode='40001'; end if;
 return result;
end; $$;
create table if not exists public.project_meetings (
 meeting_id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(project_id),
 created_by uuid not null references public."Users"(user_id),title text not null check(length(trim(title)) between 1 and 200),
 starts_at timestamptz not null,ends_at timestamptz not null,link text check(link is null or link ~ '^https?://'),
 status text not null default 'scheduled' check(status in ('scheduled','cancelled')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(ends_at>starts_at)
);
create index if not exists project_meetings_calendar on public.project_meetings(project_id,starts_at) where status='scheduled';
alter table public.project_meetings enable row level security;
revoke all on public.project_meetings from anon,authenticated;
grant select on public.project_meetings to authenticated;
create policy meeting_participant_read on public.project_meetings for select to authenticated using(public.worksync_project_party(project_id) is not null);
create or replace function public.worksync_save_meeting(p_id uuid,p_project uuid,p_title text,p_start timestamptz,p_end timestamptz,p_link text,p_cancel boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.projects; result uuid; recipient uuid;
begin
 select * into p from public.projects where project_id=p_project for update;
 if public.worksync_project_party(p_project) is null or p.status::text not in ('active','in_progress') then raise exception 'An active project and participant access are required'; end if;
 if p_cancel then
 update public.project_meetings set status='cancelled',updated_at=now() where meeting_id=p_id and project_id=p_project and status='scheduled' returning meeting_id into result;
 else
 if p_start<=now() or p_start is null or p_end is null or p_end<=p_start or coalesce(length(trim(p_title)),0) not between 1 and 200 then raise exception 'Enter a title and valid future meeting time'; end if;
 if p_id is null then insert into public.project_meetings(project_id,created_by,title,starts_at,ends_at,link) values(p_project,auth.uid(),trim(p_title),p_start,p_end,nullif(trim(p_link),'')) returning meeting_id into result;
 else update public.project_meetings set title=trim(p_title),starts_at=p_start,ends_at=p_end,link=nullif(trim(p_link),''),updated_at=now() where meeting_id=p_id and project_id=p_project and status='scheduled' returning meeting_id into result; end if;
 end if;
 if result is null then raise exception 'Meeting unavailable'; end if;
 for recipient in select user_id from public.client_profiles where client_id=p.client_id union select user_id from public.freelancer_profiles where freelancer_id=p.freelancer_id loop
 insert into public.notifications(user_id,type,title,message,related_id,is_read) values(recipient,'project_update',case when p_cancel then 'Meeting cancelled' else 'Project meeting scheduled' end,coalesce(p_title,'Meeting updated'),p.order_id,false);
 end loop;
 return result;
end; $$;
create or replace function public.worksync_close_project_meetings() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status::text in ('completed','cancelled') and old.status::text is distinct from new.status::text then update public.project_meetings set status='cancelled',updated_at=now() where project_id=new.project_id and status='scheduled' and ends_at>now(); end if;
 return new;
end; $$;
create trigger worksync_close_project_meetings after update on public.projects for each row execute function public.worksync_close_project_meetings();
revoke all on function public.worksync_save_planner(jsonb,bigint),public.worksync_save_meeting(uuid,uuid,text,timestamptz,timestamptz,text,boolean),public.worksync_close_project_meetings() from public;
grant execute on function public.worksync_save_planner(jsonb,bigint),public.worksync_save_meeting(uuid,uuid,text,timestamptz,timestamptz,text,boolean) to authenticated;
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['account_moderation','project_disputes','project_cancellations','project_meetings','planner_documents','service_orders'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
 end loop; end if;
end; $$;
commit;
