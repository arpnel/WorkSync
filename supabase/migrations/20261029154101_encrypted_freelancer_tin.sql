-- Stores freelancer TIN ciphertext separately from audited tax settings.
begin;

create table if not exists public.freelancer_tax_identifiers (
  user_id uuid primary key references public."Users"(user_id) on delete cascade,
  encrypted_tin text not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public."Users"(user_id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public."Users"(user_id),
  constraint freelancer_tax_identifiers_self_audit_check
    check (created_by = user_id and updated_by = user_id)
);

alter table public.freelancer_tax_identifiers enable row level security;
revoke all on public.freelancer_tax_identifiers from public, anon, authenticated;
grant select, insert, update on public.freelancer_tax_identifiers to service_role;

commit;
