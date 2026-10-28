-- Rename the PL/pgSQL variable that collides with conversations.conversation_id.
-- Preserve the deployed function's signature, authorization, side effects, and return value.
create or replace function public.worksync_job_agreement(p_application uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $$
declare
  requesting_user_id uuid := auth.uid();
  application_row public.job_applications;
  job_row public.jobs;
  client_profile_id uuid;
  client_user_id uuid;
  freelancer_user_id uuid;
  service_order_id uuid;
  agreement_contract_id uuid;
  v_conversation_id uuid;
begin
  if requesting_user_id is null then
    raise exception 'Sign in required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_application::text, 0));

  select * into application_row
  from public.job_applications
  where application_id = p_application
  for update;
  if application_row.application_id is null then
    raise exception 'Application unavailable';
  end if;
  if application_row.status::text <> 'accepted' then
    raise exception 'Only accepted applications can create an agreement';
  end if;

  select * into job_row
  from public.jobs
  where job_id = application_row.job_id;
  if job_row.job_id is null then
    raise exception 'Job unavailable';
  end if;

  client_profile_id := job_row.client_id;
  select user_id into client_user_id
  from public.client_profiles
  where client_id = client_profile_id;
  select user_id into freelancer_user_id
  from public.freelancer_profiles
  where freelancer_id = application_row.freelancer_id;
  if freelancer_user_id is null then
    raise exception 'Freelancer unavailable';
  end if;
  if requesting_user_id not in (client_user_id, freelancer_user_id) then
    raise exception 'Only agreement participants can create an agreement';
  end if;

  select existing_order.order_id into service_order_id
  from public.service_orders as existing_order
  where existing_order.application_id = p_application
  for update;

  if service_order_id is null then
    insert into public.service_orders(
      freelancer_id, status, client_id, job_id, application_id
    ) values (
      application_row.freelancer_id,
      'pending',
      client_profile_id,
      application_row.job_id,
      p_application
    ) returning order_id into service_order_id;
  end if;

  select existing_contract.contract_id into agreement_contract_id
  from public.contracts as existing_contract
  where existing_contract.order_id = service_order_id
    or existing_contract.application_id = p_application
  order by (existing_contract.order_id = service_order_id) desc,
    existing_contract.created_at
  limit 1
  for update;

  if agreement_contract_id is null then
    insert into public.contracts(
      order_id, final_price, delivery_time_days, revisions_count, terms, status
    ) values (
      service_order_id,
      coalesce(application_row.proposed_price, 0),
      greatest(coalesce(application_row.estimated_days, 1), 1),
      0,
      application_row.proposal,
      'draft'::public.contract_status
    ) returning contract_id into agreement_contract_id;
  end if;

  select existing_conversation.conversation_id into v_conversation_id
  from public.conversations as existing_conversation
  where existing_conversation.application_id = p_application
    or existing_conversation.order_id = service_order_id
    or (
      existing_conversation.job_id = application_row.job_id
      and exists (
        select 1 from public.conversation_participants as participant
        where participant.conversation_id = existing_conversation.conversation_id
          and participant.user_id = client_user_id
      )
      and exists (
        select 1 from public.conversation_participants as participant
        where participant.conversation_id = existing_conversation.conversation_id
          and participant.user_id = freelancer_user_id
      )
    )
  order by (existing_conversation.application_id = p_application) desc,
    (existing_conversation.order_id = service_order_id) desc,
    existing_conversation.created_at
  limit 1
  for update;

  if v_conversation_id is null then
    insert into public.conversations(job_id, order_id, application_id)
    values (application_row.job_id, service_order_id, p_application)
    returning conversation_id into v_conversation_id;
  else
    update public.conversations as existing_conversation
    set job_id = coalesce(existing_conversation.job_id, application_row.job_id),
      order_id = coalesce(existing_conversation.order_id, service_order_id),
      application_id = coalesce(existing_conversation.application_id, p_application)
    where existing_conversation.conversation_id = v_conversation_id;
  end if;

  insert into public.conversation_participants(conversation_id, user_id)
  values (v_conversation_id, client_user_id), (v_conversation_id, freelancer_user_id)
  on conflict do nothing;

  return service_order_id;
end;
$$;
