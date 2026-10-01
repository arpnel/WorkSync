-- PREPARED, NOT APPLIED. New freelancers: 10 commitments; 10 completed projects: 15.
-- Accepted discussions reserve capacity; pending requests/applications do not.
-- Existing workflow RPCs, grants and RLS remain unchanged; triggers guard direct writes too.
begin;

-- Install-time only: obtain all workload/dependency table locks before changing
-- functions or triggers. NOWAIT avoids waiting while holding a subset of locks.
-- If SQLSTATE 55P03 occurs, roll back and retry the WHOLE file during low traffic.
-- These locks temporarily block reads/writes until COMMIT; no sessions are killed.
set local lock_timeout = '3s';
lock table public.contracts, public.freelancer_profiles,
 public.job_applications, public.projects, public.service_orders
 in access exclusive mode nowait;

create or replace function public.worksync_freelancer_commitments(p_freelancer uuid)
returns table(commitment text) language sql stable security definer set search_path='' as $$
 -- Canonical source keys prevent counting an application, order and project three times.
 select distinct coalesce('order:'||coalesce(p.order_id,(select o.order_id from public.service_orders o where o.application_id=p.application_id order by o.order_id limit 1))::text,'application:'||p.application_id::text,'project:'||p.project_id::text)
 from public.projects p where p.freelancer_id=p_freelancer and p.status::text not in ('completed','cancelled')
 union
 select 'order:'||o.order_id::text from public.service_orders o
 where o.freelancer_id=p_freelancer and o.status::text in ('accepted','converted')
 and not exists(select 1 from public.projects p where p.order_id=o.order_id or p.application_id=o.application_id)
 and not exists(select 1 from public.contracts c where c.order_id=o.order_id and c.status::text in ('cancelled','rejected','completed'))
 union
 select coalesce('order:'||(select o.order_id from public.service_orders o where o.application_id=a.application_id order by o.order_id limit 1)::text,'application:'||a.application_id::text) from public.job_applications a
 where a.freelancer_id=p_freelancer and a.status::text='accepted'
 and not exists(select 1 from public.service_orders o where o.application_id=a.application_id and o.status::text in ('cancelled','rejected'))
 and not exists(select 1 from public.projects p where p.application_id=a.application_id or p.order_id in (select o.order_id from public.service_orders o where o.application_id=a.application_id))
 and not exists(select 1 from public.contracts c where (c.application_id=a.application_id or c.order_id in (select o.order_id from public.service_orders o where o.application_id=a.application_id)) and c.status::text in ('cancelled','rejected','completed'));
$$;
revoke all on function public.worksync_freelancer_commitments(uuid) from public,anon,authenticated;

create or replace function public.worksync_freelancer_project_limit(p_freelancer uuid)
returns integer language sql stable security definer set search_path='' as $$
 select case when count(*)>=10 then 15 else 10 end from public.projects
 where freelancer_id=p_freelancer and status::text='completed';
$$;
revoke all on function public.worksync_freelancer_project_limit(uuid) from public,anon,authenticated;

-- Public projection exposes availability only, never project counts, identities or details.
create or replace function public.worksync_freelancer_availability(p_freelancers uuid[])
returns table(freelancer_id uuid,available boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(cardinality(p_freelancers),0)>200 then
  raise exception 'Request at most 200 freelancers at once' using errcode='22023';
 end if;
 return query select f.freelancer_id,
   (select count(*) from public.worksync_freelancer_commitments(f.freelancer_id)) < public.worksync_freelancer_project_limit(f.freelancer_id)
 from public.freelancer_profiles f where f.freelancer_id=any(p_freelancers);
end; $$;
revoke all on function public.worksync_freelancer_availability(uuid[]) from public;
grant execute on function public.worksync_freelancer_availability(uuid[]) to anon,authenticated,service_role;

create or replace function public.worksync_guard_freelancer_capacity()
returns trigger language plpgsql security definer set search_path='' as $$
declare fid uuid; source_keys text[]; used bigint; cap integer;
begin
 fid:=new.freelancer_id;
 if fid is null then return new; end if;
 if tg_table_name='job_applications' then
  if new.status::text not in ('pending','in_review','shortlisted','accepted') then return new; end if;
  if tg_op='UPDATE' then
   if old.freelancer_id=new.freelancer_id and
     ((old.status::text=new.status::text) or
      (old.status::text in ('pending','in_review','shortlisted') and new.status::text in ('pending','in_review','shortlisted')))
     then return new; end if;
  end if;
  source_keys:=array['application:'||new.application_id::text,
    'order:'||(select o.order_id from public.service_orders o where o.application_id=new.application_id order by o.order_id limit 1)::text];
 elsif tg_table_name='service_orders' then
  if new.status::text not in ('pending','accepted','converted') then return new; end if;
  if tg_op='UPDATE' then
   if old.freelancer_id=new.freelancer_id and old.application_id is not distinct from new.application_id
      and (old.status::text=new.status::text or (old.status::text in ('accepted','converted') and new.status::text in ('accepted','converted')))
      then return new; end if;
  end if;
  source_keys:=array['order:'||new.order_id::text,'application:'||new.application_id::text];
 elsif tg_table_name='projects' then
  if new.status::text in ('completed','cancelled') then return new; end if;
  if tg_op='UPDATE' then
   if old.freelancer_id=new.freelancer_id and old.order_id is not distinct from new.order_id
     and old.application_id is not distinct from new.application_id and old.status::text not in ('completed','cancelled')
     then return new; end if;
  end if;
  source_keys:=array['project:'||new.project_id::text,'order:'||new.order_id::text,'application:'||new.application_id::text];
 else raise exception 'Unsupported capacity guard table';
 end if;
 -- Shared per-freelancer lock: parallel accepts cannot both claim the final slot.
 -- At higher isolation use a retryable failure rather than a stale count.
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'Capacity changes require a read committed transaction; retry the request' using errcode='40001';
 end if;
 perform 1 from public.freelancer_profiles where freelancer_id=fid for update;
 if not found then raise exception 'Freelancer profile not found' using errcode='23503'; end if;
 -- Converting a reserved discussion into its project consumes no additional slot,
 -- including existing commitments above a limit when this migration is introduced.
 if exists(select 1 from public.worksync_freelancer_commitments(fid) c
   where c.commitment=any(array_remove(source_keys,null))) then return new; end if;
 cap:=public.worksync_freelancer_project_limit(fid);
 select count(*) into used from public.worksync_freelancer_commitments(fid) c
 where not (c.commitment=any(array_remove(source_keys,null)));
 if used>=cap then
  raise exception 'This freelancer is fully booked (% project limit). New applications and project requests are unavailable until a slot opens.',cap
    using errcode='P0001',hint='Complete or cancel an existing commitment before taking new work.';
 end if;
 return new;
end; $$;
revoke all on function public.worksync_guard_freelancer_capacity() from public,anon,authenticated;

do $$ declare t text; begin
 foreach t in array array['job_applications','service_orders','projects'] loop
  execute format('drop trigger if exists worksync_guard_freelancer_capacity on public.%I',t);
  execute format('create trigger worksync_guard_freelancer_capacity before insert or update on public.%I for each row execute function public.worksync_guard_freelancer_capacity()',t);
 end loop;
end; $$;
create index if not exists worksync_capacity_projects on public.projects(freelancer_id,status);
create index if not exists worksync_capacity_orders on public.service_orders(freelancer_id,status);
create index if not exists worksync_capacity_applications on public.job_applications(freelancer_id,status);
notify pgrst,'reload schema';
commit;
