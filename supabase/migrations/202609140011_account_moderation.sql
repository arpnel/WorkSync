-- Marketplace suspension prevents new business; existing work, messages and resolution remain accessible.
begin;
create table if not exists public.account_moderation (
 user_id uuid primary key references public."Users"(user_id),
 status text not null check(status in ('active','suspended')),
 reason text not null check(length(trim(reason)) between 1 and 5000),
 admin_id uuid not null references public."Users"(user_id),
 changed_at timestamptz not null default now(), expires_at timestamptz
);
alter table public.account_moderation enable row level security;
revoke all on public.account_moderation from anon,authenticated;
grant select on public.account_moderation to authenticated;
create policy account_moderation_read on public.account_moderation for select to authenticated using(user_id=auth.uid() or public.worksync_is_admin());
create or replace function public.worksync_marketplace_active(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_user is not null and not exists(select 1 from public.account_moderation where user_id=p_user and status='suspended' and (expires_at is null or expires_at>now()));
$$;
create or replace function public.worksync_moderate_account(p_user uuid,p_status text,p_reason text,p_expires timestamptz default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.worksync_is_admin() then raise exception 'Administrator access required'; end if;
 if p_user=auth.uid() or exists(select 1 from public.admin_members where user_id=p_user) then raise exception 'Administrator accounts require a separate trusted access review'; end if;
 if p_status not in ('active','suspended') or p_status is null or coalesce(length(trim(p_reason)),0) not between 1 and 5000 or (p_expires is not null and p_expires<=now()) then raise exception 'Invalid moderation decision'; end if;
 insert into public.account_moderation(user_id,status,reason,admin_id,expires_at) values(p_user,p_status,p_reason,auth.uid(),case when p_status='suspended' then p_expires end)
 on conflict(user_id) do update set status=excluded.status,reason=excluded.reason,admin_id=excluded.admin_id,changed_at=now(),expires_at=excluded.expires_at;
 insert into public.admin_audit_log(admin_id,action,target_id,details) values(auth.uid(),'account:'||p_status,p_user,jsonb_build_object('reason',p_reason,'expires_at',p_expires));
 insert into public.notifications(user_id,type,title,message,related_id,is_read) values(p_user,'admin_update','Marketplace account status updated',p_reason,p_user,false);
end; $$;
create or replace function public.worksync_listing_visible(p_kind text,p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.listing_moderation where listing_type=p_kind and listing_id=p_id and hidden)
 and case when p_kind='service' then exists(select 1 from public.services s join public.freelancer_profiles f using(freelancer_id) where s.service_id=p_id and public.worksync_marketplace_active(f.user_id))
 when p_kind='job' then exists(select 1 from public.jobs j join public.client_profiles c using(client_id) where j.job_id=p_id and public.worksync_marketplace_active(c.user_id)) else false end;
$$;
create or replace function public.worksync_guard_marketplace_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Terminal status synchronization is handled by checked resolution functions.
 if tg_table_name='contracts' and tg_op='UPDATE' then
 if new.status::text in ('completed','cancelled') then return new; end if;
 end if;
 if not public.worksync_marketplace_active(auth.uid()) then raise exception 'Marketplace activity is suspended. Existing delivery, messaging and resolution remain available.'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
-- Triggers also protect SECURITY DEFINER RPC writes; RLS alone would not do so.
create trigger marketplace_account_guard before insert or update or delete on public.services for each row execute function public.worksync_guard_marketplace_account();
create trigger marketplace_account_guard before insert or update or delete on public.jobs for each row execute function public.worksync_guard_marketplace_account();
create trigger marketplace_account_guard before insert or update on public.job_applications for each row execute function public.worksync_guard_marketplace_account();
create trigger marketplace_account_guard before insert on public.service_orders for each row execute function public.worksync_guard_marketplace_account();
create trigger marketplace_account_guard before insert or update on public.contracts for each row execute function public.worksync_guard_marketplace_account();
create trigger marketplace_account_guard before insert or update on public.contract_item_approvals for each row execute function public.worksync_guard_marketplace_account();
revoke all on function public.worksync_marketplace_active(uuid),public.worksync_moderate_account(uuid,text,text,timestamptz),public.worksync_guard_marketplace_account() from public;
grant execute on function public.worksync_marketplace_active(uuid) to anon,authenticated;
grant execute on function public.worksync_moderate_account(uuid,text,text,timestamptz) to authenticated;
commit;
