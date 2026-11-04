-- APPLIED TO PRODUCTION as 20261104021023_worksync_admin_dispute_delivery_completion.
-- Add dispute outcomes that approve the latest submitted delivery through the
-- existing review RPC. Settlement remains responsible for funding and payouts.

BEGIN;

ALTER TABLE public.project_disputes
  DROP CONSTRAINT IF EXISTS project_disputes_resolution_action_check;

ALTER TABLE public.project_disputes
  ADD CONSTRAINT project_disputes_resolution_action_check
  CHECK (
    resolution_action IS NULL
    OR resolution_action IN (
      'resume_work',
      'cancel_project',
      'complete_project',
      'complete_milestone'
    )
  );

CREATE OR REPLACE FUNCTION public.worksync_admin_disputes_page(
  p_search text DEFAULT ''::text,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  page_offset integer := greatest(p_offset, 0);
BEGIN
  IF NOT public.worksync_is_admin() THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  RETURN (
    WITH records AS (
      SELECT
        d.dispute_id,
        p.project_id,
        d.milestone_id,
        d.status,
        d.category,
        d.created_at,
        d.description,
        d.opened_by,
        d.admin_notes,
        d.evidence_name
      FROM public.project_disputes d
      JOIN public.projects p USING (project_id)
      WHERE coalesce(p_search, '') = ''
        OR p.title ILIKE '%' || p_search || '%'
        OR d.status ILIKE '%' || p_search || '%'
        OR d.dispute_id::text = p_search
    ), paged AS (
      SELECT *
      FROM records
      ORDER BY created_at DESC, dispute_id
      LIMIT 10 OFFSET page_offset
    )
    SELECT jsonb_build_object(
      'rows', coalesce((SELECT jsonb_agg(to_jsonb(paged)) FROM paged), '[]'::jsonb),
      'total', (SELECT count(*) FROM records),
      'limit', 10,
      'offset', page_offset
    )
  );
END;
$function$;

-- Allow only the scoped admin dispute-completion path to pass task-linked
-- submission reviews; ordinary client review and service-role auto-review keep
-- their existing checks.
CREATE OR REPLACE FUNCTION public.worksync_apply_task_submission_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  t public.project_tasks;
  old_s text;
  client_review boolean;
  admin_dispute_review boolean;
BEGIN
  IF NEW.task_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO t
  FROM public.project_tasks
  WHERE task_id = NEW.task_id
  FOR UPDATE;
  IF t.project_id <> NEW.project_id THEN
    RAISE EXCEPTION 'Task belongs to another project';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.task_id IS NULL AND NEW.task_id IS NOT NULL THEN
    IF t.status NOT IN ('in_progress', 'revision_requested') THEN
      RAISE EXCEPTION 'Task is not ready for delivery';
    END IF;
    old_s := t.status;
    UPDATE public.project_tasks
    SET status = 'in_review', updated_at = now()
    WHERE task_id = t.task_id;
    INSERT INTO public.project_task_history(task_id, actor_id, from_status, to_status, submission_id)
    VALUES (t.task_id, auth.uid(), old_s, 'in_review', NEW.submission_id);
    RETURN NEW;
  END IF;

  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  IF OLD.status NOT IN ('submitted', 'revision_requested')
     OR NEW.status NOT IN ('approved', 'revision_requested') THEN
    RAISE EXCEPTION 'Invalid task submission status transition' USING errcode = '22023';
  END IF;
  IF auth.role() = 'service_role'
     AND NEW.status = 'approved'
     AND NEW.auto_reviewed_at IS NOT NULL
     AND NEW.reviewed_at IS NOT NULL THEN
    UPDATE public.project_tasks
    SET status = 'auto_approved', updated_at = now()
    WHERE task_id = t.task_id;
    INSERT INTO public.project_task_history(task_id, from_status, to_status, submission_id)
    VALUES (t.task_id, t.status, 'auto_approved', NEW.submission_id);
    RETURN NEW;
  END IF;

  client_review := auth.uid() IS NOT NULL
    AND public.worksync_project_party(NEW.project_id) = 'client';
  admin_dispute_review := public.worksync_is_admin()
    AND EXISTS (
      SELECT 1
      FROM public.worksync_workflow_write_context x
      WHERE x.backend_pid = pg_backend_pid()
        AND x.transaction_id = txid_current()
        AND x.object_id = NEW.submission_id
        AND x.purpose = 'submission_review'
    );
  IF (NOT client_review AND NOT admin_dispute_review)
     OR public.worksync_order_on_hold(
       (SELECT order_id FROM public.projects WHERE project_id = NEW.project_id)
     ) THEN
    RAISE EXCEPTION 'Only an eligible client review may change a task submission' USING errcode = '42501';
  END IF;
  IF t.status NOT IN ('in_review', 'auto_approved', 'revision_requested') THEN
    RAISE EXCEPTION 'Task is not awaiting review' USING errcode = '22023';
  END IF;

  old_s := t.status;
  IF NEW.status = 'approved' THEN
    UPDATE public.project_tasks
    SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE task_id = t.task_id;
    INSERT INTO public.project_task_history(task_id, actor_id, from_status, to_status, submission_id)
    VALUES (t.task_id, auth.uid(), old_s, 'completed', NEW.submission_id);
  ELSE
    UPDATE public.project_tasks
    SET status = 'revision_requested', updated_at = now()
    WHERE task_id = t.task_id;
    INSERT INTO public.project_task_history(task_id, actor_id, from_status, to_status, submission_id)
    VALUES (t.task_id, auth.uid(), old_s, 'revision_requested', NEW.submission_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- Keep the normal delivery review rules. An administrator can approve only
-- while the dispute resolver has created a transaction-scoped marker for this
-- exact submission and the matching dispute is being completed.
CREATE OR REPLACE FUNCTION public.worksync_review_submission(
  p_submission uuid,
  p_action text,
  p_instructions text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  s public.project_submissions;
  p public.projects;
  revision_limit integer;
  used integer;
  recipient uuid;
  locked uuid;
  admin_dispute_review boolean;
BEGIN
  SELECT * INTO s
  FROM public.project_submissions
  WHERE submission_id = p_submission;
  SELECT * INTO p
  FROM public.projects
  WHERE project_id = s.project_id;
  SELECT contract_id INTO locked
  FROM public.contracts
  WHERE order_id = p.order_id
  FOR UPDATE;
  SELECT * INTO p
  FROM public.projects
  WHERE project_id = s.project_id
  FOR UPDATE;
  IF public.worksync_order_on_hold(p.order_id) THEN
    RAISE EXCEPTION 'Delivery decisions are paused pending resolution';
  END IF;
  SELECT * INTO s
  FROM public.project_submissions
  WHERE submission_id = p_submission
  FOR UPDATE;

  admin_dispute_review :=
    p_action = 'approve'
    AND public.worksync_is_admin()
    AND EXISTS (
      SELECT 1
      FROM public.worksync_workflow_write_context x
      WHERE x.backend_pid = pg_backend_pid()
        AND x.transaction_id = txid_current()
        AND x.object_id = p_submission
        AND x.purpose = 'admin_dispute_review'
    )
    AND EXISTS (
      SELECT 1
      FROM public.project_disputes d
      WHERE d.project_id = s.project_id
        AND d.status = 'resolved'
        AND d.reviewed_by = auth.uid()
        AND d.resolution_action IN ('complete_project', 'complete_milestone')
    );

  IF (
       public.worksync_project_party(s.project_id) IS DISTINCT FROM 'client'
       AND NOT admin_dispute_review
     )
     OR p.status::text NOT IN ('active', 'in_progress', 'revision')
     OR s.kind <> 'delivery'
     OR s.status <> 'submitted' THEN
    RAISE EXCEPTION 'Delivery cannot be reviewed';
  END IF;
  IF s.milestone_id IS NULL
     AND EXISTS (SELECT 1 FROM public.milestones WHERE project_id = s.project_id) THEN
    RAISE EXCEPTION 'Choose a milestone for this delivery';
  END IF;
  IF s.milestone_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.milestones
       WHERE milestone_id = s.milestone_id
         AND project_id = s.project_id
         AND status::text NOT IN ('approved', 'completed')
     ) THEN
    RAISE EXCEPTION 'Milestone unavailable or already approved';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.project_submissions newer
    WHERE newer.project_id = s.project_id
      AND newer.milestone_id IS NOT DISTINCT FROM s.milestone_id
      AND newer.kind = 'delivery'
      AND newer.created_at > s.created_at
  ) THEN
    RAISE EXCEPTION 'Review the latest delivery';
  END IF;

  IF p_action = 'revision' THEN
    IF length(p_instructions) > 5000 OR coalesce(length(btrim(p_instructions)), 0) = 0 THEN
      RAISE EXCEPTION 'Valid revision instructions are required';
    END IF;
    SELECT revisions_count INTO revision_limit
    FROM public.contracts
    WHERE order_id = p.order_id;
    SELECT count(*) INTO used
    FROM public.revision_requests
    WHERE project_id = s.project_id;
    IF revision_limit IS NULL OR used >= revision_limit THEN
      RAISE EXCEPTION 'The agreed revision limit has been reached or is not set';
    END IF;
    INSERT INTO public.revision_requests(project_id, submission_id, requested_by, instructions, status)
    VALUES (s.project_id, p_submission, auth.uid(), p_instructions, 'open');
  ELSIF p_action <> 'approve' THEN
    RAISE EXCEPTION 'Invalid review action';
  END IF;

  INSERT INTO public.worksync_workflow_write_context
  VALUES (pg_backend_pid(), txid_current(), p_submission, 'submission_review');
  UPDATE public.project_submissions
  SET status = CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'revision_requested' END,
      reviewed_at = now()
  WHERE submission_id = p_submission;
  DELETE FROM public.worksync_workflow_write_context
  WHERE backend_pid = pg_backend_pid()
    AND transaction_id = txid_current()
    AND object_id = p_submission
    AND purpose = 'submission_review';

  IF s.milestone_id IS NOT NULL THEN
    UPDATE public.milestones
    SET status = CASE WHEN p_action = 'approve' THEN 'approved'::public.milestone_status
                      ELSE 'revision_requested'::public.milestone_status END
    WHERE milestone_id = s.milestone_id
      AND project_id = s.project_id;
  END IF;
  IF p_action = 'revision' THEN
    UPDATE public.projects
    SET status = 'revision', updated_at = now()
    WHERE project_id = p.project_id;
  END IF;
  IF p_action = 'approve'
     AND (
       s.milestone_id IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.milestones
         WHERE project_id = s.project_id
           AND status::text NOT IN ('approved', 'completed')
       )
     ) THEN
    UPDATE public.projects
    SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE project_id = s.project_id;
    UPDATE public.service_orders
    SET status = 'completed', updated_at = now()
    WHERE order_id = p.order_id;
    UPDATE public.contracts
    SET status = 'completed', updated_at = now()
    WHERE order_id = p.order_id;
  END IF;

  SELECT user_id INTO recipient
  FROM public.freelancer_profiles
  WHERE freelancer_id = p.freelancer_id;
  INSERT INTO public.notifications(user_id, type, title, message, related_id, is_read)
  VALUES (
    recipient,
    'project_update',
    CASE WHEN p_action = 'approve' THEN 'Delivery approved' ELSE 'Revision requested' END,
    'Open the project workspace for details.',
    p.order_id,
    false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.worksync_resolve_dispute(
  p_id uuid,
  p_action text,
  p_notes text DEFAULT ''::text
)
RETURNS public.project_disputes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  r public.project_disputes;
  p public.projects;
  m public.milestones;
  s public.project_submissions;
  v_admin uuid := auth.uid();
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_notes text := coalesce(p_notes, '');
  v_freelancer_user uuid;
BEGIN
  IF NOT public.worksync_is_admin() THEN
    RAISE EXCEPTION 'Only admins may resolve disputes' USING errcode = '42501';
  END IF;
  IF v_action NOT IN (
       'under_review', 'resume_work', 'cancel_project',
       'complete_project', 'complete_milestone'
     )
     OR length(btrim(v_notes)) NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'Invalid dispute resolution action or notes' USING errcode = '22023';
  END IF;

  SELECT * INTO r
  FROM public.project_disputes
  WHERE dispute_id = p_id;
  IF r.dispute_id IS NULL THEN
    RAISE EXCEPTION 'Dispute not found' USING errcode = 'P0002';
  END IF;
  PERFORM public.worksync_lock_project_money(r.project_id);
  SELECT * INTO p
  FROM public.projects
  WHERE project_id = r.project_id
  FOR UPDATE;
  IF p.project_id IS NULL THEN
    RAISE EXCEPTION 'Project not found' USING errcode = 'P0002';
  END IF;
  SELECT * INTO r
  FROM public.project_disputes
  WHERE dispute_id = p_id
  FOR UPDATE;
  IF r.dispute_id IS NULL OR r.status = 'resolved' THEN
    RAISE EXCEPTION 'Dispute is missing or already resolved' USING errcode = '22023';
  END IF;

  IF v_action = 'complete_milestone' AND r.milestone_id IS NULL THEN
    RAISE EXCEPTION 'This dispute does not identify an affected milestone' USING errcode = '22023';
  END IF;
  IF v_action = 'complete_project'
     AND r.milestone_id IS NOT NULL THEN
    RAISE EXCEPTION 'Use Complete affected milestone for a milestone-specific dispute' USING errcode = '22023';
  END IF;
  IF v_action IN ('complete_project', 'complete_milestone') THEN
    IF p.status::text NOT IN ('active', 'in_progress', 'revision') THEN
      RAISE EXCEPTION 'Only active project deliveries can be completed' USING errcode = '22023';
    END IF;
    SELECT user_id INTO v_freelancer_user
    FROM public.freelancer_profiles
    WHERE freelancer_id = p.freelancer_id;
    IF v_freelancer_user IS NULL THEN
      RAISE EXCEPTION 'Freelancer account is unavailable for delivery review' USING errcode = '22023';
    END IF;
  END IF;

  UPDATE public.project_disputes
  SET status = CASE WHEN v_action = 'under_review' THEN 'under_review' ELSE 'resolved' END,
      resolution = CASE WHEN v_action = 'under_review' THEN NULL ELSE v_notes END,
      resolution_action = CASE WHEN v_action = 'under_review' THEN NULL ELSE v_action END,
      admin_notes = v_notes,
      reviewed_by = v_admin,
      resolved_at = CASE WHEN v_action = 'under_review' THEN NULL ELSE now() END
  WHERE dispute_id = p_id
  RETURNING * INTO r;

  IF v_action = 'resume_work' THEN
    UPDATE public.projects
    SET status = 'active', updated_at = now()
    WHERE project_id = r.project_id
      AND status::text NOT IN ('completed', 'cancelled');
  ELSIF v_action = 'cancel_project' THEN
    UPDATE public.projects
    SET status = 'cancelled', updated_at = now()
    WHERE project_id = r.project_id
      AND status::text NOT IN ('completed', 'cancelled');
  ELSIF v_action = 'complete_milestone' THEN
    SELECT * INTO m
    FROM public.milestones
    WHERE milestone_id = r.milestone_id
      AND project_id = r.project_id
    FOR UPDATE;
    IF m.milestone_id IS NULL THEN
      RAISE EXCEPTION 'Affected milestone was not found in this project' USING errcode = 'P0002';
    END IF;
    SELECT * INTO s
    FROM public.project_submissions
    WHERE project_id = r.project_id
      AND milestone_id = r.milestone_id
      AND kind = 'delivery'
    ORDER BY created_at DESC, submission_id DESC
    LIMIT 1
    FOR UPDATE;
    IF s.submission_id IS NULL
       OR s.status <> 'submitted'
       OR s.author_id IS DISTINCT FROM v_freelancer_user THEN
      RAISE EXCEPTION 'The affected milestone needs a latest delivery submitted by its freelancer' USING errcode = '22023';
    END IF;
    INSERT INTO public.worksync_workflow_write_context
    VALUES (pg_backend_pid(), txid_current(), s.submission_id, 'admin_dispute_review');
    PERFORM public.worksync_review_submission(s.submission_id, 'approve'::text, v_notes);
    DELETE FROM public.worksync_workflow_write_context
    WHERE backend_pid = pg_backend_pid()
      AND transaction_id = txid_current()
      AND object_id = s.submission_id
      AND purpose = 'admin_dispute_review';
    IF NOT public.worksync_delivery_approved(r.project_id, r.milestone_id) THEN
      RAISE EXCEPTION 'The affected milestone delivery did not pass approval checks' USING errcode = '22023';
    END IF;
  ELSIF v_action = 'complete_project' THEN
    IF EXISTS (SELECT 1 FROM public.milestones WHERE project_id = r.project_id) THEN
      FOR m IN
        SELECT *
        FROM public.milestones
        WHERE project_id = r.project_id
        ORDER BY display_order, milestone_id
        FOR UPDATE
      LOOP
        SELECT * INTO s
        FROM public.project_submissions
        WHERE project_id = r.project_id
          AND milestone_id = m.milestone_id
          AND kind = 'delivery'
        ORDER BY created_at DESC, submission_id DESC
        LIMIT 1
        FOR UPDATE;
        IF s.submission_id IS NULL THEN
          RAISE EXCEPTION 'Every milestone needs a submitted delivery before the project can be completed' USING errcode = '22023';
        END IF;
        IF s.status = 'approved' AND m.status::text IN ('approved', 'completed') THEN
          CONTINUE;
        END IF;
        IF s.status <> 'submitted'
           OR s.author_id IS DISTINCT FROM v_freelancer_user
           OR m.status::text IN ('approved', 'completed') THEN
          RAISE EXCEPTION 'Every milestone must have its latest delivery approved or awaiting review' USING errcode = '22023';
        END IF;
        INSERT INTO public.worksync_workflow_write_context
        VALUES (pg_backend_pid(), txid_current(), s.submission_id, 'admin_dispute_review');
        PERFORM public.worksync_review_submission(s.submission_id, 'approve'::text, v_notes);
        DELETE FROM public.worksync_workflow_write_context
        WHERE backend_pid = pg_backend_pid()
          AND transaction_id = txid_current()
          AND object_id = s.submission_id
          AND purpose = 'admin_dispute_review';
      END LOOP;
      IF EXISTS (
        SELECT 1
        FROM public.milestones
        WHERE project_id = r.project_id
          AND status::text NOT IN ('approved', 'completed')
      ) THEN
        RAISE EXCEPTION 'All milestone deliveries must be approved before completing the project' USING errcode = '22023';
      END IF;
      IF NOT public.worksync_payout_work_approved(r.project_id) THEN
        RAISE EXCEPTION 'The project does not meet the normal approved-delivery checks' USING errcode = '22023';
      END IF;
      UPDATE public.projects
      SET status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now()
      WHERE project_id = r.project_id;
      UPDATE public.service_orders
      SET status = 'completed', updated_at = now()
      WHERE order_id = p.order_id;
      UPDATE public.contracts
      SET status = 'completed', updated_at = now()
      WHERE order_id = p.order_id;
    ELSE
      SELECT * INTO s
      FROM public.project_submissions
      WHERE project_id = r.project_id
        AND milestone_id IS NULL
        AND kind = 'delivery'
      ORDER BY created_at DESC, submission_id DESC
      LIMIT 1
      FOR UPDATE;
      IF s.submission_id IS NULL
         OR s.status <> 'submitted'
         OR s.author_id IS DISTINCT FROM v_freelancer_user THEN
        RAISE EXCEPTION 'The project needs a latest delivery submitted by its freelancer' USING errcode = '22023';
      END IF;
      INSERT INTO public.worksync_workflow_write_context
      VALUES (pg_backend_pid(), txid_current(), s.submission_id, 'admin_dispute_review');
      PERFORM public.worksync_review_submission(s.submission_id, 'approve'::text, v_notes);
      DELETE FROM public.worksync_workflow_write_context
      WHERE backend_pid = pg_backend_pid()
        AND transaction_id = txid_current()
        AND object_id = s.submission_id
        AND purpose = 'admin_dispute_review';
      IF NOT public.worksync_delivery_approved(r.project_id, NULL) THEN
        RAISE EXCEPTION 'The project delivery did not pass approval checks' USING errcode = '22023';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.admin_audit_log(admin_id, action, target_id, details)
  VALUES (
    v_admin,
    'resolve_dispute',
    p_id,
    jsonb_build_object(
      'action', v_action,
      'notes', v_notes,
      'resolution', CASE WHEN v_action = 'under_review' THEN NULL ELSE v_notes END,
      'project_id', r.project_id,
      'milestone_id', r.milestone_id
    )
  );
  RETURN r;
END;
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
