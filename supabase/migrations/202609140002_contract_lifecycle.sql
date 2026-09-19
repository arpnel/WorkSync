-- Requires core workflow preparation and the current projects/contracts tables.
begin;
create or replace function public.worksync_guard_contract() returns trigger
language plpgsql security definer set search_path='' as $$
declare client_user uuid; freelancer_user uuid; order_state text;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select c.user_id,f.user_id,o.status::text into client_user,freelancer_user,order_state
 from public.service_orders o join public.client_profiles c using(client_id) join public.freelancer_profiles f using(freelancer_id) where o.order_id=new.order_id;
 if new.status::text='cancelled' and order_state='cancelled' and (to_jsonb(new)-'status'-'updated_at')=(to_jsonb(old)-'status'-'updated_at') and (
 ((auth.uid()=client_user or auth.uid()=freelancer_user) and exists(select 1 from public.project_cancellations where order_id=new.order_id and status='accepted')) or
 (public.worksync_is_admin() and exists(select 1 from public.project_disputes d join public.projects p using(project_id) where p.order_id=new.order_id and d.status='resolved' and d.resolution_action='cancel_project'))) then return new; end if;
 if auth.uid() is distinct from client_user and auth.uid() is distinct from freelancer_user then raise exception 'Only contract participants may update an agreement'; end if;
 if new.order_id is distinct from old.order_id or new.contract_id is distinct from old.contract_id then raise exception 'Contract identity cannot change'; end if;
 if exists(select 1 from public.projects where order_id=new.order_id and status::text in ('active','in_progress','completed','cancelled')) then
 if auth.uid()=client_user and new.status::text='completed' and exists(select 1 from public.projects where order_id=new.order_id and status::text='completed') and (to_jsonb(new)-'status'-'updated_at')=(to_jsonb(old)-'status'-'updated_at') then return new; end if;
 raise exception 'This agreement is locked';
 end if;
 if new.status is distinct from old.status then raise exception 'Contract status is managed by the project workflow'; end if;
 if not public.worksync_marketplace_active(client_user) or not public.worksync_marketplace_active(freelancer_user) then raise exception 'A participant is suspended from new agreements'; end if;
 if public.worksync_order_on_hold(new.order_id) then raise exception 'Resolve the pending cancellation or dispute first'; end if;
 if order_state<>'accepted' then raise exception 'Accept the request before agreeing to a contract'; end if;
 if auth.uid()=client_user and new.freelancer_signed_at is distinct from old.freelancer_signed_at and new.freelancer_signed_at is not null then raise exception 'You cannot sign for the freelancer'; end if;
 if auth.uid()=freelancer_user and new.client_signed_at is distinct from old.client_signed_at and new.client_signed_at is not null then raise exception 'You cannot sign for the client'; end if;
 if (new.final_price,new.delivery_time_days,new.revisions_count,new.terms) is distinct from (old.final_price,old.delivery_time_days,old.revisions_count,old.terms) then
 new.client_signed_at:=null; new.freelancer_signed_at:=null;
 update public.contract_item_approvals set client_approved_at=null,freelancer_approved_at=null where contract_id=old.contract_id;
 end if;
 if new.client_signed_at is not null and new.freelancer_signed_at is not null and (new.final_price is null or new.final_price<=0 or new.delivery_time_days is null or new.delivery_time_days<1 or new.revisions_count is null or new.revisions_count<0) then raise exception 'Agree on a positive budget, delivery days and a revision limit'; end if;
 if new.client_signed_at is not null and new.freelancer_signed_at is not null and exists(select 1 from (values('budget'),('delivery'),('revisions')) as required(key) where not exists(select 1 from public.contract_item_approvals a where a.contract_id=new.contract_id and a.item_key=required.key and a.client_approved_at is not null and a.freelancer_approved_at is not null)) then raise exception 'Both participants must approve all terms before final confirmation'; end if;
 if new.client_signed_at is not null and new.freelancer_signed_at is not null and exists(select 1 from public.service_orders o join public.services s using(service_id) where o.order_id=new.order_id and s.service_type::text='milestone') then
 if coalesce((select sum(m.amount) from public.milestones m join public.projects p using(project_id) where p.order_id=new.order_id),0)<>new.final_price then raise exception 'Milestones must add up to the agreed budget'; end if;
 if exists(select 1 from public.milestones m join public.projects p using(project_id) where p.order_id=new.order_id and not exists(select 1 from public.contract_item_approvals a where a.contract_id=new.contract_id and a.item_key='milestone:'||m.milestone_id::text and a.client_approved_at is not null and a.freelancer_approved_at is not null)) then raise exception 'Both participants must approve every milestone before signing'; end if;
 end if;
 if new.client_signed_at is not null and new.freelancer_signed_at is not null then new.status:='active'; end if;
 return new;
