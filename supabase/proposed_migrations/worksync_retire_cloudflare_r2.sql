-- Retire WorkSync's Cloudflare R2 multipart upload integration.
-- Prepared from the live PostgreSQL 17.6 definitions after checking row counts,
-- RPC grants, trigger dependencies, storage paths, bucket settings, and indexes.
-- The DO block is atomic: any failed precondition or DDL error rolls it all back.
DO $retire_r2$
DECLARE
  v_ticket_rows bigint;
  v_r2_function_count integer;
BEGIN
  IF to_regclass('public.r2_upload_tickets') IS NULL THEN
    RAISE EXCEPTION 'R2 retirement stopped: public.r2_upload_tickets is missing';
  END IF;

  SELECT count(*) INTO v_ticket_rows FROM public.r2_upload_tickets;
  IF v_ticket_rows <> 0 THEN
    RAISE EXCEPTION 'R2 retirement stopped: r2_upload_tickets contains % rows', v_ticket_rows;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.messages WHERE attachment_url LIKE 'r2:%'
    UNION ALL
    SELECT 1 FROM public.project_submissions WHERE attachment_path LIKE 'r2:%'
    UNION ALL
    SELECT 1 FROM public.project_disputes WHERE evidence_path LIKE 'r2:%'
  ) THEN
    RAISE EXCEPTION 'R2 retirement stopped: legacy R2 attachment references remain';
  END IF;

  SELECT count(*) INTO v_r2_function_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ILIKE '%r2_upload_tickets%';

  IF v_r2_function_count <> 3 THEN
    RAISE EXCEPTION 'R2 retirement stopped: expected 3 inspected table-dependent functions, found %', v_r2_function_count;
  END IF;

  IF to_regprocedure('public.worksync_open_dispute(uuid,uuid,uuid,text,text,text,text)') IS NULL
     OR to_regprocedure('public.worksync_submit_work(uuid,uuid,uuid,text,text,text,text,text)') IS NULL
     OR to_regprocedure('public.worksync_consume_r2_message_upload()') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.messages'::regclass
         AND tgname = 'worksync_consume_r2_message_upload'
         AND NOT tgisinternal
     )
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='messages_r2_attachment_url_idx')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='project_submissions_r2_attachment_path_idx')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='project_disputes_r2_evidence_path_idx') THEN
    RAISE EXCEPTION 'R2 retirement stopped: inspected functions, trigger, or indexes have changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='r2_upload_tickets'
  ) OR EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE schemaname='public' AND tablename='r2_upload_tickets'
  ) THEN
    RAISE EXCEPTION 'R2 retirement stopped: ticket-table security or publication dependencies changed';
  END IF;

  -- Keep both legacy RPC signatures callable for Supabase Storage paths.
  -- Their previous owner, SECURITY DEFINER setting, search_path, and grants
  -- are retained by CREATE OR REPLACE.
  EXECUTE $open_dispute$
CREATE OR REPLACE FUNCTION public.worksync_open_dispute(p_id uuid, p_project uuid, p_milestone uuid, p_category text, p_description text, p_path text, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.projects; locked uuid; recipient uuid;
begin
 select * into p from public.projects where project_id=p_project;
 select contract_id into locked from public.contracts where order_id=p.order_id for update;
 select * into p from public.projects where project_id=p_project for update;
 if public.worksync_project_party(p_project) is null or p.status::text not in ('active','in_progress','revision') then raise exception 'Disputes require an active project and participant access'; end if;
 if public.worksync_order_on_hold(p.order_id) then raise exception 'There is already an open resolution request'; end if;
 if p_milestone is not null and not exists(select 1 from public.milestones where project_id=p_project and milestone_id=p_milestone and status::text<>'completed') then raise exception 'Choose an unfinished milestone from this project'; end if;
 if p_path is not null and (p_path not like p_project::text||'/'||auth.uid()::text||'/'||p_id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='project-attachments' and name=p_path)) then
  raise exception 'Invalid dispute evidence';
 end if;
 insert into public.project_disputes(dispute_id,project_id,milestone_id,opened_by,category,description,evidence_path,evidence_name) values(p_id,p_project,p_milestone,auth.uid(),p_category,p_description,p_path,p_name);
 
 for recipient in select user_id from public.client_profiles where client_id=p.client_id union select user_id from public.freelancer_profiles where freelancer_id=p.freelancer_id loop
  insert into public.notifications(user_id,type,title,message,related_id,is_read) values(recipient,'project_update','Project dispute opened','Delivery decisions are paused while the dispute is reviewed.',p.order_id,false);
 end loop;
end; $function$

  $open_dispute$;

  EXECUTE $submit_work$
