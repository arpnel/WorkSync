-- FAQ support ticket intake and administrator queue.
-- PREPARED ONLY: inspect current live schema, policies and migration ledger before applying.
begin;
create table if not exists public.support_tickets (
 ticket_id uuid primary key default gen_random_uuid(),
 requester_id uuid not null references public."Users"(user_id) on delete cascade,
 category text not null check(category in ('Account','Payments','Projects','Technical issue','Safety concern','Other')),
 subject text not null check(length(trim(subject)) between 4 and 120),
 description text not null check(length(trim(description)) between 20 and 4000),
 status text not null default 'open' check(status in ('open','in_progress','waiting_on_user','resolved','closed')),
 priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
 admin_response text,
 assigned_to uuid references public."Users"(user_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 responded_at timestamptz,
 resolved_at timestamptz
);
create index if not exists support_tickets_queue on public.support_tickets(status,priority,created_at desc);
create index if not exists support_tickets_requester on public.support_tickets(requester_id,created_at desc);
alter table public.support_tickets enable row level security;
create policy support_tickets_read on public.support_tickets for select to authenticated using(requester_id=auth.uid() or public.worksync_is_admin());
revoke all on public.support_tickets from anon,authenticated;
grant select on public.support_tickets to authenticated;

create or replace function public.worksync_submit_support_ticket(p_category text,p_subject text,p_description text) returns uuid
language plpgsql security definer set search_path='' as $$
declare ticket uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to submit a support ticket'; end if;
 if p_category not in ('Account','Payments','Projects','Technical issue','Safety concern','Other') then raise exception 'Choose a valid category'; end if;
 if length(trim(p_subject)) not between 4 and 120 then raise exception 'Subject must be between 4 and 120 characters'; end if;
 if length(trim(p_description)) not between 20 and 4000 then raise exception 'Details must be between 20 and 4000 characters'; end if;
 insert into public.support_tickets(requester_id,category,subject,description) values(auth.uid(),p_category,trim(p_subject),trim(p_description)) returning ticket_id into ticket;
 return ticket;
end; $$;

create or replace function public.worksync_admin_support_tickets(p_status text default null) returns setof jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.worksync_is_admin() then raise exception 'Administrator access required'; end if;
 if p_status is not null and p_status not in ('open','in_progress','waiting_on_user','resolved','closed') then raise exception 'Invalid ticket status'; end if;
 return query select jsonb_build_object('ticket_id',t.ticket_id,'category',t.category,'subject',t.subject,'description',t.description,'status',t.status,'priority',t.priority,'created_at',t.created_at,'requester_email',u.email,'admin_response',t.admin_response)
 from public.support_tickets t join public."Users" u on u.user_id=t.requester_id where p_status is null or t.status=p_status
 order by case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,t.created_at asc;
end; $$;

create or replace function public.worksync_admin_update_support_ticket(p_ticket uuid,p_status text,p_priority text,p_response text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.worksync_is_admin() then raise exception 'Administrator access required'; end if;
 if p_status not in ('open','in_progress','waiting_on_user','resolved','closed') then raise exception 'Invalid ticket status'; end if;
 if p_priority not in ('low','normal','high','urgent') then raise exception 'Invalid priority'; end if;
 if length(trim(p_response)) not between 1 and 4000 then raise exception 'Response is required and must be at most 4000 characters'; end if;
 update public.support_tickets set status=p_status,priority=p_priority,admin_response=trim(p_response),assigned_to=auth.uid(),updated_at=now(),responded_at=now(),resolved_at=case when p_status in ('resolved','closed') then now() else null end where ticket_id=p_ticket;
 if not found then raise exception 'Ticket not found'; end if;
 insert into public.admin_audit_log(admin_id,action,target_id,details) values(auth.uid(),'support_ticket:'||p_status,p_ticket,jsonb_build_object('priority',p_priority,'response',trim(p_response)));
 insert into public.notifications(user_id,type,title,message,related_id,is_read) select requester_id,'support_ticket_update','Support ticket update',trim(p_response),p_ticket,false from public.support_tickets where ticket_id=p_ticket;
end; $$;
revoke all on function public.worksync_submit_support_ticket(text,text,text),public.worksync_admin_support_tickets(text),public.worksync_admin_update_support_ticket(uuid,text,text,text) from public;
grant execute on function public.worksync_submit_support_ticket(text,text,text) to authenticated;
grant execute on function public.worksync_admin_support_tickets(text),public.worksync_admin_update_support_ticket(uuid,text,text,text) to authenticated;
commit;
