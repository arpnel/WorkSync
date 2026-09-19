begin;
create or replace function public.worksync_add_milestone(p_order uuid,p_title text,p_description text,p_amount numeric,p_due timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare o public.service_orders; c public.contracts; s public.services; pid uuid; party boolean; total numeric; position integer;
begin
 select * into o from public.service_orders where order_id=p_order;
 select exists(select 1 from public.client_profiles where client_id=o.client_id and user_id=auth.uid()) or exists(select 1 from public.freelancer_profiles where freelancer_id=o.freelancer_id and user_id=auth.uid()) into party;
 if not party or auth.uid() is null or o.status::text<>'accepted' then raise exception 'Only participants may plan an accepted request'; end if;
 select * into c from public.contracts where order_id=p_order for update;
 select * into s from public.services where service_id=o.service_id;
 if s.service_type::text is distinct from 'milestone' then raise exception 'This is not a milestone agreement'; end if;
 if coalesce(length(trim(p_title)),0) not between 1 and 200 or length(p_description)>5000 or p_amount<=0 or p_amount is null or p_due is null or p_due<=now() then raise exception 'Enter a title, positive amount and future deadline'; end if;
 if exists(select 1 from public.projects where order_id=p_order and status::text in ('active','in_progress','completed','cancelled')) then raise exception 'Active milestone agreements cannot be changed'; end if;
 select project_id into pid from public.projects where order_id=p_order;
 if pid is null then
 insert into public.projects(order_id,client_id,freelancer_id,title,description,budget,status) values(o.order_id,o.client_id,o.freelancer_id,s.title,s.description,c.final_price,'pending') returning project_id into pid;
 end if;
 select coalesce(sum(amount),0),count(*) into total,position from public.milestones where project_id=pid;
 if total+p_amount>c.final_price or position>=100 then raise exception 'Milestone total exceeds the agreed budget or milestone limit'; end if;
 update public.contracts set client_signed_at=null,freelancer_signed_at=null where contract_id=c.contract_id;
 insert into public.milestones(project_id,title,description,amount,due_date,status,display_order) values(pid,p_title,p_description,p_amount,p_due,'pending',position);
end; $$;
revoke all on function public.worksync_add_milestone(uuid,text,text,numeric,timestamptz) from public;
grant execute on function public.worksync_add_milestone(uuid,text,text,numeric,timestamptz) to authenticated;
create or replace function public.worksync_remove_milestone(p_milestone uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.projects; c public.contracts;
begin
 select projects.* into p from public.projects join public.milestones using(project_id) where milestone_id=p_milestone;
 select * into c from public.contracts where order_id=p.order_id for update;
 select * into p from public.projects where project_id=p.project_id;
 if public.worksync_project_party(p.project_id) is null or (c.client_signed_at is not null and c.freelancer_signed_at is not null) or p.status::text in ('active','in_progress','completed','cancelled') or exists(select 1 from public.project_submissions where milestone_id=p_milestone) then raise exception 'Only draft milestones may be removed by participants'; end if;
 update public.contracts set client_signed_at=null,freelancer_signed_at=null where contract_id=c.contract_id;
 delete from public.contract_item_approvals where contract_id=c.contract_id and item_key='milestone:'||p_milestone::text;
 delete from public.milestones where milestone_id=p_milestone;
end; $$;
revoke all on function public.worksync_remove_milestone(uuid) from public;
grant execute on function public.worksync_remove_milestone(uuid) to authenticated;
commit;
