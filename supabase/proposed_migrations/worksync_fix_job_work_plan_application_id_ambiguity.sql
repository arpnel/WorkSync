-- PREPARED, NOT APPLIED.
-- Repair the contract trigger used by existing job-based work-plan approvals.
-- The trigger's local ID variable must not share the application_id column name.
begin;

create or replace function public.worksync_require_agreed_job_work_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_application_id uuid;
  application_status text;
  work_plan_agreement public.job_basic_terms_agreements;
begin
  target_application_id := coalesce(
    new.application_id,
    (select service_order.application_id
     from public.service_orders as service_order
     where service_order.order_id = new.order_id)
  );
  if target_application_id is null then return new; end if;

  select application.status::text into application_status
  from public.job_applications as application
  where application.application_id = target_application_id;
  if application_status is distinct from 'accepted' then return new; end if;

  select * into work_plan_agreement
  from public.job_basic_terms_agreements as agreement
  where agreement.application_id = target_application_id;
  if work_plan_agreement.terms is null
     or work_plan_agreement.client_agreed_at is null
     or work_plan_agreement.freelancer_agreed_at is null
     or work_plan_agreement.work_plan is null
     or work_plan_agreement.client_work_plan_agreed_at is null
     or work_plan_agreement.freelancer_work_plan_agreed_at is null then
    raise exception 'Both participants must agree to the work plan before creating or changing a contract version'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
