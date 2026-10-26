-- PREPARED, NOT APPLIED. Adds seller-registration review separately from
-- identity verification and tax treatment. Existing projects are untouched.
begin;

-- Provision this designated private-document bucket if missing and enforce its
-- intended private setting. Verification, tax, and seller documents are not public assets.
insert into storage.buckets(id,name,public,file_size_limit)
values('verification-documents','verification-documents',false,10485760)
on conflict(id) do nothing;
update storage.buckets set public=false where id='verification-documents';

do $$
begin
  if not exists (select 1 from storage.buckets where id='verification-documents' and public=false) then
    raise exception 'Could not provision a private verification-documents Storage bucket';
  end if;
end $$;

create table public.freelancer_seller_verification_requirements (
  requirement_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public."Users"(user_id),
  freelancer_id uuid not null references public.freelancer_profiles(freelancer_id),
  document_type text not null check (document_type in ('bir_cor','seller_registration_support')),
  requirement_label text not null check (length(trim(requirement_label)) between 2 and 200),
  required_for_publishing boolean not null default true,
  status text not null default 'not_submitted' check (status in ('not_submitted','pending','verified','rejected','not_applicable')),
  current_submission_id uuid,
  review_reason text not null default '',
  reviewed_by uuid references public."Users"(user_id),
  reviewed_at timestamptz,
  updated_by uuid references public."Users"(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (freelancer_id, document_type),
  check (
    (status='not_submitted' and current_submission_id is null and reviewed_by is null and reviewed_at is null)
    or (status='pending' and current_submission_id is not null and reviewed_by is null and reviewed_at is null)
    or (status in ('verified','rejected') and current_submission_id is not null and reviewed_by is not null and reviewed_at is not null)
    or (status='not_applicable' and reviewed_by is not null and reviewed_at is not null)
  )
);

create table public.freelancer_seller_verification_submissions (
  submission_id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.freelancer_seller_verification_requirements(requirement_id) on delete restrict,
  user_id uuid not null references public."Users"(user_id),
  freelancer_id uuid not null references public.freelancer_profiles(freelancer_id),
  document_path text not null unique,
  registered_name text not null default '',
  status text not null default 'pending' check (status in ('pending','verified','rejected','not_applicable')),
  is_current boolean not null default true,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public."Users"(user_id),
  reviewed_at timestamptz,
  review_reason text not null default '',
  check (
    (status='pending' and reviewed_by is null and reviewed_at is null)
    or (status in ('verified','rejected','not_applicable') and reviewed_by is not null and reviewed_at is not null)
  )
);
create unique index freelancer_seller_one_current_submission
  on public.freelancer_seller_verification_submissions(requirement_id)
  where is_current;
create index freelancer_seller_submissions_owner_status
  on public.freelancer_seller_verification_submissions(user_id,status,submitted_at desc);
alter table public.freelancer_seller_verification_requirements
  add constraint freelancer_seller_current_submission_fk
  foreign key (current_submission_id)
  references public.freelancer_seller_verification_submissions(submission_id)
  on delete restrict;

create table public.freelancer_seller_verification_events (
  event_id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.freelancer_seller_verification_requirements(requirement_id) on delete restrict,
  submission_id uuid references public.freelancer_seller_verification_submissions(submission_id) on delete restrict,
  user_id uuid not null references public."Users"(user_id),
  actor_id uuid not null references public."Users"(user_id),
  actor_kind text not null check (actor_kind in ('freelancer','admin','system')),
  action text not null check (action in ('submitted','verified','rejected','not_applicable','requirement_added','requirement_changed','resubmitted')),
  previous_status text check (previous_status is null or previous_status in ('not_submitted','pending','verified','rejected','not_applicable')),
  new_status text not null check (new_status in ('not_submitted','pending','verified','rejected','not_applicable')),
  reason text not null default '',
  created_at timestamptz not null default now()
);
create index freelancer_seller_events_owner_time
  on public.freelancer_seller_verification_events(user_id,created_at desc);

create table public.freelancer_seller_verification_upload_tickets (
  document_path text primary key,
  user_id uuid not null references public."Users"(user_id) on delete cascade,
  requirement_id uuid not null references public.freelancer_seller_verification_requirements(requirement_id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.freelancer_seller_verification_requirements enable row level security;
alter table public.freelancer_seller_verification_submissions enable row level security;
alter table public.freelancer_seller_verification_events enable row level security;
alter table public.freelancer_seller_verification_upload_tickets enable row level security;
revoke all on public.freelancer_seller_verification_requirements,
  public.freelancer_seller_verification_submissions,
  public.freelancer_seller_verification_events,
  public.freelancer_seller_verification_upload_tickets
  from public,anon,authenticated;
grant select on public.freelancer_seller_verification_requirements,
  public.freelancer_seller_verification_submissions,
  public.freelancer_seller_verification_events to authenticated;
grant all on public.freelancer_seller_verification_requirements,
  public.freelancer_seller_verification_submissions,
  public.freelancer_seller_verification_events,
  public.freelancer_seller_verification_upload_tickets to service_role;

create policy freelancer_seller_requirements_read on public.freelancer_seller_verification_requirements
  for select to authenticated using (user_id=auth.uid() or public.worksync_is_admin());
create policy freelancer_seller_submissions_read on public.freelancer_seller_verification_submissions
  for select to authenticated using (user_id=auth.uid() or public.worksync_is_admin());
create policy freelancer_seller_events_read on public.freelancer_seller_verification_events
  for select to authenticated using (user_id=auth.uid() or public.worksync_is_admin());

create or replace function public.worksync_freelancer_seller_eligible(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select p_user is not null
    and exists(select 1 from public.freelancer_profiles f where f.user_id=p_user)
    and exists(select 1 from public.freelancer_seller_verification_requirements r
               where r.user_id=p_user and r.document_type='bir_cor')
    and not exists(select 1 from public.freelancer_seller_verification_requirements r
                   where r.user_id=p_user and r.required_for_publishing
                     and r.status not in ('verified','not_applicable'));
$$;
revoke all on function public.worksync_freelancer_seller_eligible(uuid) from public,anon,authenticated;
grant execute on function public.worksync_freelancer_seller_eligible(uuid) to service_role;

create or replace function public.worksync_init_freelancer_seller_requirement()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.freelancer_seller_verification_requirements
    (user_id,freelancer_id,document_type,requirement_label,required_for_publishing,status,updated_by)
  values(new.user_id,new.freelancer_id,'bir_cor','BIR Certificate of Registration (BIR Form 2303)',true,'not_submitted',new.user_id)
  on conflict(freelancer_id,document_type) do nothing;
  return new;
end; $$;
revoke all on function public.worksync_init_freelancer_seller_requirement() from public,anon,authenticated;
drop trigger if exists worksync_init_freelancer_seller_requirement on public.freelancer_profiles;
create trigger worksync_init_freelancer_seller_requirement
  after insert on public.freelancer_profiles
  for each row execute function public.worksync_init_freelancer_seller_requirement();
insert into public.freelancer_seller_verification_requirements
  (user_id,freelancer_id,document_type,requirement_label,required_for_publishing,status,updated_by)
select f.user_id,f.freelancer_id,'bir_cor','BIR Certificate of Registration (BIR Form 2303)',true,'not_submitted',f.user_id
from public.freelancer_profiles f
on conflict(freelancer_id,document_type) do nothing;

create or replace function public.worksync_seller_document_upload_allowed(p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.freelancer_seller_verification_upload_tickets t
    where t.document_path=p_name and t.user_id=auth.uid() and t.expires_at>now()
      and p_name like auth.uid()::text||'/seller-verification/%');
$$;
revoke all on function public.worksync_seller_document_upload_allowed(text) from public,anon;
grant execute on function public.worksync_seller_document_upload_allowed(text) to authenticated;
create policy freelancer_seller_document_upload on storage.objects
  for insert to authenticated
  with check(bucket_id='verification-documents' and public.worksync_seller_document_upload_allowed(name));
create policy freelancer_seller_upload_guard on storage.objects as restrictive
  for insert to authenticated
  with check(bucket_id<>'verification-documents'
    or (storage.foldername(name))[2]<>'seller-verification'
    or public.worksync_seller_document_upload_allowed(name));
create policy freelancer_seller_document_read on storage.objects
  for select to authenticated using(bucket_id='verification-documents' and (
    ((storage.foldername(name))[1]=auth.uid()::text and (storage.foldername(name))[2]='seller-verification')
    or (public.worksync_is_admin() and exists(
      select 1 from public.freelancer_seller_verification_submissions s where s.document_path=name
    ))
  ));
create policy freelancer_seller_document_delete_guard on storage.objects as restrictive
  for delete to authenticated using(bucket_id<>'verification-documents'
    or (storage.foldername(name))[2]<>'seller-verification'
    or not exists(select 1 from public.freelancer_seller_verification_submissions s where s.document_path=name));

-- Keep the existing private-file checks and add seller submissions to the
-- administrator branch of the restrictive verification-document policy.
drop policy if exists worksync_private_files_guard on storage.objects;
create policy worksync_private_files_guard on storage.objects as restrictive for select to authenticated using(
 bucket_id not in ('project-attachments','verification-documents')
 or (bucket_id='project-attachments' and (public.worksync_project_file_read(name) or public.worksync_private_file_orphan(bucket_id,name)))
 or (bucket_id='verification-documents' and (
   ((storage.foldername(name))[1]=auth.uid()::text)
   or (public.worksync_is_admin() and (
      exists(select 1 from public.verification_requests v where name=any(v.document_paths))
      or exists(select 1 from public.freelancer_tax_declarations d where name=d.document_path)
      or exists(select 1 from public.tax_documents d where name=d.document_path)
      or exists(select 1 from public.freelancer_seller_verification_submissions s where name=s.document_path)
   ))
 ))
);

create or replace function public.worksync_submit_freelancer_seller_document(
  p_user uuid,p_document_type text,p_document_path text,p_registered_name text
) returns uuid language plpgsql security definer set search_path='' as $$
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
  update public.freelancer_seller_verification_submissions
    set is_current=false
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
  values(req.requirement_id,new_submission,p_user,p_user,'freelancer',case when prior_status='rejected' then 'resubmitted' else 'submitted' end,prior_status,'pending','');
  insert into public.notifications(user_id,type,title,message,related_id,is_read)
  values(p_user,'seller_verification','Seller document submitted','Your seller document is pending administrator review. You can track its status in Settings.',req.requirement_id,false);
  return new_submission;
end; $$;
revoke all on function public.worksync_submit_freelancer_seller_document(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.worksync_submit_freelancer_seller_document(uuid,text,text,text) to service_role;

create or replace function public.worksync_admin_review_seller_requirement(
  p_actor uuid,p_requirement_id uuid,p_action text,p_reason text
) returns void language plpgsql security definer set search_path='' as $$
declare req public.freelancer_seller_verification_requirements%rowtype;
        previous text; current_id uuid;
begin
  if not exists(select 1 from public.admin_members a where a.user_id=p_actor) then raise exception 'Administrator access required'; end if;
  if coalesce(length(trim(p_reason)),0)<2 or length(p_reason)>2000 then raise exception 'Enter a clear review reason'; end if;
  select * into req from public.freelancer_seller_verification_requirements where requirement_id=p_requirement_id for update;
  if not found then raise exception 'Seller verification requirement not found'; end if;
  previous:=req.status;
  current_id:=req.current_submission_id;
  if p_action in ('verified','rejected') then
    if current_id is null or req.status<>'pending' then raise exception 'Only pending seller documents can be reviewed'; end if;
    if p_action='rejected' and length(trim(p_reason))<12 then raise exception 'Provide a meaningful rejection reason'; end if;
    update public.freelancer_seller_verification_submissions set status=p_action,reviewed_by=p_actor,reviewed_at=now(),review_reason=trim(p_reason)
      where submission_id=current_id and status='pending' and is_current;
    if not found then raise exception 'Pending seller submission not found'; end if;
    update public.freelancer_seller_verification_requirements set status=p_action,review_reason=trim(p_reason),reviewed_by=p_actor,reviewed_at=now(),updated_by=p_actor,updated_at=now()
      where requirement_id=p_requirement_id;
    insert into public.freelancer_seller_verification_events(requirement_id,submission_id,user_id,actor_id,actor_kind,action,previous_status,new_status,reason)
      values(p_requirement_id,current_id,req.user_id,p_actor,'admin',p_action,previous,p_action,trim(p_reason));
    insert into public.notifications(user_id,type,title,message,related_id,is_read)
      values(req.user_id,'seller_verification',case when p_action='verified' then 'Seller document verified' else 'Seller document needs correction' end,
        case when p_action='verified' then 'Your seller document was verified. Check Settings for your publishing eligibility.' else 'Your seller document was rejected: '||trim(p_reason)||' Submit a corrected document from Settings.' end,
        p_requirement_id,false);
  elsif p_action='not_applicable' then
    if current_id is not null then
      update public.freelancer_seller_verification_submissions set status='not_applicable',reviewed_by=p_actor,reviewed_at=now(),review_reason=trim(p_reason)
        where submission_id=current_id and is_current;
    end if;
    update public.freelancer_seller_verification_requirements set status='not_applicable',review_reason=trim(p_reason),reviewed_by=p_actor,reviewed_at=now(),updated_by=p_actor,updated_at=now()
      where requirement_id=p_requirement_id;
    insert into public.freelancer_seller_verification_events(requirement_id,submission_id,user_id,actor_id,actor_kind,action,previous_status,new_status,reason)
      values(p_requirement_id,current_id,req.user_id,p_actor,'admin','not_applicable',previous,'not_applicable',trim(p_reason));
    insert into public.notifications(user_id,type,title,message,related_id,is_read)
      values(req.user_id,'seller_verification','Seller document marked not applicable','An administrator marked this seller document not applicable: '||trim(p_reason),p_requirement_id,false);
  else
    raise exception 'Unsupported seller verification review action';
  end if;
  insert into public.admin_audit_log(admin_id,action,target_id,details)
    values(p_actor,'seller_verification:'||p_action,p_requirement_id,jsonb_build_object('document_type',req.document_type,'reason',trim(p_reason),'previous_status',previous));
end; $$;
revoke all on function public.worksync_admin_review_seller_requirement(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.worksync_admin_review_seller_requirement(uuid,uuid,text,text) to service_role;

create or replace function public.worksync_admin_configure_seller_requirement(
  p_actor uuid,p_user uuid,p_document_type text,p_label text,p_required boolean,p_reason text
) returns uuid language plpgsql security definer set search_path='' as $$
declare profile_id uuid; req_id uuid; prior_status text; next_status text;
begin
  if not exists(select 1 from public.admin_members a where a.user_id=p_actor) then raise exception 'Administrator access required'; end if;
  if p_document_type not in ('bir_cor','seller_registration_support') then raise exception 'Unsupported seller requirement type'; end if;
  if coalesce(length(trim(p_label)),0) not between 2 and 200 or coalesce(length(trim(p_reason)),0)<2 or length(p_reason)>2000 then
    raise exception 'Provide a requirement label and a clear configuration reason';
  end if;
  select f.freelancer_id into profile_id from public.freelancer_profiles f where f.user_id=p_user for update;
  if profile_id is null then raise exception 'Freelancer account not found'; end if;
  select requirement_id,status into req_id,prior_status from public.freelancer_seller_verification_requirements
    where freelancer_id=profile_id and document_type=p_document_type for update;
  if found and prior_status='pending' then raise exception 'Resolve the pending submission before changing this requirement'; end if;
  next_status:=case when p_required then 'not_submitted' else 'not_applicable' end;
  if req_id is null then
    insert into public.freelancer_seller_verification_requirements
      (user_id,freelancer_id,document_type,requirement_label,required_for_publishing,status,review_reason,reviewed_by,reviewed_at,updated_by)
    values(p_user,profile_id,p_document_type,trim(p_label),p_required,next_status,trim(p_reason),case when p_required then null else p_actor end,case when p_required then null else now() end,p_actor)
    returning requirement_id into req_id;
  else
    update public.freelancer_seller_verification_submissions set is_current=false
      where requirement_id=req_id and is_current;
    update public.freelancer_seller_verification_requirements set
      requirement_label=trim(p_label),required_for_publishing=p_required,status=next_status,current_submission_id=null,
      review_reason=trim(p_reason),reviewed_by=case when p_required then null else p_actor end,
      reviewed_at=case when p_required then null else now() end,updated_by=p_actor,updated_at=now()
    where requirement_id=req_id;
  end if;
  insert into public.freelancer_seller_verification_events
    (requirement_id,user_id,actor_id,actor_kind,action,previous_status,new_status,reason)
  values(req_id,p_user,p_actor,'admin',case when prior_status is null then 'requirement_added' else 'requirement_changed' end,prior_status,next_status,trim(p_reason));
  insert into public.notifications(user_id,type,title,message,related_id,is_read)
  values(p_user,'seller_verification','Seller verification requirements updated',
    case when p_required then 'A seller document is required before you can publish services: '||trim(p_label)
         else 'A seller document was marked not applicable: '||trim(p_label)||'. '||trim(p_reason) end,
    req_id,false);
  insert into public.admin_audit_log(admin_id,action,target_id,details)
  values(p_actor,'seller_verification:requirement_configured',req_id,jsonb_build_object('user_id',p_user,'document_type',p_document_type,'required',p_required,'label',trim(p_label),'reason',trim(p_reason)));
  return req_id;
end; $$;
revoke all on function public.worksync_admin_configure_seller_requirement(uuid,uuid,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.worksync_admin_configure_seller_requirement(uuid,uuid,text,text,boolean,text) to service_role;

create or replace function public.worksync_guard_seller_service_publish()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
  select f.user_id into owner from public.freelancer_profiles f where f.freelancer_id=new.freelancer_id;
  if owner is null then raise exception 'Freelancer account not found'; end if;
  if tg_op='INSERT' and not public.worksync_freelancer_seller_eligible(owner) then
    raise exception 'Complete the required seller document review in Settings before submitting freelancer services';
  end if;
  if tg_op='UPDATE' and lower(new.status::text) in ('active','published') and not public.worksync_freelancer_seller_eligible(owner) then
    raise exception 'Complete the required seller document review in Settings before publishing freelancer services';
  end if;
  return new;
end; $$;
revoke all on function public.worksync_guard_seller_service_publish() from public,anon,authenticated;
drop trigger if exists worksync_guard_seller_service_publish on public.services;
create trigger worksync_guard_seller_service_publish
  before insert or update of status,freelancer_id on public.services
  for each row execute function public.worksync_guard_seller_service_publish();

create or replace function public.worksync_guard_seller_listing_submission()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.listing_type='service' and new.status in ('pending_review','approved')
     and not public.worksync_freelancer_seller_eligible(new.owner_id) then
    raise exception 'Required seller documents must be verified before submitting or publishing freelancer services';
  end if;
  return new;
end; $$;
revoke all on function public.worksync_guard_seller_listing_submission() from public,anon,authenticated;
drop trigger if exists worksync_guard_seller_listing_submission on public.listing_submissions;
create trigger worksync_guard_seller_listing_submission
  before insert or update of status,listing_type,owner_id on public.listing_submissions
  for each row execute function public.worksync_guard_seller_listing_submission();

create or replace function public.worksync_listing_visible(p_kind text,p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.listing_submissions s
    where s.listing_type=p_kind and s.listing_id=p_id
      and s.status='approved' and s.archived_at is null
  ) and not exists(
    select 1 from public.listing_moderation m
    where m.listing_type=p_kind and m.listing_id=p_id and m.hidden
  ) and (p_kind<>'service' or exists(
    select 1 from public.services s join public.freelancer_profiles f using(freelancer_id)
    where s.service_id=p_id and public.worksync_freelancer_seller_eligible(f.user_id)
  ));
$$;
revoke all on function public.worksync_listing_visible(text,uuid) from public;
grant execute on function public.worksync_listing_visible(text,uuid) to anon,authenticated;

notify pgrst,'reload schema';
commit;
