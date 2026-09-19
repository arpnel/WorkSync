begin;
-- Preserve agreement access when a listing is hidden or its owner is suspended.
create or replace function public.worksync_service_participant(p_service uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.service_orders o where o.service_id=p_service and public.worksync_order_party(o.order_id) is not null);
$$;
create or replace function public.worksync_job_participant(p_job uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.job_applications a join public.freelancer_profiles f using(freelancer_id) where a.job_id=p_job and f.user_id=auth.uid());
$$;
drop policy if exists services_moderation_visibility on public.services;
create policy services_moderation_visibility on public.services as restrictive for select to authenticated using(public.worksync_listing_visible('service',service_id) or public.worksync_service_participant(service_id) or public.worksync_is_admin() or exists(select 1 from public.freelancer_profiles f where f.freelancer_id=services.freelancer_id and f.user_id=auth.uid()));
drop policy if exists jobs_moderation_visibility on public.jobs;
create policy jobs_moderation_visibility on public.jobs as restrictive for select to authenticated using(public.worksync_listing_visible('job',job_id) or public.worksync_job_participant(job_id) or public.worksync_is_admin() or exists(select 1 from public.client_profiles c where c.client_id=jobs.client_id and c.user_id=auth.uid()));
create policy worksync_private_files_anon_write_guard on storage.objects as restrictive for all to anon using(bucket_id not in ('project-attachments','verification-documents')) with check(bucket_id not in ('project-attachments','verification-documents'));
-- Cap the private buckets even if they already existed.
update storage.buckets set file_size_limit=10485760 where id in ('project-attachments','verification-documents');
revoke all on function public.worksync_service_participant(uuid),public.worksync_job_participant(uuid) from public;
grant execute on function public.worksync_service_participant(uuid),public.worksync_job_participant(uuid) to authenticated;
-- Enable RLS explicitly; the supplied column export does not show this setting.
alter table public.projects enable row level security;
alter table public.service_orders enable row level security;
alter table public.contracts enable row level security;
alter table public.services enable row level security;
alter table public.jobs enable row level security;
alter table public.reviews enable row level security;
create policy worksync_project_member_access on public.projects for select to authenticated using(public.worksync_project_party(project_id) is not null);
create policy worksync_order_member_access on public.service_orders for select to authenticated using(public.worksync_order_party(order_id) is not null);
create policy worksync_contract_member_guard on public.contracts as restrictive for all to authenticated using(public.worksync_order_party(order_id) is not null) with check(public.worksync_order_party(order_id) is not null);
create policy worksync_contract_member_access on public.contracts for all to authenticated using(public.worksync_order_party(order_id) is not null) with check(public.worksync_order_party(order_id) is not null);
revoke delete on public.contracts from anon,authenticated;
revoke all on public.contracts from anon;
grant select,insert,update on public.contracts to authenticated;
commit;