CREATE OR REPLACE FUNCTION public.worksync_submit_work(p_id uuid, p_project uuid, p_milestone uuid, p_body text, p_link text, p_kind text, p_path text, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.projects; recipient uuid; milestone_type boolean; locked uuid; current_milestone uuid;
begin
 select * into p from public.projects where project_id=p_project;
 select contract_id into locked from public.contracts where order_id=p.order_id for update;
 select * into p from public.projects where project_id=p_project for update;
 if p_kind is null or p_kind not in ('progress','delivery') then raise exception 'Invalid submission type'; end if;
 if coalesce(length(trim(p_body)),0)=0 and p_link is null and p_path is null then raise exception 'Add notes, a link, or an attachment'; end if;
 if p_link is not null and p_link !~ '^https?://' then raise exception 'Use an HTTP or HTTPS link'; end if;
 if length(p_body)>10000 then raise exception 'Submission text is too long'; end if;
 if p_kind='delivery' and public.worksync_order_on_hold(p.order_id) then raise exception 'Delivery is paused pending resolution'; end if;
 if public.worksync_project_party(p_project) is distinct from 'freelancer' or p.status::text not in ('active','in_progress','revision') then raise exception 'Only the project freelancer can submit active work'; end if;
 select s.service_type::text='milestone' into milestone_type from public.service_orders o join public.services s using(service_id) where o.order_id=p.order_id;
 if (milestone_type or exists(select 1 from public.milestones where project_id=p_project)) and p_milestone is null then raise exception 'Choose a milestone'; end if;
 if p_milestone is not null and not exists(select 1 from public.milestones where milestone_id=p_milestone and project_id=p_project and status::text not in ('approved','completed','cancelled')) then raise exception 'Milestone unavailable'; end if;
 if p_milestone is not null then
  select m.milestone_id into current_milestone from public.milestones m
  where m.project_id=p_project and m.status::text not in ('approved','completed','cancelled')
  order by m.display_order,m.milestone_id limit 1;
  if current_milestone is distinct from p_milestone then raise exception 'Submit work for the current milestone only'; end if;
 end if;
 if p_kind='delivery' and exists(select 1 from public.project_submissions where project_id=p_project and milestone_id is not distinct from p_milestone and kind='delivery' and status='submitted') then raise exception 'Wait for the client to review your current delivery'; end if;
 if p_path is not null and (p_path not like p_project::text||'/'||auth.uid()::text||'/'||p_id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='project-attachments' and name=p_path)) then
  raise exception 'Invalid attachment';
 end if;
 insert into public.project_submissions(submission_id,project_id,milestone_id,author_id,body,link,kind,attachment_path,attachment_name) values(p_id,p_project,p_milestone,auth.uid(),p_body,p_link,p_kind,p_path,p_name);
 
 if p_kind='delivery' then
  update public.milestones set status='submitted' where milestone_id=p_milestone and project_id=p_project;
  update public.revision_requests r set status='addressed' from public.project_submissions s where r.submission_id=s.submission_id and r.project_id=p_project and s.milestone_id is not distinct from p_milestone and r.status='open';
 end if;
 select user_id into recipient from public.client_profiles where client_id=p.client_id;
 insert into public.notifications(user_id,type,title,message,related_id,is_read) values(recipient,'project_update','Project work submitted','New work is ready in your project workspace.',p.order_id,false);
end; $function$

  $submit_work$;

  -- This trigger was a no-op for Supabase Storage attachments and only bound
  -- Cloudflare R2 tickets. Remove it and its private trigger function.
  EXECUTE 'DROP TRIGGER worksync_consume_r2_message_upload ON public.messages';
  EXECUTE 'DROP FUNCTION public.worksync_consume_r2_message_upload()';

  EXECUTE 'DROP INDEX public.messages_r2_attachment_url_idx';
  EXECUTE 'DROP INDEX public.project_submissions_r2_attachment_path_idx';
  EXECUTE 'DROP INDEX public.project_disputes_r2_evidence_path_idx';

  -- No CASCADE: PostgreSQL must reject unexpected dependencies.
  EXECUTE 'DROP TABLE public.r2_upload_tickets';

  IF to_regclass('public.r2_upload_tickets') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.prokind='f'
         AND (pg_get_functiondef(p.oid) ILIKE '%r2_upload_tickets%'
           OR pg_get_functiondef(p.oid) ILIKE '%r2:%'
           OR pg_get_functiondef(p.oid) ILIKE '%cloudflare%'
           OR pg_get_functiondef(p.oid) ILIKE '%multipart_upload_id%')
     ) THEN
    RAISE EXCEPTION 'R2 retirement verification failed';
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
END;
$retire_r2$;

