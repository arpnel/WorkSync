begin;
create or replace function public.worksync_request_service(p_service uuid,p_details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.services; client uuid; recipient uuid; result uuid; budget numeric; days integer; revisions integer;
begin
 select * into s from public.services where service_id=p_service for share;
 select client_id into client from public.client_profiles where user_id=auth.uid();
 select user_id into recipient from public.freelancer_profiles where freelancer_id=s.freelancer_id;
 if client is null or recipient is null or recipient=auth.uid() or s.status::text<>'Active' or s.is_archived or not public.worksync_listing_visible('service',p_service) then raise exception 'This service cannot be requested'; end if;
 budget:=(p_details->>'budget')::numeric; days:=(p_details->>'deliveryTimeDays')::integer; revisions:=(p_details->>'revisionsCount')::integer;
 if budget is null or budget<=0 or days is null or days<1 or revisions is null or revisions<0 or coalesce(length(trim(p_details->>'projectTitle')),0) not between 1 and 200 or coalesce(length(trim(p_details->>'description')),0) not between 1 and 10000 then raise exception 'Invalid request details'; end if;
 if not exists(select 1 from public.job_categories where id=(p_details->>'categoryId')::uuid) then raise exception 'Choose an existing category'; end if;
 insert into public.service_orders(service_id,client_id,freelancer_id,status) values(p_service,client,s.freelancer_id,'pending') returning order_id into result;
 insert into public.contracts(order_id,final_price,delivery_time_days,revisions_count,terms,status) values(result,budget,days,revisions,jsonb_build_object('projectTitle',p_details->>'projectTitle','description',p_details->>'description','categoryId',p_details->>'categoryId','categoryName',p_details->>'categoryName')::text,'draft');
 insert into public.notifications(user_id,type,title,message,related_id,is_read) values(recipient,'service_request','New service request','A client sent a request for your service.',result,false);
 return jsonb_build_object('order_id',result);
end; $$;
revoke all on function public.worksync_request_service(uuid,jsonb) from public;
grant execute on function public.worksync_request_service(uuid,jsonb) to authenticated;
commit;
