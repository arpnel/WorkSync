-- PREPARED, NOT APPLIED.
-- Keep Didit identity decisions automatic. Admins can monitor provider results
-- and revoke an approved current verification with an audited reason.
begin;

alter table public.verification_requests
  drop constraint if exists verification_requests_status_check;
alter table public.verification_requests
  add constraint verification_requests_status_check
  check (status in ('pending','approved','rejected','expired','revoked'));

create or replace function public.worksync_admin_revoke_verification(
  p_request_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user uuid;
  request_status text;
  request_provider text;
  request_current boolean;
  admin_user uuid := auth.uid();
  reason_text text := btrim(coalesce(p_reason,''));
begin
  if admin_user is null or not public.worksync_is_admin() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  if p_request_id is null or length(reason_text) not between 1 and 500 then
    raise exception 'Enter a revocation reason of 1 to 500 characters' using errcode='22023';
  end if;

  select v.user_id,v.status,v.provider,v.is_current
    into request_user,request_status,request_provider,request_current
  from public.verification_requests v
  where v.request_id=p_request_id
  for update;

  if not found then
    raise exception 'Verification request was not found' using errcode='P0002';
  end if;
  if request_provider is distinct from 'didit'
    or request_status is distinct from 'approved'
    or request_current is distinct from true then
    raise exception 'Only an approved current Didit verification can be revoked' using errcode='55000';
  end if;

  update public.verification_requests
  set status='revoked',is_current=false,
      reviewed_by=admin_user,reviewed_at=clock_timestamp(),notes=reason_text
  where request_id=p_request_id;

  update public.freelancer_profiles
  set verification_status='rejected'
  where user_id=request_user and verification_status='approved';

  insert into public.admin_audit_log(admin_id,action,target_id,details)
  values (
    admin_user,
    'verification_revoked',
    p_request_id,
    jsonb_build_object(
      'user_id',request_user,
      'provider','didit',
      'previous_status','approved',
      'reason',reason_text
    )
  );
end;
$$;
revoke all on function public.worksync_admin_revoke_verification(uuid,text) from public,anon;
grant execute on function public.worksync_admin_revoke_verification(uuid,text) to authenticated;

-- Include provider decision and review metadata in the existing monitoring RPC.
do $$
declare
  fn text;
  old_fragment text := $old$concat('Applicant: ',v.user_id,E'\nReview notes: ',v.notes)$old$;
  new_fragment text := $new$concat('Applicant: ',v.user_id,E'\nProvider: ',v.provider,E'\nProvider status: ',coalesce(v.provider_status,'Not reported'),E'\nCurrent: ',v.is_current,E'\nVerified: ',coalesce(v.verified_at::text,'Not verified'),E'\nReviewed: ',coalesce(v.reviewed_at::text,'Not reviewed'),E'\nReviewed by: ',coalesce(v.reviewed_by::text,'Not reviewed'),E'\nReview notes: ',v.notes)$new$;
begin
  fn := pg_catalog.pg_get_functiondef(
    'public.worksync_admin_records(text,text,integer)'::regprocedure
  );
  if position('Provider status:' in fn)>0 then
    return;
  end if;
  if position(old_fragment in fn)=0 then
    raise exception 'Unexpected verification record mapping; inspect worksync_admin_records before applying';
  end if;
  execute replace(fn,old_fragment,new_fragment);
end;
$$;

notify pgrst,'reload schema';
commit;
