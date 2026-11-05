-- PREPARED, NOT APPLIED.
-- Allow the initial service-order contract draft to be created before the
-- planner exists. Keep the work-plan agreement guard on later version changes.
begin;

drop trigger if exists worksync_require_agreed_service_order_work_plan
  on public.contracts;

create trigger worksync_require_agreed_service_order_work_plan
  before update of current_version, order_id, application_id
  on public.contracts
  for each row execute function public.worksync_require_agreed_service_order_work_plan();

notify pgrst, 'reload schema';
commit;
