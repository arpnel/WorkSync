begin;
-- Narrow grants explicitly: Supabase default privileges may otherwise grant DML.
revoke all on public.project_submissions,public.revision_requests,public.listing_reports,public.admin_audit_log,public.listing_moderation from anon,authenticated;
grant select on public.project_submissions,public.revision_requests,public.listing_reports,public.admin_audit_log to authenticated;
revoke all on public.saved_jobs from anon,authenticated;
grant select,insert,delete on public.saved_jobs to authenticated;
revoke all on public.verification_requests from anon,authenticated;
grant select,insert on public.verification_requests to authenticated;
-- Existing service favorites retain their table; enforce own-row access alongside current policies.
-- saved_services already has UNIQUE(user_id,service_id).
alter table public.saved_services enable row level security;
create policy saved_services_owner_guard on public.saved_services as restrictive for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy saved_services_owner_access on public.saved_services for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
revoke all on public.saved_services from anon,authenticated;
grant select,insert,delete on public.saved_services to authenticated;

create or replace function public.worksync_respond_service(p_order uuid,p_accept boolean) returns void
language plpgsql security definer set search_path='' as $$
declare o public.service_orders; recipient uuid; freelancer_user uuid; conversation uuid;
begin
 select * into o from public.service_orders where order_id=p_order for update;
 select user_id into freelancer_user from public.freelancer_profiles where freelancer_id=o.freelancer_id;
 if auth.uid() is null or freelancer_user is distinct from auth.uid() or o.status::text<>'pending' then raise exception 'Only the requested freelancer can respond to a pending request'; end if;
 select user_id into recipient from public.client_profiles where client_id=o.client_id;
 if p_accept and (not public.worksync_marketplace_active(auth.uid()) or not public.worksync_marketplace_active(recipient)) then raise exception 'Marketplace account is suspended'; end if;
 if p_accept then
 update public.service_orders set status='accepted',updated_at=now() where order_id=p_order;
 select conversation_id into conversation from public.conversations where order_id=p_order limit 1;
 if conversation is null then insert into public.conversations(order_id) values(p_order) returning conversation_id into conversation; end if;
 insert into public.conversation_participants(conversation_id,user_id) select conversation,id from (values(recipient),(freelancer_user)) as users(id) where not exists(select 1 from public.conversation_participants cp where cp.conversation_id=conversation and cp.user_id=users.id);
 else update public.service_orders set status='rejected',updated_at=now() where order_id=p_order; end if;
 insert into public.notifications(user_id,type,title,message,related_id,is_read) values(recipient,'service_request',case when p_accept then 'Service request accepted' else 'Service request declined' end,'Open Projects for details.',p_order,false);
end; $$;

