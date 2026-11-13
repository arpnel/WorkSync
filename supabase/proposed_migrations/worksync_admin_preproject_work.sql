-- PREPARED, NOT APPLIED.
-- List accepted discussions and pending contracts before a project is activated,
-- and let administrators cancel those records with an audited reason.
begin;

-- The shared cancellation helper must not assign `cancelled` to milestones:
-- that value is not present in public.milestone_status. Closing the order,
-- project, and contract is sufficient; preserve each milestone's recorded
-- delivery state for audit purposes.
create or replace function public.worksync_cancel_order_internal(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.service_orders where order_id=p_order and status::text='completed')
     or exists(select 1 from public.projects where order_id=p_order and status::text='completed') then
    raise exception 'Completed work cannot be cancelled';
  end if;
  update public.service_orders set status='cancelled',updated_at=now() where order_id=p_order;
  update public.projects set status='cancelled',updated_at=now() where order_id=p_order;
  insert into public.worksync_workflow_write_context
    values(pg_backend_pid(),txid_current(),p_order,'contract_cancel');
  update public.contracts set status='cancelled',updated_at=now() where order_id=p_order;
  delete from public.worksync_workflow_write_context
    where backend_pid=pg_backend_pid() and transaction_id=txid_current()
      and object_id=p_order and purpose='contract_cancel';
end;
$$;

create or replace function public.worksync_admin_project_pipeline()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.worksync_is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  with pipeline as (
    select
      a.application_id as record_id,
      'application'::text as record_type,
      j.title,
      case when c.contract_id is null then 'In discussion' else 'Agreement pending' end as phase,
      a.status::text as status,
      c.status::text as contract_status,
      coalesce(cp.display_name, 'Name unavailable') as client_name,
      coalesce(fp.display_name, 'Name unavailable') as freelancer_name,
      coalesce(c.final_price, a.proposed_price) as budget,
      coalesce(
        nullif(public.worksync_safe_contract_json(c.terms)->>'description', ''),
        nullif(j.description, '')
      ) as work_description,
      a.proposal,
      a.proposed_plan,
      c.terms as contract_terms,
      coalesce(c.delivery_time_days, a.estimated_days) as delivery_days,
      c.revisions_count as revisions,
      c.created_at as contract_created_at,
      c.updated_at as contract_updated_at,
      c.client_signed_at,
      c.freelancer_signed_at,
      c.current_version,
      c.client_signed_version,
      c.freelancer_signed_version,
      coalesce(cm.items, '[]'::jsonb) as milestones,
      a.created_at
    from public.job_applications a
    join public.jobs j on j.job_id = a.job_id
    join public.client_profiles client on client.client_id = j.client_id
    join public.freelancer_profiles freelancer on freelancer.freelancer_id = a.freelancer_id
    left join public.profiles cp on cp.user_id = client.user_id
    left join public.profiles fp on fp.user_id = freelancer.user_id
    left join lateral (
      select so.order_id, so.status
      from public.service_orders so
      where so.application_id = a.application_id
      order by so.created_at desc
      limit 1
    ) so on true
    left join lateral (
      select con.contract_id, con.status, con.final_price, con.terms,
        con.delivery_time_days, con.revisions_count, con.created_at,
        con.updated_at, con.client_signed_at, con.freelancer_signed_at,
        con.current_version, con.client_signed_version, con.freelancer_signed_version
      from public.contracts con
      where con.application_id = a.application_id
         or (so.order_id is not null and con.order_id = so.order_id)
      order by con.created_at desc
      limit 1
    ) c on true
    left join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', milestone.contract_milestone_id,
        'title', milestone.title,
        'description', milestone.description,
        'amount', milestone.amount,
        'due_date', milestone.due_date
      ) order by milestone.display_order, milestone.contract_milestone_id), '[]'::jsonb) as items
      from public.contract_milestones milestone
      where milestone.contract_id = c.contract_id
    ) cm on true
    where a.status::text = 'accepted'
      and (so.order_id is null or so.status::text = 'accepted')
      and not exists (
        select 1 from public.projects p
        where p.application_id = a.application_id
           or (so.order_id is not null and p.order_id = so.order_id)
      )
      and (c.contract_id is null or c.status::text not in ('cancelled', 'rejected', 'completed', 'active'))

    union all

    select
      so.order_id as record_id,
      'service_order'::text as record_type,
      coalesce(s.title, j.title, 'Untitled work') as title,
      case when c.contract_id is null then 'In discussion' else 'Agreement pending' end as phase,
      so.status::text as status,
      c.status::text as contract_status,
      coalesce(cp.display_name, 'Name unavailable') as client_name,
      coalesce(fp.display_name, 'Name unavailable') as freelancer_name,
      coalesce(c.final_price, s.price) as budget,
      coalesce(
        nullif(public.worksync_safe_contract_json(c.terms)->>'description', ''),
        nullif(s.description, ''),
        nullif(j.description, '')
      ) as work_description,
      null::text as proposal,
      null::jsonb as proposed_plan,
      c.terms as contract_terms,
      c.delivery_time_days as delivery_days,
      c.revisions_count as revisions,
      c.created_at as contract_created_at,
      c.updated_at as contract_updated_at,
      c.client_signed_at,
      c.freelancer_signed_at,
      c.current_version,
      c.client_signed_version,
      c.freelancer_signed_version,
      coalesce(cm.items, '[]'::jsonb) as milestones,
      so.created_at
    from public.service_orders so
    left join public.services s on s.service_id = so.service_id
    left join public.jobs j on j.job_id = so.job_id
    join public.client_profiles client on client.client_id = so.client_id
    join public.freelancer_profiles freelancer on freelancer.freelancer_id = so.freelancer_id
    left join public.profiles cp on cp.user_id = client.user_id
    left join public.profiles fp on fp.user_id = freelancer.user_id
    left join lateral (
      select con.contract_id, con.status, con.final_price, con.terms,
        con.delivery_time_days, con.revisions_count, con.created_at,
        con.updated_at, con.client_signed_at, con.freelancer_signed_at,
        con.current_version, con.client_signed_version, con.freelancer_signed_version
      from public.contracts con
      where con.order_id = so.order_id
      order by con.created_at desc
      limit 1
    ) c on true
    left join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', milestone.contract_milestone_id,
        'title', milestone.title,
        'description', milestone.description,
        'amount', milestone.amount,
        'due_date', milestone.due_date
      ) order by milestone.display_order, milestone.contract_milestone_id), '[]'::jsonb) as items
      from public.contract_milestones milestone
      where milestone.contract_id = c.contract_id
    ) cm on true
    where so.application_id is null
      and so.status::text = 'accepted'
      and not exists (select 1 from public.projects p where p.order_id = so.order_id)
      and (c.contract_id is null or c.status::text not in ('cancelled', 'rejected', 'completed', 'active'))
  )
  select coalesce(jsonb_agg(to_jsonb(pipeline) order by created_at desc nulls last, record_id), '[]'::jsonb)
  into result
  from pipeline;

  return result;
