-- PREPARED ONLY: collapse Pro and Pro Plus into one Premium plan.
-- Apply after 202610130001_listing_moderation_subscriptions.sql.
-- The internal plan code remains 'pro' for application compatibility.
begin;

do $$
begin
  if to_regclass('public.subscription_plans') is null
     or to_regclass('public.user_subscriptions') is null then
    raise exception 'Apply the listing moderation and subscription migration first';
  end if;
end;
$$;

-- Keep the current one-Premium offer limits from /home/offers.
insert into public.subscription_plans(
  plan_code,
  display_name,
  monthly_job_limit,
  monthly_service_limit,
  active_job_limit,
  active_service_limit,
  provisional_monthly_price
)
values ('pro', 'Premium', 30, 30, 20, 20, null)
on conflict (plan_code) do update set
  display_name = excluded.display_name,
  monthly_job_limit = excluded.monthly_job_limit,
  monthly_service_limit = excluded.monthly_service_limit,
  active_job_limit = excluded.active_job_limit,
  active_service_limit = excluded.active_service_limit;

-- Preserve existing Pro Plus subscribers by moving their assignment to Premium.
update public.user_subscriptions
set plan_code = 'pro', updated_at = now()
where plan_code = 'pro_plus';

delete from public.subscription_plans
where plan_code = 'pro_plus';

alter table public.subscription_plans
  drop constraint if exists subscription_plans_plan_code_check;
alter table public.subscription_plans
  add constraint subscription_plans_plan_code_check
  check (plan_code in ('free', 'pro'));

commit;
