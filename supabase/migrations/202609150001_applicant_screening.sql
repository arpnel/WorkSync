-- Apply separately from the older platform migrations. No new tables.
begin;
create or replace function public.worksync_save_screening(
 p_actor uuid, p_application uuid, p_application_updated timestamptz, p_job_updated timestamptz,
 p_score integer, p_result text, p_strengths text, p_weaknesses text, p_recommendation text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.job_applications; j public.jobs; saved public.screening_results; metadata jsonb;
begin
 select * into a from public.job_applications where application_id=p_application for update;
 select * into j from public.jobs where job_id=a.job_id for share;
 if a.application_id is null or not exists(select 1 from public.client_profiles c where c.client_id=j.client_id and c.user_id=p_actor) then raise exception 'Application owner required'; end if;
 if a.updated_at is distinct from p_application_updated or j.updated_at is distinct from p_job_updated then raise exception 'Application or job changed' using errcode='40001'; end if;
 metadata:=p_result::jsonb;
 if p_score is null or p_score not between 0 and 100 or metadata->>'version' is distinct from 'worksync-match-v1'
 or coalesce(metadata->>'inputHash','') !~ '^[a-f0-9]{64}$'
 or coalesce(metadata->>'label','') not in ('Strong Match','Potential Match','Limited Match Evidence')
 or jsonb_typeof(p_strengths::jsonb) is distinct from 'array' or jsonb_typeof(p_weaknesses::jsonb) is distinct from 'array'
 or coalesce(length(p_recommendation),0) not between 1 and 300 then raise exception 'Invalid screening'; end if;
 select * into saved from public.screening_results where screening_id=a.screening_id and application_id=a.application_id and freelancer_id=a.freelancer_id;
 -- Serialize competing saves and reuse the same linked row. A valid identical result wins.
 if saved.screening_id is not null and saved.result=p_result and saved.score is not null and saved.expires_at>now() then return to_jsonb(saved); end if;
 if saved.screening_id is null then
 insert into public.screening_results(freelancer_id,application_id,score,result,strengths,weaknesses,recommendation,screened_at,expires_at)
 values(a.freelancer_id,a.application_id,p_score,p_result,p_strengths,p_weaknesses,p_recommendation,now(),now()+interval '7 days') returning * into saved;
 else
 update public.screening_results set score=p_score,result=p_result,strengths=p_strengths,weaknesses=p_weaknesses,recommendation=p_recommendation,screened_at=now(),expires_at=now()+interval '7 days'
 where screening_id=saved.screening_id returning * into saved;
 end if;
 update public.job_applications set screening_id=saved.screening_id where application_id=a.application_id;
 return to_jsonb(saved);
end; $$;
revoke all on function public.worksync_save_screening(uuid,uuid,timestamptz,timestamptz,integer,text,text,text,text) from public,anon,authenticated;
grant execute on function public.worksync_save_screening(uuid,uuid,timestamptz,timestamptz,integer,text,text,text,text) to service_role;

alter table public.screening_results enable row level security;
revoke all on public.screening_results from anon,authenticated;
grant select on public.screening_results to authenticated;
drop policy if exists worksync_screening_participant_guard on public.screening_results;
drop policy if exists worksync_screening_participant_read on public.screening_results;
create policy worksync_screening_participant_guard on public.screening_results as restrictive for select to authenticated using (
 exists(select 1 from public.job_applications a join public.jobs j using(job_id) join public.client_profiles c using(client_id) join public.freelancer_profiles f on f.freelancer_id=a.freelancer_id
 where a.application_id=screening_results.application_id and a.freelancer_id=screening_results.freelancer_id and (c.user_id=auth.uid() or f.user_id=auth.uid()))
);
create policy worksync_screening_participant_read on public.screening_results for select to authenticated using (
 exists(select 1 from public.job_applications a join public.jobs j using(job_id) join public.client_profiles c using(client_id) join public.freelancer_profiles f on f.freelancer_id=a.freelancer_id
 where a.application_id=screening_results.application_id and a.freelancer_id=screening_results.freelancer_id and (c.user_id=auth.uid() or f.user_id=auth.uid()))
);
commit;