end;
$$;

create or replace function public.worksync_admin_cancel_preproject_work(
  p_record_type text,
  p_record uuid,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_order public.service_orders;
  v_application public.job_applications;
  v_contract public.contracts;
  v_previous_status text;
begin
  if v_admin is null or not public.worksync_is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_record is null or p_record_type is null or p_record_type not in ('application', 'service_order') then
    raise exception 'A valid discussion record is required' using errcode = '22023';
  end if;
  if p_notes is null or length(btrim(p_notes)) not between 1 and 500 then
    raise exception 'Enter a cancellation reason of up to 500 characters' using errcode = '22023';
  end if;

  if p_record_type = 'application' then
    select * into v_application
    from public.job_applications
    where application_id = p_record
    for update;
    if not found or v_application.status::text <> 'accepted' then
      raise exception 'Accepted discussion not found or no longer cancellable' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.projects p where p.application_id = p_record) then
      raise exception 'This discussion is already a project; cancel it from the project record' using errcode = '22023';
    end if;

    select * into v_order
    from public.service_orders
    where application_id = p_record
    order by created_at desc
    limit 1
    for update;
    if v_order.order_id is not null then
      if v_order.status::text <> 'accepted' then
        raise exception 'The linked order is no longer in discussion' using errcode = '22023';
      end if;
      if exists (select 1 from public.contracts con where con.order_id = v_order.order_id and con.status::text = 'active') then
        raise exception 'An active contract must be handled from its project record' using errcode = '22023';
      end if;
      if exists (select 1 from public.projects p where p.order_id = v_order.order_id) then
        raise exception 'This discussion is already a project; cancel it from the project record' using errcode = '22023';
      end if;
      perform public.worksync_cancel_order_internal(v_order.order_id);
    else
      select * into v_contract
      from public.contracts
      where application_id = p_record
      order by created_at desc
      limit 1
      for update;
      if v_contract.contract_id is not null then
        if v_contract.status::text in ('cancelled', 'rejected', 'completed', 'active') then
          raise exception 'The linked contract is no longer cancellable' using errcode = '22023';
        end if;
        insert into public.worksync_workflow_write_context
          values(pg_backend_pid(), txid_current(), v_contract.contract_id, 'contract_cancel');
        update public.contracts
        set status = 'cancelled'::public.contract_status, updated_at = pg_catalog.now()
        where contract_id = v_contract.contract_id;
        delete from public.worksync_workflow_write_context
        where backend_pid = pg_backend_pid() and transaction_id = txid_current()
          and object_id = v_contract.contract_id and purpose = 'contract_cancel';
      end if;
    end if;

    update public.job_applications
    set status = 'rejected'
    where application_id = p_record and status::text = 'accepted';
    v_previous_status := v_application.status::text;
  else
    select * into v_order
    from public.service_orders
    where order_id = p_record
    for update;
    if not found or v_order.status::text <> 'accepted' then
      raise exception 'Accepted service order not found or no longer cancellable' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.contracts con where con.order_id = p_record and con.status::text = 'active') then
      raise exception 'An active contract must be handled from its project record' using errcode = '22023';
    end if;
    if exists (select 1 from public.projects p where p.order_id = p_record) then
      raise exception 'This order is already a project; cancel it from the project record' using errcode = '22023';
    end if;
    perform public.worksync_cancel_order_internal(p_record);
    if v_order.application_id is not null then
      update public.job_applications
      set status = 'rejected'
      where application_id = v_order.application_id and status::text = 'accepted';
    end if;
    v_previous_status := v_order.status::text;
  end if;

  insert into public.admin_audit_log(admin_id, action, target_id, details)
  values (
    v_admin,
    'cancel_preproject_work',
    p_record,
    pg_catalog.jsonb_build_object(
      'record_type', p_record_type,
      'previous_status', v_previous_status,
      'status', 'cancelled',
      'notes', btrim(p_notes)
    )
  );

  return pg_catalog.jsonb_build_object(
    'record_id', p_record,
    'record_type', p_record_type,
    'status', 'cancelled',
    'previous_status', v_previous_status
  );
