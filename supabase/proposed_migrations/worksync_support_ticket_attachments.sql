-- PREPARED, NOT APPLIED.
-- Adds optional private support-ticket attachments in a dedicated bucket.
-- Requires the FAQ support ticket table and admin membership workflow.
begin;

do $$
begin
  if to_regclass('public.support_tickets') is null then
    raise exception 'Apply the support ticket migration first';
  end if;
  if pg_catalog.to_regprocedure('public.worksync_is_admin()') is null then
    raise exception 'The administrator authorization function is required';
  end if;
  if exists (
    select 1 from storage.buckets
    where id = 'support-ticket-attachments' and public = true
  ) then
    raise exception 'The support-ticket-attachments bucket must remain private';
  end if;
end;
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'support-ticket-attachments',
  'support-ticket-attachments',
  false,
  5242880,
  array['application/pdf','image/jpeg','image/png']::text[]
)
on conflict (id) do nothing;

alter table public.support_tickets
  add column if not exists attachment_path text;
alter table public.support_tickets
  drop constraint if exists support_tickets_attachment_path_check;
alter table public.support_tickets
  add constraint support_tickets_attachment_path_check check (
    attachment_path is null or attachment_path ~ (
      '^' || requester_id::text || '/support/[a-f0-9-]{36}\.(pdf|jpg|png)$'
    )
  );
create unique index if not exists support_tickets_attachment_path_unique
  on public.support_tickets(attachment_path) where attachment_path is not null;

alter table public.support_tickets
  drop constraint if exists support_tickets_category_check;
alter table public.support_tickets
  add constraint support_tickets_category_check
  check (category in ('Account','Payments','Projects','Technical issue','Safety concern','Other','Capacity increase'));

create table if not exists public.support_ticket_upload_tickets (
  file_path text primary key,
  user_id uuid not null references public."Users"(user_id) on delete cascade,
  expected_size integer not null check (expected_size between 1 and 5242880),
  expires_at timestamptz not null,
  validated_at timestamptz,
  validation_token uuid,
  check ((validated_at is null) = (validation_token is null))
);
alter table public.support_ticket_upload_tickets enable row level security;
revoke all on public.support_ticket_upload_tickets from public, anon, authenticated;
grant select on public.support_ticket_upload_tickets to authenticated;
grant select, insert, update, delete on public.support_ticket_upload_tickets to service_role;
drop policy if exists support_ticket_upload_owner_read on public.support_ticket_upload_tickets;
create policy support_ticket_upload_owner_read on public.support_ticket_upload_tickets
  for select to authenticated using (user_id = auth.uid());

drop policy if exists support_ticket_attachment_insert on storage.objects;
create policy support_ticket_attachment_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'support-ticket-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'support'
    and exists (
      select 1 from public.support_ticket_upload_tickets t
      where t.file_path = name and t.user_id = auth.uid()
        and t.expires_at > now()
    )
  );
drop policy if exists support_ticket_attachment_read on storage.objects;
create policy support_ticket_attachment_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'support-ticket-attachments'
    and public.worksync_is_admin()
    and exists (
      select 1 from public.support_tickets t where t.attachment_path = name
    )
  );

create or replace function public.worksync_submit_support_ticket(
  p_category text,
  p_subject text,
  p_description text,
  p_attachment_path text,
  p_validation_token uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ticket uuid;
  support_priority text := 'normal';
  premium_plan text;
begin
  if auth.uid() is null then raise exception 'Sign in to submit a support ticket'; end if;
  if p_category not in ('Account','Payments','Projects','Technical issue','Safety concern','Other','Capacity increase') then
    raise exception 'Choose a valid category';
  end if;
  if length(trim(p_subject)) not between 4 and 120 then
    raise exception 'Subject must be between 4 and 120 characters';
  end if;
  if length(trim(p_description)) not between 20 and 4000 then
    raise exception 'Details must be between 20 and 4000 characters';
  end if;

  if pg_catalog.to_regprocedure('public.worksync_effective_subscription_plan(uuid)') is not null then
    execute 'select public.worksync_effective_subscription_plan($1)'
      into premium_plan using auth.uid();
    if premium_plan = 'pro' then support_priority := 'high'; end if;
  end if;

  if p_attachment_path is not null then
    if p_validation_token is null or p_attachment_path !~ (
      '^' || auth.uid()::text || '/support/[a-f0-9-]{36}\.(pdf|jpg|png)$'
    ) then
      raise exception 'Choose a valid support ticket attachment';
    end if;
    perform 1 from public.support_ticket_upload_tickets u
    where u.file_path = p_attachment_path and u.user_id = auth.uid()
      and u.expires_at > pg_catalog.now()
      and u.validated_at is not null
      and u.validation_token = p_validation_token
    for update;
    if not found then raise exception 'The attachment must be uploaded and verified first'; end if;
  elsif p_validation_token is not null then
    raise exception 'Attachment validation reference is invalid';
  end if;

  insert into public.support_tickets(requester_id,category,subject,description,priority,attachment_path)
  values(auth.uid(),p_category,trim(p_subject),trim(p_description),support_priority,p_attachment_path)
  returning ticket_id into ticket;

  if p_attachment_path is not null then
    delete from public.support_ticket_upload_tickets
    where file_path = p_attachment_path and user_id = auth.uid();
  end if;
  return ticket;
end;
$$;
revoke all on function public.worksync_submit_support_ticket(text,text,text,text,uuid)
  from public, anon;
grant execute on function public.worksync_submit_support_ticket(text,text,text,text,uuid)
  to authenticated;

notify pgrst, 'reload schema';
commit;
