-- PREPARED, NOT APPLIED. Independent reusable planning templates and read-only shares.
create table if not exists public.project_plans (
  plan_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public."Users"(user_id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 2000),
  content jsonb not null default '{"columns":[]}'::jsonb check (jsonb_typeof(content) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_plans_owner_updated on public.project_plans(owner_id, updated_at desc);

create or replace function public.worksync_touch_project_plan()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.worksync_touch_project_plan() from public;
create trigger project_plans_touch_updated_at before update on public.project_plans
for each row execute function public.worksync_touch_project_plan();

create table if not exists public.project_plan_shares (
  plan_id uuid not null references public.project_plans(plan_id) on delete cascade,
  owner_id uuid not null references public."Users"(user_id) on delete cascade,
  recipient_id uuid not null references public."Users"(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, recipient_id),
  check (owner_id <> recipient_id)
);
create index if not exists project_plan_shares_recipient on public.project_plan_shares(recipient_id, created_at desc);
alter table public.project_plan_shares enable row level security;
create policy project_plan_shares_read_parties on public.project_plan_shares for select to authenticated
 using (owner_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy project_plan_shares_owner_add on public.project_plan_shares for insert to authenticated
 with check (owner_id = (select auth.uid()) and exists(select 1 from public.project_plans p where p.plan_id=project_plan_shares.plan_id and p.owner_id=(select auth.uid())));
create policy project_plan_shares_owner_remove on public.project_plan_shares for delete to authenticated
 using (owner_id = (select auth.uid()));
grant select, insert, delete on public.project_plan_shares to authenticated;

alter table public.project_plans enable row level security;
create policy project_plans_read_owner_or_recipient on public.project_plans for select to authenticated
 using (owner_id = (select auth.uid()) or exists (
   select 1 from public.project_plan_shares s where s.plan_id = project_plans.plan_id and s.recipient_id = (select auth.uid())
 ));
create policy project_plans_insert_owner on public.project_plans for insert to authenticated
 with check (owner_id = (select auth.uid()));
create policy project_plans_update_owner on public.project_plans for update to authenticated
 using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy project_plans_delete_owner on public.project_plans for delete to authenticated
 using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.project_plans to authenticated;