end;
$$;

-- Allow only the admin RPC above to close an application-linked draft that has
-- not created a service order yet. Existing order cancellation remains guarded
-- by the established cancellation workflow and its order marker.
create or replace function public.worksync_contract_status_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare project_done boolean; ord uuid; marker_purpose text; expected_order_status text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if old.status::text in ('rejected','cancelled','completed') then raise exception 'Contract status is final' using errcode='22023'; end if;
  if new.status::text='active' then
    if not exists(select 1 from public.worksync_workflow_write_context x where x.backend_pid=pg_backend_pid()
      and x.transaction_id=txid_current() and x.object_id=old.contract_id and x.purpose='activation') then
      raise exception 'Use the contract activation RPC to activate an agreement' using errcode='42501'; end if;
    perform public.worksync_guard_contract(old.contract_id);
    if (select count(*) from public.projects p where
      ((old.order_id is not null and p.order_id=old.order_id) or
       (old.application_id is not null and p.application_id=old.application_id)) and p.status::text='active')<>1 then
      raise exception 'Activate through worksync_activate_contract so exactly one active project exists' using errcode='42501'; end if;
    return new;
  elsif new.status::text in ('pending_client','rejected') then
    marker_purpose:='service_response';
    expected_order_status:=case when new.status::text='pending_client' then 'accepted' else 'rejected' end;
    if old.order_id is null or not exists(select 1 from public.worksync_workflow_write_context x
      where x.backend_pid=pg_backend_pid() and x.transaction_id=txid_current()
        and x.object_id=old.order_id and x.purpose=marker_purpose)
       or not exists(select 1 from public.service_orders so
         where so.order_id=old.order_id and so.status::text=expected_order_status) then
      raise exception 'Use the authorized service-response workflow to change this contract status' using errcode='42501'; end if;
    return new;
  elsif new.status::text='cancelled' then
    if old.order_id is null then
      if not public.worksync_is_admin() or not exists(
        select 1 from public.worksync_workflow_write_context x
        where x.backend_pid=pg_backend_pid() and x.transaction_id=txid_current()
          and x.object_id=old.contract_id and x.purpose='contract_cancel'
      ) then
        raise exception 'Use the authorized admin cancellation workflow to cancel this contract' using errcode='42501';
      end if;
    elsif not exists(select 1 from public.worksync_workflow_write_context x
      where x.backend_pid=pg_backend_pid() and x.transaction_id=txid_current()
        and x.object_id=old.order_id and x.purpose='contract_cancel')
       or not exists(select 1 from public.service_orders so
         where so.order_id=old.order_id and so.status::text='cancelled') then
      raise exception 'Use the authorized cancellation workflow to cancel this contract' using errcode='42501'; end if;
    return new;
  elsif old.status::text='active' and new.status::text='completed' then
    select p.order_id into ord from public.projects p where
      (old.order_id is not null and p.order_id=old.order_id) or
      (old.application_id is not null and p.application_id=old.application_id) order by p.created_at limit 1;
    select exists(select 1 from public.projects p where
      ((old.order_id is not null and p.order_id=old.order_id) or
       (old.application_id is not null and p.application_id=old.application_id)) and p.status::text='completed') into project_done;
    if not project_done or public.worksync_order_on_hold(ord) then raise exception 'Project completion or payout hold prevents contract completion' using errcode='42501'; end if;
    if auth.role()<>'service_role' and public.worksync_contract_party(old.contract_id)<>'client' then raise exception 'Only the client may complete this contract' using errcode='42501'; end if;
    return new;
  end if;
  if old.status::text='active' then raise exception 'An active contract cannot return to negotiation' using errcode='22023'; end if;
  raise exception 'Contract status changes must use their authorized workflow' using errcode='42501';
end;
$$;

revoke all on function public.worksync_admin_project_pipeline() from public, anon;
grant execute on function public.worksync_admin_project_pipeline() to authenticated;
revoke all on function public.worksync_admin_cancel_preproject_work(text, uuid, text) from public, anon;
grant execute on function public.worksync_admin_cancel_preproject_work(text, uuid, text) to authenticated;
revoke all on function public.worksync_contract_status_guard() from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
