# Live database check

Read-only API schema and storage inspection, 2026-09-18. No remote mutations performed.

All directly called WorkSync functions were present. 18 functions have incompatible inputs. The legacy Apply fallback is excluded because the primary Apply call matches.

| Function | App sends | Live database accepts |
| --- | --- | --- |
| `worksync_list_disputes` | `p_search`, `p_offset` | `p_project_id: uuid` (optional) |
| `worksync_admin_records` | `p_module`, `p_search`, `p_offset` | `p_limit: integer` (optional), `p_offset: integer` (optional), `p_record_type: text` (optional), `p_status: text` (optional) |
| `worksync_moderate_account` | `p_user`, `p_status`, `p_reason`, `p_expires` | `p_expires_at: timestamp with time zone` (optional), `p_reason: text`, `p_status: text`, `p_user_id: uuid` |
| `worksync_resolve_dispute` | `p_id`, `p_action`, `p_notes` | `p_admin_notes: text` (optional), `p_dispute_id: uuid`, `p_resolution: text`, `p_resolution_action: text` |
| `worksync_admin_action` | `p_module`, `p_id`, `p_action`, `p_notes` | `p_action: text`, `p_details: jsonb` (optional), `p_target_id: uuid` |
| `worksync_report_listing` | `p_kind`, `p_listing`, `p_reason`, `p_description` | `p_description: text` (optional), `p_listing_id: uuid`, `p_listing_type: text`, `p_reason: text` |
| `worksync_submit_work` | `p_id`, `p_project`, `p_milestone`, `p_body`, `p_link`, `p_kind`, `p_path`, `p_name` | `p_attachment_name: text` (optional), `p_attachment_path: text` (optional), `p_body: text` (optional), `p_kind: text` (optional), `p_link: text` (optional), `p_milestone_id: uuid` (optional), `p_project_id: uuid` |
| `worksync_review_submission` | `p_submission`, `p_action`, `p_instructions` | `p_approve: boolean`, `p_instructions: text` (optional), `p_submission_id: uuid` |
| `worksync_leave_review` | `p_project`, `p_rating`, `p_comment` | `p_comment: text` (optional), `p_project_id: uuid`, `p_rating: smallint` |
| `worksync_request_cancellation` | `p_order`, `p_reason` | `p_order_id: uuid`, `p_reason: text` |
| `worksync_respond_cancellation` | `p_id`, `p_accept`, `p_response` | `p_accept: boolean`, `p_cancellation_id: uuid`, `p_response: text` (optional) |
| `worksync_open_dispute` | `p_id`, `p_project`, `p_milestone`, `p_category`, `p_description`, `p_path`, `p_name` | `p_category: text`, `p_description: text`, `p_evidence_name: text` (optional), `p_evidence_path: text` (optional), `p_milestone_id: uuid`, `p_project_id: uuid` |
| `worksync_admin_analytics` | `p_from`, `p_to`, `p_status` | `p_from: timestamp with time zone` (optional), `p_to: timestamp with time zone` (optional) |
| `worksync_dispute_context` | `p_id` | `p_dispute_id: uuid` |
| `worksync_remove_milestone` | `p_milestone` | `p_milestone_id: uuid` |
| `worksync_add_milestone` | `p_order`, `p_title`, `p_description`, `p_amount`, `p_due` | `p_amount: numeric` (optional), `p_description: text` (optional), `p_display_order: integer` (optional), `p_due_date: date` (optional), `p_project_id: uuid`, `p_title: text` |
| `worksync_save_meeting` | `p_id`, `p_project`, `p_title`, `p_start`, `p_end`, `p_link`, `p_cancel` | `p_ends_at: timestamp with time zone`, `p_link: text` (optional), `p_meeting_id: uuid` (optional), `p_project_id: uuid`, `p_starts_at: timestamp with time zone`, `p_status: text` (optional), `p_title: text` |
| `worksync_save_planner` | `p_state`, `p_revision` | `p_state: jsonb` |

Other findings:

- Payment readiness GET returned 403 / 42501: permission denied for function worksync_payment_storage_ready, using the configured server credential.
- project-attachments and message-attachments exist and are private.
- verification-documents is absent; verification exists and is private. This is a legacy upload/admin-policy path issue, not required by current Didit app_metadata storage.
- The exposed worksync_activate_contract and worksync_guard_contract functions each take p_contract_id uuid. Their presence does not prove a contract UPDATE trigger is installed.
- Inspected project, contract, submission, cancellation, dispute, planner, meeting, saved-listing and payment columns are present. Constraints, authenticated participant access, function bodies, triggers, and realtime publication were not verified through the API schema.
- Parameter renaming alone is insufficient for milestones (order versus project ID), submissions/disputes (caller IDs omitted), planner concurrency (revision omitted), and admin response shapes. Reconcile implementations and return types before changing callers.
