-- PREPARED, NOT APPLIED. Follow-up to milestone-draft-patch.sql.
-- Existing draft RPC/date-column prerequisite must already be installed.
begin;
create or replace function public.worksync_draft_milestones(
 p_order uuid, p_action text default 'list', p_milestone uuid default null,
 p_title text default null, p_description text default null,
 p_amount numeric default null, p_due date default null
) returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public','auth' as $$
declare c public.contracts; o public.service_orders; mid uuid; position integer;
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


create or replace function public.worksync_require_milestone_budget()
returns trigger language plpgsql security definer
set search_path to 'pg_catalog','public','auth' as $$
begin
 if new.item_key like 'milestone:%' and
   (new.client_approved_at is not null or new.freelancer_approved_at is not null) then
  perform 1 from public.contracts where contract_id=new.contract_id for update;
  if not exists(select 1 from public.contract_item_approvals
    where contract_id=new.contract_id and item_key='budget'
    and client_approved_at is not null and freelancer_approved_at is not null) then
   raise exception 'Both participants must agree on the budget before approving milestones' using errcode='22023';
  end if;
 end if;
 return new;
end; $$;
revoke all on function public.worksync_require_milestone_budget() from public,anon,authenticated;
drop trigger if exists worksync_require_milestone_budget on public.contract_item_approvals;
create trigger worksync_require_milestone_budget before insert or update of client_approved_at,freelancer_approved_at
on public.contract_item_approvals for each row execute function public.worksync_require_milestone_budget();
notify pgrst, 'reload schema';
commit;
