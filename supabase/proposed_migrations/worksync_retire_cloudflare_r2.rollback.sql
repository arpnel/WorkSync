-- Restore the pre-retirement Cloudflare R2 database objects.
-- This restores schema and RPC behavior only. It cannot restore deleted R2
-- files or ticket history; the ticket table contained 0 rows at retirement.
DO $rollback_r2$
BEGIN
  IF to_regclass('public.r2_upload_tickets') IS NOT NULL THEN
    RAISE EXCEPTION 'R2 rollback stopped: public.r2_upload_tickets already exists';
  END IF;

  EXECUTE $create_table$
    CREATE TABLE public.r2_upload_tickets (
      upload_id uuid NOT NULL,
      owner_id uuid NOT NULL,
      purpose text NOT NULL,
      target_id uuid NOT NULL,
      object_key text NOT NULL,
      multipart_upload_id text NOT NULL,
      file_name text NOT NULL,
      content_type text NOT NULL,
      expected_size bigint NOT NULL,
      status text NOT NULL DEFAULT 'uploading'::text,
      attached_record_id uuid,
      expires_at timestamp with time zone NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      CONSTRAINT r2_upload_tickets_pkey PRIMARY KEY (upload_id),
      CONSTRAINT r2_upload_tickets_object_key_key UNIQUE (object_key),
      CONSTRAINT r2_upload_tickets_expected_size_check
        CHECK (expected_size > 52428800 AND expected_size <= 1073741824),
      CONSTRAINT r2_upload_tickets_purpose_check
        CHECK (purpose = ANY (ARRAY['message'::text, 'submission'::text, 'dispute'::text])),
      CONSTRAINT r2_upload_tickets_status_check
        CHECK (status = ANY (ARRAY['uploading'::text, 'ready'::text, 'attached'::text, 'cleanup_pending'::text, 'aborted'::text]))
    )
  $create_table$;

  EXECUTE 'ALTER TABLE public.r2_upload_tickets ENABLE ROW LEVEL SECURITY';
  EXECUTE 'REVOKE ALL ON TABLE public.r2_upload_tickets FROM PUBLIC, anon, authenticated, service_role';
  EXECUTE 'GRANT ALL ON TABLE public.r2_upload_tickets TO service_role';

  EXECUTE $index$
    CREATE INDEX r2_upload_tickets_owner_status_idx
      ON public.r2_upload_tickets USING btree (owner_id, status, expires_at)
  $index$;
  EXECUTE $index$
    CREATE INDEX r2_upload_tickets_target_idx
      ON public.r2_upload_tickets USING btree (purpose, target_id, status)
  $index$;

  EXECUTE $restore_message_trigger_fn$
CREATE OR REPLACE FUNCTION public.worksync_consume_r2_message_upload()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_object_key text; ticket public.r2_upload_tickets;
begin
 if new.attachment_url is null or left(new.attachment_url,3)<>'r2:' then return new; end if;
 v_object_key := substring(new.attachment_url from 4);
 select * into ticket from public.r2_upload_tickets
 where r2_upload_tickets.object_key=v_object_key and owner_id=new.sender_id and purpose='message'
  and target_id=new.conversation_id and status='ready' and expires_at>now()
 for update;
 if ticket.upload_id is null or new.sender_id is distinct from auth.uid() then
  raise exception 'Invalid or expired large attachment upload';
 end if;
 update public.r2_upload_tickets set status='attached',attached_record_id=new.message_id
 where upload_id=ticket.upload_id and status='ready';
 if not found then raise exception 'Large attachment was already used'; end if;
 return new;
end; $function$

  $restore_message_trigger_fn$;
  EXECUTE $restore_open_dispute$
CREATE OR REPLACE FUNCTION public.worksync_open_dispute(p_id uuid, p_project uuid, p_milestone uuid, p_category text, p_description text, p_path text, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.projects; locked uuid; recipient uuid; v_object_key text; ticket public.r2_upload_tickets;
begin
 select * into p from public.projects where project_id=p_project;
 select contract_id into locked from public.contracts where order_id=p.order_id for update;
 select * into p from public.projects where project_id=p_project for update;
 if public.worksync_project_party(p_project) is null or p.status::text not in ('active','in_progress','revision') then raise exception 'Disputes require an active project and participant access'; end if;
 if public.worksync_order_on_hold(p.order_id) then raise exception 'There is already an open resolution request'; end if;
 if p_milestone is not null and not exists(select 1 from public.milestones where project_id=p_project and milestone_id=p_milestone and status::text<>'completed') then raise exception 'Choose an unfinished milestone from this project'; end if;
 if p_path like 'r2:%' then
  v_object_key := substring(p_path from 4);
  select * into ticket from public.r2_upload_tickets where r2_upload_tickets.object_key=v_object_key and owner_id=auth.uid() and purpose='dispute' and target_id=p_project and status='ready' and expires_at>now() for update;
  if ticket.upload_id is null then raise exception 'Invalid or expired dispute evidence upload'; end if;
 elsif p_path is not null and (p_path not like p_project::text||'/'||auth.uid()::text||'/'||p_id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='project-attachments' and name=p_path)) then
  raise exception 'Invalid dispute evidence';
 end if;
 insert into public.project_disputes(dispute_id,project_id,milestone_id,opened_by,category,description,evidence_path,evidence_name) values(p_id,p_project,p_milestone,auth.uid(),p_category,p_description,p_path,p_name);
 if ticket.upload_id is not null then
  update public.r2_upload_tickets set status='attached',attached_record_id=p_id where upload_id=ticket.upload_id and status='ready';
  if not found then raise exception 'Large evidence upload was already used'; end if;
 end if;
 for recipient in select user_id from public.client_profiles where client_id=p.client_id union select user_id from public.freelancer_profiles where freelancer_id=p.freelancer_id loop
  insert into public.notifications(user_id,type,title,message,related_id,is_read) values(recipient,'project_update','Project dispute opened','Delivery decisions are paused while the dispute is reviewed.',p.order_id,false);
 end loop;
