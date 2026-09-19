begin;
-- Reuse orders/contracts/workspaces for job agreements; do not create a second project system.
alter table public.service_orders alter column service_id drop not null;
alter table public.service_orders add column if not exists job_id uuid references public.jobs(job_id);
alter table public.service_orders add column if not exists application_id uuid references public.job_applications(application_id);
create unique index if not exists service_orders_application_unique on public.service_orders(application_id) where application_id is not null;
-- Existing supplied orders all have service_id; preserve them and constrain new job orders.
alter table public.service_orders add constraint worksync_order_source check ((service_id is not null and job_id is null and application_id is null) or (service_id is null and job_id is not null and application_id is not null)) not valid;
create or replace function public.worksync_job_agreement(p_application uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.job_applications; j public.jobs; client_user uuid; freelancer_user uuid; result uuid; conversation uuid;
begin
 select * into a from public.job_applications where application_id=p_application for update;
 select * into j from public.jobs where job_id=a.job_id;
 select user_id into client_user from public.client_profiles where client_id=j.client_id;
 select user_id into freelancer_user from public.freelancer_profiles where freelancer_id=a.freelancer_id;
 if auth.uid() is null or (auth.uid() is distinct from client_user and auth.uid() is distinct from freelancer_user) then raise exception 'Only application participants can open an agreement'; end if;
 select order_id into result from public.service_orders where application_id=p_application;
 if result is not null then return result; end if;
 if auth.uid()<>client_user then raise exception 'The client has not prepared an agreement yet'; end if;
 if not public.worksync_marketplace_active(client_user) or not public.worksync_marketplace_active(freelancer_user) then raise exception 'A participant is suspended from new agreements'; end if;
 if a.status::text<>'accepted' then raise exception 'Start a discussion before preparing an agreement'; end if;
 insert into public.service_orders(job_id,application_id,client_id,freelancer_id,status) values(j.job_id,p_application,j.client_id,a.freelancer_id,'accepted') returning order_id into result;
 insert into public.contracts(order_id,final_price,delivery_time_days,revisions_count,terms) values(result,coalesce(a.proposed_price,j.budget_max),coalesce(a.estimated_days,7),0,jsonb_build_object('projectTitle',j.title,'description',j.description,'categoryId',j.category_id)::text);
 select c.conversation_id into conversation from public.conversations c where c.job_id=j.job_id and exists(select 1 from public.conversation_participants cp where cp.conversation_id=c.conversation_id and cp.user_id=client_user) and exists(select 1 from public.conversation_participants cp where cp.conversation_id=c.conversation_id and cp.user_id=freelancer_user) limit 1;
 if conversation is not null then update public.conversations set order_id=result,job_id=null where conversation_id=conversation;
 else
 insert into public.conversations(order_id) values(result) returning conversation_id into conversation;
 insert into public.conversation_participants(conversation_id,user_id) values(conversation,client_user),(conversation,freelancer_user);
 end if;
 insert into public.notifications(user_id,type,title,message,related_id,is_read) values(freelancer_user,'project_update','Agreement ready','The client prepared a draft agreement for your discussion.',result,false);
 return result;
end; $$;
revoke all on function public.worksync_job_agreement(uuid) from public;
grant execute on function public.worksync_job_agreement(uuid) to authenticated;
commit;
