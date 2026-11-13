-- PREPARED, NOT APPLIED. Requires live schema/storage preflight before deployment.
-- Identity images share verification-documents with tax uploads; existing bucket settings are preserved.
begin;

create table if not exists public.manual_identity_verification_requests (
  request_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  id_front_path text not null,
  id_back_path text,
  selfie_path text not null,
  id_fingerprint text,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  is_current boolean not null default true,
  rejection_reason text,
  reviewed_by uuid references auth.users(id),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reverification_requested_at timestamptz,
  reverification_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manual_identity_fingerprint_format check (id_fingerprint is null or id_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint manual_identity_review_state check (
    (status = 'pending' and reviewed_at is null and reviewed_by is null)
    or (status in ('verified','rejected') and reviewed_at is not null and reviewed_by is not null)
  ),
  constraint manual_identity_reverification_pair check (
    (reverification_requested_at is null) = (reverification_reason is null)
  ),
  constraint manual_identity_request_front_path check (
    id_front_path in (
      user_id::text || '/identity-verification/' || request_id::text || '/front.jpg',
      user_id::text || '/identity-verification/' || request_id::text || '/front.png'
    )
  ),
  constraint manual_identity_request_back_path check (
    id_back_path is null or id_back_path in (
      user_id::text || '/identity-verification/' || request_id::text || '/back.jpg',
      user_id::text || '/identity-verification/' || request_id::text || '/back.png'
    )
  ),
  constraint manual_identity_request_selfie_path check (
    selfie_path in (
      user_id::text || '/identity-verification/' || request_id::text || '/selfie.jpg',
      user_id::text || '/identity-verification/' || request_id::text || '/selfie.png'
    )
  )
);

create unique index if not exists manual_identity_one_current_per_user
  on public.manual_identity_verification_requests(user_id) where is_current;
create index if not exists manual_identity_pending_queue
  on public.manual_identity_verification_requests(submitted_at desc)
  where is_current and status='pending';
create index if not exists manual_identity_fingerprint_idx
  on public.manual_identity_verification_requests(id_fingerprint)
  where id_fingerprint is not null;

create table if not exists public.manual_identity_verification_events (
  event_id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.manual_identity_verification_requests(request_id) on delete cascade,
  actor_id uuid references auth.users(id),
  event_type text not null check (event_type in ('submitted','approved','rejected','reverification_requested')),
  reason text,
  created_at timestamptz not null default now()
);

revoke all on public.manual_identity_verification_requests, public.manual_identity_verification_events
  from public, anon, authenticated, service_role;
-- The API reads request rows with the service role; writes go through the restricted RPCs below.
grant select on public.manual_identity_verification_requests to service_role;
alter table public.manual_identity_verification_requests enable row level security;
alter table public.manual_identity_verification_events enable row level security;

-- Fail safely if the shared bucket is public or cannot accept these images. Do not alter existing PDF support/limits.
do $$
declare b storage.buckets%rowtype;
begin
  select * into b from storage.buckets where id='verification-documents';
  if found then
    if b.public then
      raise exception 'verification-documents must be private before identity review can use it';
    end if;
    if b.file_size_limit is not null and b.file_size_limit < 5242880 then
      raise exception 'verification-documents has a file limit below the identity upload limit';
    end if;
    if b.allowed_mime_types is not null and
       (not ('image/jpeg'=any(b.allowed_mime_types)) or not ('image/png'=any(b.allowed_mime_types))) then
      raise exception 'verification-documents must allow JPEG and PNG uploads';
    end if;
  else
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values('verification-documents','verification-documents',false,5242880,
      array['image/jpeg','image/png','application/pdf']);
  end if;
end $$;

create or replace function public.worksync_submit_manual_identity_verification(
  p_user_id uuid,
  p_request_id uuid,
  p_id_front_path text,
  p_id_back_path text,
  p_selfie_path text,
  p_id_fingerprint text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  if p_id_front_path not in (
    p_user_id::text || '/identity-verification/' || p_request_id::text || '/front.jpg',
    p_user_id::text || '/identity-verification/' || p_request_id::text || '/front.png'
  ) or p_selfie_path not in (
    p_user_id::text || '/identity-verification/' || p_request_id::text || '/selfie.jpg',
    p_user_id::text || '/identity-verification/' || p_request_id::text || '/selfie.png'
  ) or (p_id_back_path is not null and p_id_back_path not in (
    p_user_id::text || '/identity-verification/' || p_request_id::text || '/back.jpg',
    p_user_id::text || '/identity-verification/' || p_request_id::text || '/back.png'
  )) then
    raise exception 'Invalid evidence path';
  end if;
  if p_id_fingerprint is not null and p_id_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid identity fingerprint';
  end if;
  perform 1 from public.manual_identity_verification_requests
    where user_id=p_user_id and is_current for update;
  if exists(select 1 from public.manual_identity_verification_requests
    where user_id=p_user_id and is_current and status='pending') then
    raise exception 'A submission is already pending';
  end if;
  if exists(select 1 from public.manual_identity_verification_requests
    where user_id=p_user_id and is_current and status='verified' and reverification_requested_at is null) then
    raise exception 'Identity is already verified';
  end if;
  update public.manual_identity_verification_requests
    set is_current=false, updated_at=pg_catalog.now()
    where user_id=p_user_id and is_current;
  insert into public.manual_identity_verification_requests(
    request_id,user_id,id_front_path,id_back_path,selfie_path,id_fingerprint
  ) values (p_request_id,p_user_id,p_id_front_path,p_id_back_path,p_selfie_path,p_id_fingerprint);
  insert into public.manual_identity_verification_events(request_id,actor_id,event_type)
    values(p_request_id,p_user_id,'submitted');
end;
$$;
revoke all on function public.worksync_submit_manual_identity_verification(uuid,uuid,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.worksync_submit_manual_identity_verification(uuid,uuid,text,text,text,text)
  to service_role;

create or replace function public.worksync_admin_review_manual_identity_verification(
  p_admin_id uuid,
  p_request_id uuid,
  p_action text,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r public.manual_identity_verification_requests%rowtype;
begin
  if not exists(select 1 from public.admin_members where user_id=p_admin_id) then
    raise exception 'Administrator access required';
  end if;
  select * into r from public.manual_identity_verification_requests
    where request_id=p_request_id and is_current for update;
  if not found then raise exception 'Current request not found'; end if;
  if p_action not in ('approve','reject','request_reverification') then
    raise exception 'Invalid review action';
  end if;
  if p_action in ('approve','reject') and r.status <> 'pending' then
    raise exception 'Only pending requests can be reviewed';
  end if;
  if p_action in ('reject','request_reverification') and
     (pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) < 2 or
      pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) > 500) then
    raise exception 'Enter a review reason from 2 to 500 characters';
  end if;

  -- Existing profile trigger permits verification changes only for admins.
  perform pg_catalog.set_config('request.jwt.claim.sub',p_admin_id::text,true);
  if p_action='approve' then
    update public.manual_identity_verification_requests
      set status='verified',rejection_reason=null,reviewed_by=p_admin_id,
          reviewed_at=pg_catalog.now(),updated_at=pg_catalog.now()
      where request_id=p_request_id;
    update public.freelancer_profiles set verification_status='approved' where user_id=r.user_id;
    insert into public.manual_identity_verification_events(request_id,actor_id,event_type)
      values(p_request_id,p_admin_id,'approved');
  elsif p_action='reject' then
    update public.manual_identity_verification_requests
      set status='rejected',rejection_reason=pg_catalog.btrim(p_reason),reviewed_by=p_admin_id,
          reviewed_at=pg_catalog.now(),updated_at=pg_catalog.now()
      where request_id=p_request_id;
    update public.freelancer_profiles set verification_status='rejected' where user_id=r.user_id;
    insert into public.manual_identity_verification_events(request_id,actor_id,event_type,reason)
      values(p_request_id,p_admin_id,'rejected',pg_catalog.btrim(p_reason));
  else
    update public.manual_identity_verification_requests
      set reverification_requested_at=pg_catalog.now(),reverification_reason=pg_catalog.btrim(p_reason),
          updated_at=pg_catalog.now()
      where request_id=p_request_id and status='verified';
    if not found then raise exception 'Reverification can only be requested for a verified identity'; end if;
    insert into public.manual_identity_verification_events(request_id,actor_id,event_type,reason)
      values(p_request_id,p_admin_id,'reverification_requested',pg_catalog.btrim(p_reason));
  end if;
end;
$$;
revoke all on function public.worksync_admin_review_manual_identity_verification(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.worksync_admin_review_manual_identity_verification(uuid,uuid,text,text)
  to service_role;

commit;