end; $function$

  $restore_open_dispute$;
  EXECUTE $restore_submit_work$
CREATE OR REPLACE FUNCTION public.worksync_submit_work(p_id uuid, p_project uuid, p_milestone uuid, p_body text, p_link text, p_kind text, p_path text, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.projects; recipient uuid; milestone_type boolean; locked uuid; current_milestone uuid; v_object_key text; ticket public.r2_upload_tickets;
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
 if p_path like 'r2:%' then
  v_object_key := substring(p_path from 4);
  select * into ticket from public.r2_upload_tickets where r2_upload_tickets.object_key=v_object_key and owner_id=auth.uid() and purpose='submission' and target_id=p_project and status='ready' and expires_at>now() for update;
  if ticket.upload_id is null then raise exception 'Invalid or expired large attachment upload'; end if;
 elsif p_path is not null and (p_path not like p_project::text||'/'||auth.uid()::text||'/'||p_id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='project-attachments' and name=p_path)) then
  raise exception 'Invalid attachment';
 end if;
 insert into public.project_submissions(submission_id,project_id,milestone_id,author_id,body,link,kind,attachment_path,attachment_name) values(p_id,p_project,p_milestone,auth.uid(),p_body,p_link,p_kind,p_path,p_name);
 if ticket.upload_id is not null then
  update public.r2_upload_tickets set status='attached',attached_record_id=p_id where upload_id=ticket.upload_id and status='ready';
  if not found then raise exception 'Large attachment was already used'; end if;
 end if;
 if p_kind='delivery' then
  update public.milestones set status='submitted' where milestone_id=p_milestone and project_id=p_project;
  update public.revision_requests r set status='addressed' from public.project_submissions s where r.submission_id=s.submission_id and r.project_id=p_project and s.milestone_id is not distinct from p_milestone and r.status='open';
 end if;
 select user_id into recipient from public.client_profiles where client_id=p.client_id;
 insert into public.notifications(user_id,type,title,message,related_id,is_read) values(recipient,'project_update','Project work submitted','New work is ready in your project workspace.',p.order_id,false);
end; $function$

  $restore_submit_work$;

  EXECUTE 'REVOKE ALL ON FUNCTION public.worksync_consume_r2_message_upload() FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.worksync_consume_r2_message_upload() TO service_role';
  EXECUTE 'REVOKE ALL ON FUNCTION public.worksync_open_dispute(uuid,uuid,uuid,text,text,text,text) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.worksync_open_dispute(uuid,uuid,uuid,text,text,text,text) TO authenticated, service_role';
  EXECUTE 'REVOKE ALL ON FUNCTION public.worksync_submit_work(uuid,uuid,uuid,text,text,text,text,text) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.worksync_submit_work(uuid,uuid,uuid,text,text,text,text,text) TO authenticated, service_role';

  EXECUTE $trigger$
    CREATE TRIGGER worksync_consume_r2_message_upload
      BEFORE INSERT OR UPDATE OF attachment_url, attachment_type, sender_id, conversation_id
      ON public.messages
      FOR EACH ROW EXECUTE FUNCTION public.worksync_consume_r2_message_upload()
  $trigger$;

  EXECUTE $index$
    CREATE INDEX messages_r2_attachment_url_idx
      ON public.messages USING btree (attachment_url)
      WHERE attachment_url ~~ 'r2:%'::text
  $index$;
  EXECUTE $index$
    CREATE INDEX project_submissions_r2_attachment_path_idx
      ON public.project_submissions USING btree (attachment_path)
      WHERE attachment_path ~~ 'r2:%'::text
  $index$;
  EXECUTE $index$
    CREATE INDEX project_disputes_r2_evidence_path_idx
      ON public.project_disputes USING btree (evidence_path)
      WHERE evidence_path ~~ 'r2:%'::text
  $index$;

  PERFORM pg_notify('pgrst', 'reload schema');
END;
$rollback_r2$;

