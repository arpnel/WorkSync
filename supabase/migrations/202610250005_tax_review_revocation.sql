-- PREPARED, NOT APPLIED. Apply only after the prerequisite tax migrations.
-- Adds auditable revocation to the existing document/declaration review workflows.
begin;

alter table public.tax_documents
  drop constraint if exists tax_documents_status_check;
alter table public.tax_documents
  add constraint tax_documents_status_check
  check (status in ('pending','verified','rejected','expired','revoked'));

alter table public.tax_document_review_events
  drop constraint if exists tax_document_review_events_new_status_check;
alter table public.tax_document_review_events
  add constraint tax_document_review_events_new_status_check
  check (new_status in ('verified','rejected','expired','revoked'));

alter table public.freelancer_tax_declarations
  drop constraint if exists freelancer_tax_declarations_status_check;
alter table public.freelancer_tax_declarations
  add constraint freelancer_tax_declarations_status_check
  check (status in ('pending','accepted','rejected','revoked'));

create table if not exists public.freelancer_tax_declaration_events (
  event_id uuid primary key default gen_random_uuid(),
  declaration_id uuid not null references public.freelancer_tax_declarations(declaration_id) on delete restrict,
  reviewer_id uuid not null references public."Users"(user_id),
  previous_status text not null,
  new_status text not null check (new_status in ('accepted','rejected','revoked')),
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.freelancer_tax_declaration_events enable row level security;
revoke all on public.freelancer_tax_declaration_events from public,anon,authenticated;
grant all on public.freelancer_tax_declaration_events to service_role;

create or replace function public.worksync_audit_tax_declaration_review() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status then
    insert into public.freelancer_tax_declaration_events(declaration_id,reviewer_id,previous_status,new_status,reason)
    values(new.declaration_id,new.reviewed_by,old.status,new.status,new.review_notes);
  end if;
  return new;
end; $$;
revoke all on function public.worksync_audit_tax_declaration_review() from public,anon,authenticated;
drop trigger if exists worksync_audit_tax_declaration_review on public.freelancer_tax_declarations;
create trigger worksync_audit_tax_declaration_review after update on public.freelancer_tax_declarations
  for each row execute function public.worksync_audit_tax_declaration_review();

notify pgrst,'reload schema';
commit;
