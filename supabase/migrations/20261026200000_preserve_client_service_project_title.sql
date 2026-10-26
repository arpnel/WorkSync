-- PREPARED, NOT APPLIED. Preserve the client-entered project title when a
-- service agreement activates. The deployed activation function previously
-- used the freelancer's service listing title for new service projects.
begin;

create or replace function public.worksync_activate_contract(p_contract_id uuid)
returns public.projects
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  c public.contracts;
  so public.service_orders;
  a public.job_applications;
  j public.jobs;
  s public.services;
  cid uuid;
  fid uuid;
  oid uuid;
  pid uuid;
  st date := current_date;
  dl date;
  p public.projects;
  terms_json jsonb := '{}'::jsonb;
  project_title text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_contract_id::text, 0));

  select * into c
  from public.contracts
  where contract_id = p_contract_id
  for update;
  if c.contract_id is null then
    raise exception 'Contract not found' using errcode = 'P0002';
  end if;

  if c.order_id is not null then
    select * into so
    from public.service_orders
    where order_id = c.order_id
    for update;
    cid := so.client_id;
    fid := so.freelancer_id;
    oid := so.order_id;
    select * into s from public.services where service_id = so.service_id;
  else
    select * into a
    from public.job_applications
    where application_id = c.application_id
    for update;
    select * into j from public.jobs where job_id = a.job_id;
    cid := j.client_id;
    fid := a.freelancer_id;
    select * into so
    from public.service_orders
    where application_id = c.application_id
    for update;
    if so.order_id is null then
      insert into public.service_orders(job_id, application_id, client_id, freelancer_id, status)
      values(a.job_id, a.application_id, cid, fid, 'pending')
      returning * into so;
    end if;
    oid := so.order_id;
  end if;

  perform public.worksync_guard_contract(p_contract_id);
  dl := st + c.delivery_time_days;

  -- Service request details are stored in the contract terms as JSON text.
  -- Older or non-JSON terms safely fall back to the listing title.
  begin
    terms_json := coalesce(c.terms, '')::jsonb;
  exception when others then
    terms_json := '{}'::jsonb;
  end;
  project_title := coalesce(
    nullif(trim(terms_json ->> 'projectTitle'), ''),
    nullif(trim(j.title), ''),
    nullif(trim(s.title), ''),
    'WorkSync project'
  );

  select * into p
  from public.projects x
  where (c.order_id is not null and x.order_id = oid)
     or (c.application_id is not null and x.application_id = c.application_id)
  order by x.created_at
  limit 1
  for update;

  if p.project_id is null then
    insert into public.projects(
      freelancer_id, client_id, title, description, budget, status,
      start_date, due_date, order_id, application_id
    )
    values(
      fid, cid, project_title,
      coalesce(j.description, s.description, c.terms),
      c.final_price, 'active', st, dl,
      case when c.order_id is not null then oid end,
      case when c.application_id is not null then c.application_id end
    )
    returning * into p;
  else
    update public.projects x
    set freelancer_id = fid,
        client_id = cid,
        budget = c.final_price,
        status = 'active',
        start_date = st,
        due_date = dl,
        updated_at = now()
    where x.project_id = p.project_id
    returning * into p;
  end if;

  insert into public.milestones(
    project_id, title, description, amount, due_date, display_order, status
  )
  select p.project_id, m.title, m.description, m.amount, m.due_date,
         m.display_order, 'pending'::public.milestone_status
  from public.contract_milestones m
  where m.contract_id = p_contract_id
    and not exists(
      select 1 from public.milestones x
      where x.project_id = p.project_id
        and x.title = m.title
        and x.display_order = m.display_order
    );

  update public.contracts
  set status = 'active'::public.contract_status, updated_at = now()
  where contract_id = p_contract_id;
  update public.service_orders
  set status = 'converted', updated_at = now()
  where order_id = oid;

  return p;
end;
$function$;

notify pgrst, 'reload schema';
commit;
