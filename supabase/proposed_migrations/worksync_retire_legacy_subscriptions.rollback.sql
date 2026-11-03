-- PREPARED, NOT APPLIED.
-- Recreate the previously empty legacy public.subscriptions schema.
-- This restores structure and access, not rows; the forward script requires zero rows.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create table public.subscriptions (
  subscription_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan text,
  status text,
  started_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint subscriptions_user_id_fkey
    foreign key (user_id)
    references public."Users"(user_id)
    on delete cascade
);

alter table public.subscriptions enable row level security;

create policy subscriptions_read
  on public.subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

grant all privileges on table public.subscriptions to authenticated, service_role;

commit;
