-- PREPARED, NOT APPLIED. Review and execute explicitly before deploying the app changes.
-- Uses contract milestones for discussion; keeps the existing active milestone RPCs intact.
begin;
alter table public.contract_milestones add column if not exists due_date date;

create or replace function public.worksync_draft_milestones(
 p_order uuid, p_action text default 'list', p_milestone uuid default null,
 p_title text default null, p_description text default null,
 p_amount numeric default null, p_due date default null
) returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public','auth' as $$
declare c public.contracts; o public.service_orders; mid uuid; position integer; previous_due date;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 -- Same advisory lock as activation, then contract row lock.
 select * into c from public.contracts where order_id=p_order;
 if c.contract_id is null then raise exception 'Contract not found for order' using errcode='P0002'; end if;
 if public.worksync_contract_party(c.contract_id) is null then raise exception 'Only contract participants may manage milestones' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(c.contract_id::text,0));
 select * into c from public.contracts where contract_id=c.contract_id for update;
 if p_action='list' then
  return coalesce((select jsonb_agg(to_jsonb(m) order by m.display_order,m.contract_milestone_id) from public.contract_milestones m where m.contract_id=c.contract_id),'[]'::jsonb);
 end if;
 if p_action not in ('add','remove') or p_action is null then raise exception 'Invalid draft action' using errcode='22023'; end if;
 select * into o from public.service_orders where order_id=p_order for update;
 if c.status::text not in ('pending','draft','pending_client','pending_freelancer')
    or o.order_id is null or o.status::text not in ('pending','accepted')
    or exists(select 1 from public.projects where order_id=p_order and status::text <> 'pending') then
  raise exception 'Only agreements in discussion may change draft milestones (contract: %, order: %)', c.status, o.status using errcode='22023';
 end if;
 if c.client_signed_at is not null or c.freelancer_signed_at is not null then
  raise exception 'Both participants must withdraw their final confirmations before changing milestones' using errcode='22023';
 end if;
 if not exists(select 1 from public.services where service_id=o.service_id and service_type::text='milestone') then
  raise exception 'This is not a milestone service agreement' using errcode='22023';
 end if;
 if not exists(select 1 from public.contract_item_approvals where contract_id=c.contract_id
   and item_key='budget' and client_approved_at is not null and freelancer_approved_at is not null) then
  raise exception 'Both participants must agree on the budget before planning milestones' using errcode='22023';
 end if;
 if p_action='add' then
  if p_title is null or length(btrim(p_title)) not between 1 and 200
     or coalesce(length(p_description),0)>5000 or p_amount is null or p_amount<=0
     or p_amount::text in ('NaN','Infinity','-Infinity') or p_due is null or p_due<current_date then
   raise exception 'Enter a title, positive amount and current or future deadline' using errcode='22023';
  end if;
  select m.due_date into previous_due from public.contract_milestones m
   where m.contract_id=c.contract_id
   order by m.display_order desc,m.contract_milestone_id desc limit 1;
  if previous_due is not null and p_due<=previous_due then
   raise exception 'Each milestone deadline must be later than the previous milestone' using errcode='22023';
  end if;
  if (select count(*) from public.contract_milestones where contract_id=c.contract_id)>=100
    or c.final_price is null or (select coalesce(sum(amount),0) from public.contract_milestones where contract_id=c.contract_id)+p_amount>c.final_price then
   raise exception 'Milestone total exceeds the contract budget or milestone limit' using errcode='22023';
  end if;
  select coalesce(max(display_order),0)+1 into position from public.contract_milestones where contract_id=c.contract_id;
  insert into public.contract_milestones(contract_id,title,description,amount,due_date,display_order)
   values(c.contract_id,btrim(p_title),p_description,p_amount,p_due,position) returning contract_milestone_id into mid;
 else
  delete from public.contract_milestones where contract_id=c.contract_id and contract_milestone_id=p_milestone returning contract_milestone_id into mid;
  if mid is null then raise exception 'Draft milestone not found in this contract' using errcode='P0002'; end if;
  delete from public.contract_item_approvals where contract_id=c.contract_id and item_key='milestone:'||mid::text;
 end if;
 return jsonb_build_object('id',mid);
