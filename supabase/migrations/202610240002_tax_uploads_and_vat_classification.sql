-- PREPARED, NOT APPLIED. Requires 202610210002_philippine_tax_records.sql and
-- 202610220001_tax_documents_and_receipts.sql. Apply through the reviewed Supabase workflow.
begin;

-- Enforce the private tax file limits at the storage layer as well as in the API.
update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['application/pdf','image/jpeg','image/png']
where id = 'verification-documents';
do $$ begin
  if not exists(select 1 from storage.buckets where id='verification-documents') then
    raise exception 'Create the verification-documents Storage bucket before applying the tax upload migration';
  end if;
end $$;

-- The API creates exact-path tickets and signed upload tokens. Browsers can
-- upload directly to Storage (avoiding Vercel's 4.5 MB function body limit),
-- but cannot choose a path without a live server-issued ticket. The finalize API
-- validates the stored bytes before creating a tax_documents row.
create table if not exists public.tax_document_upload_tickets (
  document_path text primary key,
  user_id uuid not null references public."Users"(user_id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.tax_document_upload_tickets enable row level security;
revoke all on public.tax_document_upload_tickets from public,anon,authenticated;
grant all on public.tax_document_upload_tickets to service_role;

create or replace function public.worksync_tax_document_upload_allowed(p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.tax_document_upload_tickets t
    where t.document_path=p_name and t.user_id=auth.uid() and t.expires_at>now());
$$;
revoke all on function public.worksync_tax_document_upload_allowed(text) from public,anon;
grant execute on function public.worksync_tax_document_upload_allowed(text) to authenticated;

drop policy if exists tax_document_files_insert on storage.objects;
drop policy if exists freelancer_tax_declaration_upload on storage.objects;
drop policy if exists tax_documents_upload_server_only on storage.objects;
create policy tax_documents_upload_server_only on storage.objects
for insert to authenticated with check (bucket_id='verification-documents' and public.worksync_tax_document_upload_allowed(name));

alter table public.freelancer_tax_profiles
  add column if not exists vat_classification text not null default 'unverified';
alter table public.freelancer_tax_profiles
  drop constraint if exists freelancer_tax_profiles_vat_classification_check;
alter table public.freelancer_tax_profiles
  add constraint freelancer_tax_profiles_vat_classification_check
  check (vat_classification in ('unverified','pending_review','vat_registered','non_vat','rejected','expired'));

-- Existing enabled VAT accounts are not treated as verified unless a current
-- registration document supports that status.
drop trigger if exists worksync_audit_freelancer_tax_profile on public.freelancer_tax_profiles;
update public.freelancer_tax_profiles p
set vat_classification = case
  when exists (
    select 1 from public.tax_documents d
    where d.user_id=p.user_id and d.party_type='freelancer'
      and d.document_type='vat_registration' and d.status='verified'
      and (d.expires_at is null or d.expires_at>=current_date)
  ) then 'vat_registered'
  when p.freelancer_vat_applicable then 'pending_review'
  else 'unverified'
end;
update public.freelancer_tax_profiles
set freelancer_vat_applicable = (vat_classification='vat_registered');

alter table public.freelancer_tax_profile_events
  add column if not exists previous_vat_classification text,
  add column if not exists new_vat_classification text;
create or replace function public.worksync_audit_freelancer_tax_profile() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.updated_by is null or length(trim(new.updated_reason))=0 then
  raise exception 'Tax configuration changes require an administrator and reason' using errcode='23514';
 end if;
 if tg_op='INSERT' then
  insert into public.freelancer_tax_profile_events(user_id,reviewer_id,previous_withholding_applicable,new_withholding_applicable,previous_vat_applicable,new_vat_applicable,previous_vat_classification,new_vat_classification,reason)
  values(new.user_id,new.updated_by,null,new.marketplace_withholding_applicable,null,new.freelancer_vat_applicable,null,new.vat_classification,new.updated_reason);
 elsif new.marketplace_withholding_applicable is distinct from old.marketplace_withholding_applicable
    or new.freelancer_vat_applicable is distinct from old.freelancer_vat_applicable
    or new.vat_classification is distinct from old.vat_classification then
  insert into public.freelancer_tax_profile_events(user_id,reviewer_id,previous_withholding_applicable,new_withholding_applicable,previous_vat_applicable,new_vat_applicable,previous_vat_classification,new_vat_classification,reason)
  values(new.user_id,new.updated_by,old.marketplace_withholding_applicable,new.marketplace_withholding_applicable,old.freelancer_vat_applicable,new.freelancer_vat_applicable,old.vat_classification,new.vat_classification,new.updated_reason);
 end if;
 return new;
end; $$;
revoke all on function public.worksync_audit_freelancer_tax_profile() from public,anon,authenticated;
drop trigger if exists worksync_audit_freelancer_tax_profile on public.freelancer_tax_profiles;
create trigger worksync_audit_freelancer_tax_profile before insert or update on public.freelancer_tax_profiles
for each row execute function public.worksync_audit_freelancer_tax_profile();

-- Expose only an explicit verified marketplace classification, never documents,
-- tax declarations, income, or other profile tax settings.
create or replace function public.worksync_public_vat_classifications(p_user_ids uuid[])
returns table(user_id uuid, vat_classification text)
language sql stable security definer set search_path='' as $$
  select p.user_id,p.vat_classification
  from public.freelancer_tax_profiles p
  where p.user_id=any(coalesce(p_user_ids,'{}'::uuid[]))
    and p.vat_classification in ('vat_registered','non_vat')
    and exists (
      select 1 from public.tax_documents d
      where d.user_id=p.user_id and d.party_type='freelancer'
        and d.document_type='bir_cor' and d.status='verified'
        and (d.expires_at is null or d.expires_at>=current_date)
    )
    and (p.vat_classification<>'vat_registered' or exists (
      select 1 from public.tax_documents d
      where d.user_id=p.user_id and d.party_type='freelancer'
        and d.document_type='vat_registration' and d.status='verified'
        and (d.expires_at is null or d.expires_at>=current_date)
    ));
$$;
revoke all on function public.worksync_public_vat_classifications(uuid[]) from public;
grant execute on function public.worksync_public_vat_classifications(uuid[]) to anon,authenticated;

commit;
