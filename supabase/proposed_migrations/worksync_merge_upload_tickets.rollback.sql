-- PREPARED, NOT APPLIED.
-- Restore the three upload ticket tables and their original access paths.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
lock table public.upload_tickets in access exclusive mode;

create table public.support_ticket_upload_tickets (
  file_path text not null,
  user_id uuid not null references public."Users"(user_id) on delete cascade,
  expected_size integer not null,
  expires_at timestamptz not null,
  validated_at timestamptz,
  validation_token uuid,
  constraint support_ticket_upload_tickets_pkey primary key (file_path),
  constraint support_ticket_upload_tickets_expected_size_check
    check (expected_size >= 1 and expected_size <= 5242880),
  constraint support_ticket_upload_tickets_check
    check ((validated_at is null) = (validation_token is null))
);
alter table public.support_ticket_upload_tickets owner to postgres;
alter table public.support_ticket_upload_tickets enable row level security;
revoke all privileges on table public.support_ticket_upload_tickets from public, anon, authenticated, service_role;
grant select on table public.support_ticket_upload_tickets to authenticated;
grant all privileges on table public.support_ticket_upload_tickets to service_role;
create policy support_ticket_upload_owner_read on public.support_ticket_upload_tickets
  for select to authenticated using (user_id = (select auth.uid()));

