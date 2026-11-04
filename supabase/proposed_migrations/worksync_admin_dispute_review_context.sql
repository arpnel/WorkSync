-- APPLIED TO PRODUCTION as 20261104022008_worksync_admin_dispute_review_context.
-- Preserve existing workflow markers and allow the scoped admin delivery
-- approval marker used by worksync_resolve_dispute.

BEGIN;

ALTER TABLE public.worksync_workflow_write_context
  DROP CONSTRAINT worksync_workflow_write_context_purpose_check;

ALTER TABLE public.worksync_workflow_write_context
  ADD CONSTRAINT worksync_workflow_write_context_purpose_check
  CHECK (
    purpose IN (
      'contract_version',
      'task_submission',
      'submission_review',
      'activation',
      'service_response',
      'contract_cancel',
      'admin_dispute_review'
    )
  );

COMMIT;
