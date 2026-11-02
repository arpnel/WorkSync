-- PREPARED, NOT APPLIED.
-- Add WorkSync revenue totals to admin platform analytics. Counts only
-- confirmed test-mode transaction fees and paid test Premium order subtotals.
-- Project principal, freelancer VAT, and Premium VAT are not WorkSync earnings.
begin;

do $$
begin
  if to_regclass('public.payments') is null
    or to_regclass('public.subscription_orders') is null then
    raise exception 'Payments and Premium subscription order tables are required';
  end if;
  if exists (
    select required.column_name
    from (values ('platform_service_fee')) required(column_name)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema='public' and c.table_name='payments'
        and c.column_name=required.column_name
    )
  ) then
    raise exception 'Apply the project transaction-fee snapshot migration first';
  end if;
  if exists (
    select required.column_name
    from (values ('taxable_amount'),('paid_at'),('livemode')) required(column_name)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema='public' and c.table_name='subscription_orders'
        and c.column_name=required.column_name
    )
  ) then
    raise exception 'Apply the Premium monthly/yearly billing migration first';
  end if;
end;
$$;

create or replace function public.worksync_admin_analytics(
  p_from timestamptz default (now() - interval '30 days'),
  p_to timestamptz default now(),
  p_status text default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  result jsonb;
  categories jsonb;
  activity jsonb;
  revenue jsonb;
  status_filter text:=coalesce(p_status,'all');
begin
  if not public.worksync_is_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_from is null or p_to is null or p_to<=p_from
    or p_to-p_from>interval '5 years' then
    raise exception 'Choose a date range of at most five years';
  end if;

  with projects as (
    select * from public.projects
    where created_at>=p_from and created_at<p_to
      and (status_filter='all' or status::text=status_filter)
  ), counts as (
    select 'users' k,count(*) v from public."Users" where created_at>=p_from and created_at<p_to
    union all select 'clients',count(*) from public.client_profiles where created_at>=p_from and created_at<p_to
    union all select 'freelancers',count(*) from public.freelancer_profiles where created_at>=p_from and created_at<p_to
    union all select 'jobs',count(*) from public.jobs where created_at>=p_from and created_at<p_to
    union all select 'services',count(*) from public.services where created_at>=p_from and created_at<p_to
    union all select 'applications',count(*) from public.job_applications where created_at>=p_from and created_at<p_to
    union all select 'service_orders',count(*) from public.service_orders where created_at>=p_from and created_at<p_to
    union all select 'projects',count(*) from projects
    union all select 'completed_projects',count(*) from projects where status::text='completed'
    union all select 'cancelled_projects',count(*) from projects where status::text='cancelled'
    union all select 'reports',count(*) from public.listing_reports where created_at>=p_from and created_at<p_to
    union all select 'verification_requests',count(*) from public.verification_requests where created_at>=p_from and created_at<p_to
    union all select 'reviews',count(*) from public.reviews where created_at>=p_from and created_at<p_to
    union all select 'transactions',count(*) from public.payments where created_at>=p_from and created_at<p_to
    union all select 'disputes',count(*) from public.project_disputes where created_at>=p_from and created_at<p_to
  )
  select jsonb_build_object(
    'counts',(select jsonb_object_agg(k,v) from counts),
    'completion_rate',(select round(100.0*count(*) filter(where status::text='completed')/nullif(count(*),0),1) from projects),
    'average_project_value',(select round(avg(budget)::numeric,2) from projects),
    'average_rating',(select round(avg(rating)::numeric,2) from public.reviews where created_at>=p_from and created_at<p_to)
  ) into result;

  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into categories from (
    select c.name,
      (select count(*) from public.jobs j where j.category_id=c.id and j.created_at>=p_from and j.created_at<p_to) jobs,
      (select count(*) from public.services s where s.category_id=c.id and s.created_at>=p_from and s.created_at<p_to) services
    from public.job_categories c order by c.name
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.month),'[]'::jsonb) into activity from (
    select to_char(d,'YYYY-MM') month,
      (select count(*) from public."Users" u where u.created_at>=greatest(d,p_from) and u.created_at<least(d+interval '1 month',p_to)) users,
      (select count(*) from public.projects p where p.created_at>=greatest(d,p_from) and p.created_at<least(d+interval '1 month',p_to) and (status_filter='all' or p.status::text=status_filter)) projects
    from generate_series(date_trunc('month',p_from),date_trunc('month',p_to-interval '1 microsecond'),interval '1 month') d
  ) x;

  with months as (
    select d as month_start from generate_series(
      date_trunc('month',p_from),
      date_trunc('month',p_to-interval '1 microsecond'),
      interval '1 month'
    ) d
  ), transaction_fees as (
    select date_trunc('month',created_at) month_start,
      sum(platform_service_fee)::numeric(14,2) amount,count(*)::integer payment_count
    from public.payments
    where created_at>=p_from and created_at<p_to
      and status='paid' and livemode=false
    group by 1
  ), premium_sales as (
    select date_trunc('month',paid_at) month_start,
      sum(taxable_amount)::numeric(14,2) amount,count(*)::integer checkout_count
    from public.subscription_orders
    where paid_at>=p_from and paid_at<p_to
      and status='paid' and livemode=false
    group by 1
  )
  select jsonb_build_object(
    'transaction_fees',coalesce(sum(t.amount),0),
    'premium_subscriptions',coalesce(sum(s.amount),0),
    'total',coalesce(sum(t.amount),0)+coalesce(sum(s.amount),0),
    'activity',coalesce(jsonb_agg(jsonb_build_object(
      'month',to_char(m.month_start,'YYYY-MM'),
      'transaction_fees',coalesce(t.amount,0),
      'premium_subscriptions',coalesce(s.amount,0),
      'project_payments',coalesce(t.payment_count,0),
      'premium_checkouts',coalesce(s.checkout_count,0),
      'total',coalesce(t.amount,0)+coalesce(s.amount,0)
    ) order by m.month_start),'[]'::jsonb)
  )
  into revenue
  from months m
  left join transaction_fees t using(month_start)
  left join premium_sales s using(month_start);

  return result||jsonb_build_object(
    'categories',categories,
    'activity',activity,
    'revenue',revenue,
    -- Preserve the existing moderation analytics response for any current callers.
    'from',p_from,
    'to',p_to,
    'status',p_status,
    'users',result->'counts'->'users',
    'listing_reports',(select count(*) from public.listing_reports where created_at>=p_from and created_at<p_to and (p_status is null or status=p_status)),
    'listing_reports_by_status',(select coalesce(jsonb_object_agg(x.status,x.count),'{}'::jsonb) from (select status,count(*) from public.listing_reports where created_at>=p_from and created_at<p_to and (p_status is null or status=p_status) group by status)x),
    'disputes',(select count(*) from public.project_disputes where created_at>=p_from and created_at<p_to and (p_status is null or status=p_status)),
    'disputes_by_status',(select coalesce(jsonb_object_agg(x.status,x.count),'{}'::jsonb) from (select status,count(*) from public.project_disputes where created_at>=p_from and created_at<p_to and (p_status is null or status=p_status) group by status)x),
    'suspended_accounts',(select count(*) from public.account_moderation where status='suspended' and (p_status is null or status=p_status)),
    'hidden_listings',(select count(*) from public.listing_moderation where hidden and (p_status is null or p_status='hidden')),
    'audit_actions',(select count(*) from public.admin_audit_log where created_at>=p_from and created_at<p_to)
  );
end;
$$;

revoke all on function public.worksync_admin_analytics(timestamptz,timestamptz,text) from public;
grant execute on function public.worksync_admin_analytics(timestamptz,timestamptz,text) to authenticated;
notify pgrst,'reload schema';
commit;
