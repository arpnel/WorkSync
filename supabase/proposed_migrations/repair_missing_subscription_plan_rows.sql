-- PREPARED ONLY, NOT APPLIED.
-- Restore the canonical Free and Premium rows required by the signup trigger.
-- Based on 202610130001_listing_moderation_subscriptions.sql,
-- 202610240001_single_premium_plan.sql, and
-- 202610250001_subscription_trials_and_manual_billing.sql.
begin;

do $$
begin
  if to_regclass('public.subscription_plans') is null then
    raise exception 'public.subscription_plans does not exist';
  end if;

  if (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'subscription_plans'
      and column_name in (
        'plan_code',
        'display_name',
        'monthly_job_limit',
        'monthly_service_limit',
        'active_job_limit',
        'active_service_limit',
        'active_listing_limit',
        'provisional_monthly_price',
        'updated_at'
      )
  ) <> 9 then
    raise exception 'subscription_plans columns differ from the expected WorkSync schema';
  end if;
end;
$$;

insert into public.subscription_plans (
  plan_code,
  display_name,
  monthly_job_limit,
  monthly_service_limit,
  active_job_limit,
  active_service_limit,
  active_listing_limit,
  provisional_monthly_price,
  updated_at
)
values
  ('free', 'Free', 3, 3, 3, 3, 3, 0, now()),
  ('pro', 'Premium', 30, 30, 20, 20, 20, 999.99, now())
on conflict (plan_code) do update set
  display_name = excluded.display_name,
  monthly_job_limit = excluded.monthly_job_limit,
  monthly_service_limit = excluded.monthly_service_limit,
  active_job_limit = excluded.active_job_limit,
  active_service_limit = excluded.active_service_limit,
  active_listing_limit = excluded.active_listing_limit,
  provisional_monthly_price = excluded.provisional_monthly_price,
  updated_at = now();

commit;

-- Verification after an approved application:
select plan_code, display_name, monthly_job_limit, monthly_service_limit,
       active_listing_limit, provisional_monthly_price
from public.subscription_plans
where plan_code in ('free', 'pro')
order by plan_code;