create table public.tax_document_upload_tickets (
  document_path text not null,
  user_id uuid not null references public."Users"(user_id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint tax_document_upload_tickets_pkey primary key (document_path)
);
alter table public.tax_document_upload_tickets owner to postgres;
alter table public.tax_document_upload_tickets enable row level security;
revoke all privileges on table public.tax_document_upload_tickets from public, anon, authenticated, service_role;
grant all privileges on table public.tax_document_upload_tickets to service_role;

create table public.freelancer_seller_verification_upload_tickets (
  document_path text not null,
  user_id uuid not null references public."Users"(user_id) on delete cascade,
  requirement_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint freelancer_seller_verification_upload_tickets_pkey primary key (document_path),
  constraint freelancer_seller_verification_upload_ticke_requirement_id_fkey
    foreign key (requirement_id) references public.freelancer_seller_verification_requirements(requirement_id) on delete cascade
);
alter table public.freelancer_seller_verification_upload_tickets owner to postgres;
alter table public.freelancer_seller_verification_upload_tickets enable row level security;
revoke all privileges on table public.freelancer_seller_verification_upload_tickets from public, anon, authenticated, service_role;
grant all privileges on table public.freelancer_seller_verification_upload_tickets to service_role;

insert into public.support_ticket_upload_tickets(file_path,user_id,expected_size,expires_at,validated_at,validation_token)
select path,user_id,expected_size,expires_at,validated_at,validation_token
from public.upload_tickets where ticket_type='support';
insert into public.tax_document_upload_tickets(document_path,user_id,expires_at,created_at)
select path,user_id,expires_at,created_at
from public.upload_tickets where ticket_type='tax_document';
insert into public.freelancer_seller_verification_upload_tickets(document_path,user_id,requirement_id,expires_at,created_at)
select path,user_id,requirement_id,expires_at,created_at
from public.upload_tickets where ticket_type='seller_verification';

do $$ begin
  if (select count(*) from public.support_ticket_upload_tickets)
       <> (select count(*) from public.upload_tickets where ticket_type='support')
     or (select count(*) from public.tax_document_upload_tickets)
       <> (select count(*) from public.upload_tickets where ticket_type='tax_document')
     or (select count(*) from public.freelancer_seller_verification_upload_tickets)
       <> (select count(*) from public.upload_tickets where ticket_type='seller_verification') then
    raise exception 'Upload ticket rollback counts do not match';
  end if;
end $$;

create or replace function public.worksync_seller_document_upload_allowed(p_name text)
returns boolean language sql stable security definer set search_path to ''
as $function$
  select exists(select 1 from public.freelancer_seller_verification_upload_tickets t
    where t.document_path=p_name and t.user_id=auth.uid() and t.expires_at>now()
      and p_name like auth.uid()::text||'/seller-verification/%');
$function$;

create or replace function public.worksync_tax_document_upload_allowed(p_name text)
returns boolean language sql stable security definer set search_path to ''
as $function$
  select exists(select 1 from public.tax_document_upload_tickets t
    where t.document_path=p_name and t.user_id=auth.uid() and t.expires_at>now());
$function$;

create or replace function public.worksync_submit_freelancer_seller_document(
  p_user uuid, p_document_type text, p_document_path text, p_registered_name text
)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare profile_id uuid; req public.freelancer_seller_verification_requirements%rowtype;
        prior_status text; new_submission uuid;
begin
  if p_document_type not in ('bir_cor','seller_registration_support') then raise exception 'Unsupported seller document type'; end if;
  if p_document_path not like p_user::text||'/seller-verification/'||p_document_type||'/%'
     or p_document_path !~ ('^'||p_user::text||'/seller-verification/'||p_document_type||'/[a-f0-9-]{36}\.(pdf|png|jpg)$') then
    raise exception 'Invalid seller document path';
  end if;
  if p_document_type='bir_cor' and coalesce(length(trim(p_registered_name)),0)=0 then
    raise exception 'Enter the registered name shown on Form 2303';
  end if;
  select f.freelancer_id into profile_id from public.freelancer_profiles f where f.user_id=p_user for update;
  if profile_id is null then raise exception 'Freelancer account not found'; end if;
  select * into req from public.freelancer_seller_verification_requirements r
    where r.user_id=p_user and r.freelancer_id=profile_id and r.document_type=p_document_type for update;
  if not found then raise exception 'This seller document is not currently required or enabled'; end if;
  if req.status='not_applicable' then raise exception 'This seller document was marked not applicable; contact support to change its requirement'; end if;
  if req.status='pending' then raise exception 'This document is already awaiting administrator review'; end if;
  if not exists(select 1 from public.freelancer_seller_verification_upload_tickets t
       where t.document_path=p_document_path and t.user_id=p_user and t.requirement_id=req.requirement_id and t.expires_at>now())
     or not exists(select 1 from storage.objects o where o.bucket_id='verification-documents' and o.name=p_document_path) then
    raise exception 'Upload this document through the secure upload form before submitting it';
  end if;
  prior_status:=req.status;
  update public.freelancer_seller_verification_submissions set is_current=false
    where requirement_id=req.requirement_id and is_current;
  insert into public.freelancer_seller_verification_submissions
    (requirement_id,user_id,freelancer_id,document_path,registered_name,status,is_current)
  values(req.requirement_id,p_user,profile_id,p_document_path,coalesce(trim(p_registered_name),''),'pending',true)
  returning submission_id into new_submission;
  update public.freelancer_seller_verification_requirements set
    status='pending',current_submission_id=new_submission,review_reason='',reviewed_by=null,reviewed_at=null,
    updated_by=p_user,updated_at=now()
  where requirement_id=req.requirement_id;
  delete from public.freelancer_seller_verification_upload_tickets where document_path=p_document_path and user_id=p_user;
  insert into public.freelancer_seller_verification_events
    (requirement_id,submission_id,user_id,actor_id,actor_kind,action,previous_status,new_status,reason)
  values(req.requirement_id,new_submission,p_user,p_user,'freelancer',
    case when prior_status='rejected' then 'resubmitted' else 'submitted' end,prior_status,'pending','');
  insert into public.notifications(user_id,type,title,message,related_id,is_read)
  values(p_user,'seller_verification','Seller document submitted',
    'Your seller document is pending administrator review. You can track its status in Settings.',
    req.requirement_id,false);
  return new_submission;
end;
$function$;

create or replace function public.worksync_submit_support_ticket(
  p_category text, p_subject text, p_description text, p_attachment_path text, p_validation_token uuid
)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare ticket uuid; support_priority text := 'normal'; premium_plan text;
begin
  if auth.uid() is null then raise exception 'Sign in to submit a support ticket'; end if;
  if p_category not in ('Account','Payments','Projects','Technical issue','Safety concern','Other','Capacity increase') then raise exception 'Choose a valid category'; end if;
  if length(trim(p_subject)) not between 4 and 120 then raise exception 'Subject must be between 4 and 120 characters'; end if;
  if length(trim(p_description)) not between 20 and 4000 then raise exception 'Details must be between 20 and 4000 characters'; end if;
  if pg_catalog.to_regprocedure('public.worksync_effective_subscription_plan(uuid)') is not null then
    execute 'select public.worksync_effective_subscription_plan($1)' into premium_plan using auth.uid();
    if premium_plan = 'pro' then support_priority := 'high'; end if;
  end if;
  if p_attachment_path is not null then
    if p_validation_token is null or p_attachment_path !~ (
      '^' || auth.uid()::text || '/support/[a-f0-9-]{36}\.(pdf|jpg|png)$'
    ) then raise exception 'Choose a valid support ticket attachment'; end if;
    perform 1 from public.support_ticket_upload_tickets u
    where u.file_path=p_attachment_path and u.user_id=auth.uid() and u.expires_at>pg_catalog.now()
      and u.validated_at is not null and u.validation_token=p_validation_token for update;
    if not found then raise exception 'The attachment must be uploaded and verified first'; end if;
  elsif p_validation_token is not null then
    raise exception 'Attachment validation reference is invalid';
  end if;
  insert into public.support_tickets(requester_id,category,subject,description,priority,attachment_path)
  values(auth.uid(),p_category,trim(p_subject),trim(p_description),support_priority,p_attachment_path)
  returning ticket_id into ticket;
  if p_attachment_path is not null then
    delete from public.support_ticket_upload_tickets where file_path=p_attachment_path and user_id=auth.uid();
  end if;
  return ticket;
end;
$function$;

drop policy support_ticket_attachment_insert on storage.objects;
create policy support_ticket_attachment_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id='support-ticket-attachments'
    and (storage.foldername(name))[1]=auth.uid()::text
    and (storage.foldername(name))[2]='support'
    and exists (
      select 1 from public.support_ticket_upload_tickets t
      where t.file_path=name and t.user_id=auth.uid() and t.expires_at>now()
    )
  );

drop table public.upload_tickets;
notify pgrst, 'reload schema';
commit;