end; $$;
revoke all on function public.worksync_draft_milestones(uuid,text,uuid,text,text,numeric,date) from public,anon;
grant execute on function public.worksync_draft_milestones(uuid,text,uuid,text,text,numeric,date) to authenticated;

-- Supplied deployed activation body, with only due_date added to its milestone copy.
CREATE OR REPLACE FUNCTION public.worksync_activate_contract(p_contract_id uuid)
 RETURNS projects
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE c public.contracts; so public.service_orders; a public.job_applications; j public.jobs; s public.services; cid uuid; fid uuid; oid uuid; pid uuid; st date:=current_date; dl date; p public.projects;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_contract_id::text,0));
 SELECT * INTO c FROM public.contracts WHERE contract_id=p_contract_id FOR UPDATE;
 IF c.contract_id IS NULL THEN RAISE EXCEPTION 'Contract not found' USING errcode='P0002'; END IF;
 IF c.order_id IS NOT NULL THEN
  SELECT * INTO so FROM public.service_orders WHERE order_id=c.order_id FOR UPDATE; cid:=so.client_id; fid:=so.freelancer_id; oid:=so.order_id; SELECT * INTO s FROM public.services WHERE service_id=so.service_id;
 ELSE
  SELECT * INTO a FROM public.job_applications WHERE application_id=c.application_id FOR UPDATE; SELECT * INTO j FROM public.jobs WHERE job_id=a.job_id; cid:=j.client_id; fid:=a.freelancer_id; SELECT * INTO so FROM public.service_orders WHERE application_id=c.application_id FOR UPDATE;
  IF so.order_id IS NULL THEN INSERT INTO public.service_orders(job_id,application_id,client_id,freelancer_id,status) VALUES(a.job_id,a.application_id,cid,fid,'pending') RETURNING * INTO so; END IF; oid:=so.order_id;
 END IF;
 PERFORM public.worksync_guard_contract(p_contract_id); dl:=st+c.delivery_time_days;
 SELECT * INTO p FROM public.projects x WHERE (c.order_id IS NOT NULL AND x.order_id=oid) OR (c.application_id IS NOT NULL AND x.application_id=c.application_id) ORDER BY x.created_at LIMIT 1 FOR UPDATE;
 IF p.project_id IS NULL THEN INSERT INTO public.projects(freelancer_id,client_id,title,description,budget,status,start_date,due_date,order_id,application_id) VALUES(fid,cid,COALESCE(j.title,s.title,'WorkSync project'),COALESCE(j.description,s.description,c.terms),c.final_price,'active',st,dl,CASE WHEN c.order_id IS NOT NULL THEN oid END,CASE WHEN c.application_id IS NOT NULL THEN c.application_id END) RETURNING * INTO p;
 ELSE UPDATE public.projects x SET freelancer_id=fid,client_id=cid,budget=c.final_price,status='active',start_date=st,due_date=dl,updated_at=now() WHERE x.project_id=p.project_id RETURNING * INTO p; END IF;
 INSERT INTO public.milestones(project_id,title,description,amount,due_date,display_order,status) SELECT p.project_id,m.title,m.description,m.amount,m.due_date,m.display_order,'pending'::public.milestone_status FROM public.contract_milestones m WHERE m.contract_id=p_contract_id AND NOT EXISTS(SELECT 1 FROM public.milestones x WHERE x.project_id=p.project_id AND x.title=m.title AND x.display_order=m.display_order);
 UPDATE public.contracts SET status='active'::public.contract_status,updated_at=now() WHERE contract_id=p_contract_id;
 UPDATE public.service_orders SET status='converted',updated_at=now() WHERE order_id=oid;
 RETURN p;
END;$function$;

notify pgrst, 'reload schema';
commit;