end; $$;
drop trigger if exists worksync_guard_contract on public.contracts;
create trigger worksync_guard_contract before update on public.contracts for each row execute function public.worksync_guard_contract();

create or replace function public.worksync_activate_contract() returns trigger
language plpgsql security definer set search_path='' as $$
declare o public.service_orders; s public.services; project_title text; project_description text; terms_json jsonb; pid uuid; recipient uuid;
begin
 if new.client_signed_at is null or new.freelancer_signed_at is null then return new; end if;
 select * into o from public.service_orders where order_id=new.order_id for update;
 select * into s from public.services where service_id=o.service_id;
 begin terms_json:=new.terms::jsonb; exception when others then terms_json:='{}'::jsonb; end;
 project_title:=coalesce(terms_json->>'projectTitle',s.title,'Project');
 project_description:=coalesce(terms_json->>'projectDescription',terms_json->>'description',s.description,'');
 select project_id into pid from public.projects where order_id=o.order_id;
 if pid is null then
 insert into public.projects(order_id,client_id,freelancer_id,title,description,budget,status,start_date,due_date)
 values(o.order_id,o.client_id,o.freelancer_id,project_title,project_description,new.final_price,'active',now(),now()+make_interval(days=>new.delivery_time_days)) returning project_id into pid;
 else
 update public.projects set title=project_title,description=project_description,budget=new.final_price,status='active',start_date=now(),due_date=now()+make_interval(days=>new.delivery_time_days),updated_at=now() where project_id=pid;
 end if;
 update public.service_orders set status='active',updated_at=now() where order_id=o.order_id;
 for recipient in select user_id from public.client_profiles where client_id=o.client_id union select user_id from public.freelancer_profiles where freelancer_id=o.freelancer_id loop
 insert into public.notifications(user_id,type,title,message,related_id,is_read) values(recipient,'project_update','Project activated','Both participants confirmed the agreement.',o.order_id,false);
 end loop;
 return new;
end; $$;
drop trigger if exists worksync_activate_contract on public.contracts;
create trigger worksync_activate_contract after update on public.contracts for each row
when(new.client_signed_at is not null and new.freelancer_signed_at is not null and (old.client_signed_at is null or old.freelancer_signed_at is null)) execute function public.worksync_activate_contract();

-- Guard reviews even if a legacy direct INSERT policy is present.
create or replace function public.worksync_guard_review() returns trigger
language plpgsql security definer set search_path='' as $$
declare p public.projects; party text;
begin
 select * into p from public.projects where project_id=new.project_id for update;
 party:=public.worksync_project_party(new.project_id);
 if party is null or p.status::text<>'completed' or new.reviewer_role::text is distinct from party or new.client_id is distinct from p.client_id or new.freelancer_id is distinct from p.freelancer_id or new.rating is null or new.rating not between 1 and 5 then raise exception 'Invalid project review'; end if;
 if exists(select 1 from public.reviews where project_id=new.project_id and reviewer_role::text=party) then raise exception 'Project already reviewed'; end if;
 return new;
end; $$;
drop trigger if exists worksync_guard_review on public.reviews;
create trigger worksync_guard_review before insert on public.reviews for each row execute function public.worksync_guard_review();
-- Remove old direct UPDATE/DELETE review privileges when reconciling current policies.
revoke execute on function public.worksync_guard_contract(),public.worksync_activate_contract(),public.worksync_guard_review() from public;
commit;