create or replace function public.worksync_respond_application(p_application uuid,p_accept boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.job_applications; owner uuid; freelancer_user uuid; conversation uuid;
begin
 select * into a from public.job_applications where application_id=p_application for update;
 select c.user_id into owner from public.jobs j join public.client_profiles c using(client_id) where j.job_id=a.job_id;
 if auth.uid() is null or owner is distinct from auth.uid() or a.status::text not in ('pending','in_review') then raise exception 'Only the job owner can respond to a pending application'; end if;
 select user_id into freelancer_user from public.freelancer_profiles where freelancer_id=a.freelancer_id;
 if p_accept and (not public.worksync_marketplace_active(owner) or not public.worksync_marketplace_active(freelancer_user)) then raise exception 'Marketplace account is suspended'; end if;
 if p_accept then
 select c.conversation_id into conversation from public.conversations c where c.job_id=a.job_id and exists(select 1 from public.conversation_participants cp where cp.conversation_id=c.conversation_id and cp.user_id=owner) and exists(select 1 from public.conversation_participants cp where cp.conversation_id=c.conversation_id and cp.user_id=freelancer_user) limit 1;
 if conversation is null then
 insert into public.conversations(job_id) values(a.job_id) returning conversation_id into conversation;
 insert into public.conversation_participants(conversation_id,user_id) values(conversation,owner),(conversation,freelancer_user);
 end if;
 update public.job_applications set status='accepted',updated_at=now() where application_id=p_application;
 else update public.job_applications set status='rejected',updated_at=now() where application_id=p_application; end if;
 insert into public.notifications(user_id,type,title,message,related_id,is_read) values(freelancer_user,'job_application',case when p_accept then 'Application selected for discussion' else 'Application declined' end,'Open Projects for details.',a.job_id,false);
 return conversation;
end; $$;
revoke insert,update,delete on public.job_applications from anon,authenticated;
revoke update,delete on public.service_orders from anon,authenticated;
-- Direct order inserts must begin as a request and belong to the caller.
create or replace function public.worksync_guard_order_request() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Job agreements are created by the checked worksync_job_agreement function.
 if new.service_id is null then return new; end if;
 if not exists(select 1 from public.client_profiles where client_id=new.client_id and user_id=auth.uid()) or new.status::text<>'pending' or not exists(select 1 from public.services where service_id=new.service_id and freelancer_id=new.freelancer_id) or not public.worksync_listing_visible('service',new.service_id) then raise exception 'Invalid service request'; end if;
 if exists(select 1 from public.freelancer_profiles where freelancer_id=new.freelancer_id and user_id=auth.uid()) then raise exception 'You cannot request your own service'; end if;
 return new;
end; $$;
create trigger worksync_guard_order_request before insert on public.service_orders for each row execute function public.worksync_guard_order_request();
create policy service_order_insert_owner on public.service_orders as restrictive for insert to authenticated with check(service_id is not null and job_id is null and application_id is null and status::text='pending' and exists(select 1 from public.client_profiles c where c.client_id=service_orders.client_id and c.user_id=auth.uid()));

create or replace function public.worksync_guard_approval() returns trigger
language plpgsql security definer set search_path='' as $$
declare order_ref uuid; client_user uuid; freelancer_user uuid;
locked_contract uuid;
begin
 select contract_id into locked_contract from public.contracts where contract_id=new.contract_id for update;
 select o.order_id,c.user_id,f.user_id into order_ref,client_user,freelancer_user from public.contracts a join public.service_orders o using(order_id) join public.client_profiles c using(client_id) join public.freelancer_profiles f using(freelancer_id) where a.contract_id=new.contract_id;
 if auth.uid() is null or (auth.uid() is distinct from client_user and auth.uid() is distinct from freelancer_user) then raise exception 'Participant access required'; end if;
 if exists(select 1 from public.service_orders where order_id=order_ref and status::text<>'accepted') then raise exception 'Agreement is not open for approval'; end if;
 if public.worksync_order_on_hold(order_ref) then raise exception 'Resolve the pending request first'; end if;
 if exists(select 1 from public.projects where order_id=order_ref and status::text in ('active','in_progress','completed','cancelled')) then raise exception 'Agreement is locked'; end if;
 if tg_op='INSERT' then
 if (auth.uid()=client_user and new.freelancer_approved_at is not null) or (auth.uid()=freelancer_user and new.client_approved_at is not null) then raise exception 'You cannot approve for another participant'; end if;
 else
 if new.contract_id<>old.contract_id or new.item_key<>old.item_key then raise exception 'Approval identity cannot change'; end if;
 if (auth.uid()=client_user and new.freelancer_approved_at is distinct from old.freelancer_approved_at and new.freelancer_approved_at is not null) or (auth.uid()=freelancer_user and new.client_approved_at is distinct from old.client_approved_at and new.client_approved_at is not null) then raise exception 'You cannot approve for another participant'; end if;
 end if;
 return new;
end; $$;
create trigger worksync_guard_approval before insert or update on public.contract_item_approvals for each row execute function public.worksync_guard_approval();
revoke all on function public.worksync_respond_service(uuid,boolean),public.worksync_respond_application(uuid,boolean),public.worksync_guard_order_request(),public.worksync_guard_approval() from public;
grant execute on function public.worksync_respond_service(uuid,boolean),public.worksync_respond_application(uuid,boolean) to authenticated;
commit;
