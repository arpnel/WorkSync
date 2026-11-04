-- PREPARED, NOT APPLIED.
-- Add a read-only contract overview to the existing dispute-context response.
-- This replaces the deployed function body while preserving its signature,
-- security mode, search_path, and admin/project-party authorization check.

CREATE OR REPLACE FUNCTION public.worksync_dispute_context(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  d public.project_disputes;
  allowed boolean;
BEGIN
  SELECT * INTO d
  FROM public.project_disputes
  WHERE dispute_id = p_id;

  IF d.dispute_id IS NULL THEN
    RAISE EXCEPTION 'Dispute not found' USING errcode = 'P0002';
  END IF;

  allowed := public.worksync_is_admin()
             OR public.worksync_project_party(d.project_id) IS NOT NULL;
  IF NOT allowed THEN
    RAISE EXCEPTION 'Only project participants or admins may view dispute context'
      USING errcode = '42501';
  END IF;

  RETURN jsonb_build_object(
    'dispute', to_jsonb(d),
    'project', (
      SELECT to_jsonb(p)
      FROM public.projects p
      WHERE p.project_id = d.project_id
    ),
    'contract', (
      SELECT jsonb_build_object(
        'final_price', c.final_price,
        'delivery_time_days', c.delivery_time_days,
        'revisions_count', c.revisions_count,
        'terms', c.terms,
        'status', c.status
      )
      FROM public.projects p
      JOIN public.contracts c
        ON (p.order_id IS NOT NULL AND c.order_id = p.order_id)
        OR (p.application_id IS NOT NULL AND c.application_id = p.application_id)
      WHERE p.project_id = d.project_id
      ORDER BY
        CASE
          WHEN p.order_id IS NOT NULL AND c.order_id = p.order_id THEN 0
          ELSE 1
        END,
        c.created_at,
        c.contract_id
      LIMIT 1
    ),
    'milestone', (
      SELECT to_jsonb(m)
      FROM public.milestones m
      WHERE m.milestone_id = d.milestone_id
    ),
    'submissions', (
      SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.created_at), '[]'::jsonb)
      FROM public.project_submissions s
      WHERE s.project_id = d.project_id
        AND (d.milestone_id IS NULL OR s.milestone_id = d.milestone_id)
    )
  );
END;
$function$;
