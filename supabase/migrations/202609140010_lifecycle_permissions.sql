begin;
-- All project/milestone lifecycle writes go through the checked routines.
revoke insert,update,delete on public.projects,public.milestones from anon,authenticated;
create or replace function public.worksync_guard_contract_insert() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.service_orders o join public.client_profiles c using(client_id) join public.freelancer_profiles f using(freelancer_id) where o.order_id=new.order_id and (c.user_id=auth.uid() or f.user_id=auth.uid())) then raise exception 'Only request participants may prepare a contract'; end if;
 if new.status::text<>'draft' then raise exception 'New contracts must begin as drafts'; end if;
 if new.client_signed_at is not null or new.freelancer_signed_at is not null then raise exception 'A new agreement must be reviewed before it is signed'; end if;
 return new;
end; $$;
create trigger worksync_guard_contract_insert before insert on public.contracts for each row execute function public.worksync_guard_contract_insert();
create or replace function public.worksync_guard_verification_status() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
 if new.verification_status is distinct from old.verification_status and not public.worksync_is_admin() then raise exception 'Only an administrator may change verification status'; end if;
 elsif new.verification_status::text in ('verified','approved') and not public.worksync_is_admin() then raise exception 'Verification requires administrator review'; end if;
 return new;
end; $$;
create trigger worksync_guard_verification_status before insert or update on public.freelancer_profiles for each row execute function public.worksync_guard_verification_status();
revoke all on function public.worksync_guard_contract_insert(),public.worksync_guard_verification_status() from public;
commit;
