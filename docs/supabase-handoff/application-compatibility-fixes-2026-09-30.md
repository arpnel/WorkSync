# Application database compatibility fixes — 2026-09-30

## Fixed in Code

- `services/project/projectDeliveryService.ts`: review calls now send `p_submission_id`, `p_approve`, and trimmed `p_instructions`. Approve maps to true; revision maps to false and still requires instructions.
- `services/project/projectMeetingService.ts` and `components/project/ProjectMeetings.tsx`: create/edit/cancel use the seven live argument names. New and edited meetings use `scheduled`. Cancellation uses the existing `cancelled` status and passes the selected row's ID, title, dates, and link, rather than empty or unrelated edit-form fields. These statuses already occur in the existing UI/schedule SQL; live body checks and user write tests remain outstanding.
- `components/admin/AdminRecords.tsx`: private verification attachment links now use `verification` with the existing 60-second signed-URL flow. Paths are passed through unchanged; no public URL or bucket mutation was introduced. Confirm legacy request paths resolve in that bucket and that admin SELECT policies allow them.
- `services/admin/adminResponses.ts`, `services/admin/adminService.ts`, `components/admin/AdminAnalytics.tsx`, `components/admin/AdminRecords.tsx`, and `components/admin/DisputeContext.tsx`: runtime schemas guard records, analytics, and dispute context. Malformed required arrays, nested rows, missing metrics, nonnumeric metrics, and non-finite values surface errors instead of rendering fabricated zero/empty data. Legitimate null metrics remain supported. Failed reads clear stale data; dispute failures stop the loading skeleton and allow retry. RPC error code/message are preserved. Records/analytics RPC argument names remain unchanged. Records/analytics guards originated in the immediately preceding admin-crash work and are included in this validation.
- `components/marketplace/MarketplaceCard.tsx`: the verification badge now checks the existing `approved` freelancer enum value instead of the impossible `verified` value.
- `components/profile/DocumentsEditor.tsx`: a post-save refresh callback failure no longer enters upload rollback and deletes committed document files. A separate message explains that documents saved but the profile did not refresh. Failed database persistence still attempts upload cleanup.

No Supabase schema, policies, triggers, functions, buckets, migrations, environment settings, or external-service configuration were changed.

## Tests

- `pnpm.cmd typecheck`: passed.
- Targeted ESLint on modified TS/TSX/test files: passed.
- `node --test tests/database-components.test.cjs tests/database-compatibility.test.cjs tests/admin-responses.test.cjs tests/project-delivery.test.cjs tests/didit-account-setup.test.cjs tests/platform-workflows.test.cjs`: **43 passed**.
- `node --test tests/*.test.cjs`: **149 passed, 7 failed** (156 total). All seven failures were reproduced against HEAD versions of changed tracked application files using a temporary read-only test-source override; the workspace was not reverted. Failures are in existing test harnesses: marketplace alias resolution (`@/lib/pageReadCache`), three messaging history cache mocks, calendar `readProjectCache`, and two portfolio cache mocks. No unrelated production modules or tests were rewritten to conceal them.
- New coverage exercises approval/revision RPC payloads and blank-revision validation, meeting payloads and cancellation from the selected row, admin signature preservation and database errors, malformed admin/dispute/numeric responses, and document refresh-versus-persistence cleanup behavior.
- Repeated source searches found no old review/meeting argument contract at active application call sites, no active `verification-documents` reference, and no remaining application comparison/write of freelancer verification status to `verified`. Historical SQL/docs still contain old definitions and were deliberately not changed.
- `git diff --check`: passed. Browser interactions, authenticated live writes, and production build/deployment were not verified in this task.

## Requires Supabase Work

| Object / workflow | What must be checked and why source alone cannot prove it | Relevant application code |
| --- | --- | --- |
| `worksync_admin_records`, `worksync_admin_analytics` | Obtain deployed definitions, actual failing admin response JSON, and JSON result shapes. Parameters match the audited live schema, but OpenAPI provides neither function bodies nor JSON object contracts. | `services/admin/adminService.ts`, `services/admin/adminResponses.ts` |
| `worksync_dispute_context` | Verify returned project/contract/dispute objects and parties/milestones/submissions/revisions/messages arrays, plus administrator authorization/audit behavior. Malformed data now produces a recoverable error. | `components/admin/DisputeContext.tsx`, `services/admin/adminResponses.ts` |
| `worksync_review_submission`, `worksync_save_meeting` | Verify the deployed implementation/grants, approve-versus-revise effects, cancellation status constraints, handling of past meeting dates, and participant authorization. Correct argument names do not prove these semantics. No write RPC was executed. | `services/project/projectDeliveryService.ts`, `services/project/projectMeetingService.ts` |
| `storage.objects` policies for private `verification`; `verification_requests.document_paths` | Confirm admin read access and that existing request paths refer to objects in `verification`. The old reference pointed to an absent bucket; source cannot prove old objects/path provenance or policy conditions. If they reside elsewhere, determine the mapping before migrating or rewriting paths. | `components/admin/AdminRecords.tsx` |
| `verification_requests`, `freelancer_profiles.verification_status`, auth-user triggers | Determine whether an existing trigger already synchronizes `worksync_didit`; inspect provider/session uniqueness, allowed request statuses, required `document_paths`, manual-document guards, admin overrides, and grants. Otherwise app writes could duplicate synchronization or fail manual-request constraints. Keep existing metadata adapter until this is established. Valid freelancer status values remain `pending`, `approved`, `rejected`. | `services/verification/verificationServer.ts`, `app/api/webhooks/didit/route.ts` |
| `freelancer_profiles.freelancer_id` | Account-setup insert sends user/professional/document fields but no freelancer ID. Existing profile updates use the looked-up ID. Audit metadata advertises no ID default; verify BEFORE INSERT trigger population before changing creation behavior. | `components/accountsetup/service/accountSetup.service.ts` |
| `client_profiles.client_id` | Dashboard creation inserts only `user_id` and assumes an ID default/trigger. Separate client onboarding explicitly generates an ID. Audit metadata advertises no default; inspect trigger behavior first. | `services/marketplace/AccountServices.ts`, `components/layout/dashboard-header.tsx` |
| `portfolio_images.created_at` | Insert supplies `portfolio_id`, `image_url`, and `display_order`; it omits required `created_at`, which has no advertised default. A trigger could populate it, so no speculative timestamp write was added. | `components/profile/PortfolioEditor.tsx` |
| `saved_services`, role profiles, `contract_item_approvals` | Confirm unique indexes needed for `(user_id,service_id)` upserts, one role profile per user, and `(contract_id,item_key)` approvals. The table inventory/API schema does not establish these constraints. | `services/marketplace/listingActions.ts`, `services/profile/profileservice.ts`, `services/project/projectWorkspaceService.ts` |
| Payout/settlement dependencies | Prior live audit found missing payout tables, settlement columns, and settlement RPC exposure. Reconcile the prepared migration with live functions/constraints and review separately before deployment; this task expressly prohibits database changes. | `services/payments/settlementServer.ts`, `services/payments/paymentServer.ts`, `app/api/payout-account/route.ts` |
| Manual verification approval function | Local historical SQL writes `verification_status='verified'`, incompatible with the enum. Inspect the actual deployed body before correcting it; old migration definitions cannot be assumed to be live. | `services/admin/adminService.ts` invokes `worksync_admin_action` |

The existing `database-runtime-readonly-audit.sql` and `rls-readonly-audit.sql` provide the metadata queries for these checks; neither was modified or run against Supabase in this task.

### Multi-request write audit

| Workflow | Partial-save boundary and current handling | Follow-up |
| --- | --- | --- |
| Account setup | Avatar upload → shared profile → role profile → category/skill inserts/deletes → Users.role → completion flag. Completion is correctly last and failures are checked, but earlier writes/uploads persist if a later step fails. | Transactional relational persistence for profiles/relationships/role/completion; storage needs separate cleanup/retry design. `components/accountsetup/service/accountSetup.service.ts`. |
| Profile editing | Shared profile update → freelancer update → category/skill reconciliation → reload. Later failures leave earlier writes committed. | Transactional profile/relationship RPC with existing authorization. `services/profile/profileservice.ts`. |
| Supporting documents | Uploads precede a single profile UPDATE. Failed persistence removes new uploads best-effort. Refresh errors previously also removed committed uploads; fixed here. Removed/replaced historical objects are not deleted. | Verify storage cleanup policies and plan orphan handling without deleting shared/referenced objects. `components/profile/DocumentsEditor.tsx`. |
| Portfolio | Portfolio row → image upload → image row → thumbnail update. `savedId` avoids recreating the portfolio on retry, but image failures can orphan uploads/image rows. | Transactional image-record/thumbnail association and a storage cleanup/retry strategy. `components/profile/PortfolioEditor.tsx`. |
| Service creation | Service row → skills → uploads/media rows → cover → milestone templates. Catch block attempts compensating deletes; several cleanup errors are ignored, so rollback is not guaranteed. | Atomic relational service creation and observable storage cleanup. `services/serviceP/serviceService.ts`. |
| Job creation | Job row → job skills. Failure attempts job deletion without checking that cleanup succeeded. | Atomic job/skills creation; avoid treating best-effort deletes as transactions. `services/serviceP/serviceService.ts`. |
| Dashboard role switching | Create client profile → update Users.role. Role-update failure leaves the newly created profile. | Verify whether this resumable state is intended; otherwise atomic create/activate operation. `services/marketplace/AccountServices.ts`. |
| Contracts and approvals | Lookup → possible contract insert; item approval lookup → insert/update. Unique constraints must protect races. Term updates expect a database trigger to reset signatures/approvals and signing expects activation logic. | Verify constraints and deployed reset/activation/guard triggers; do not emulate them with additional browser writes. `services/project/projectWorkspaceService.ts`. |
| Project messages | Optional conversation insert → attachment upload/sign → message insert. Cleanup attempts attachment deletion on message failure; membership/conversation provisioning depends on policies/triggers. | Verify unique order-conversation mapping and participant provisioning; keep storage compensation outside transactional row persistence. `services/project/projectWorkspaceService.ts`. |

These architectural follow-ups were identified, not implemented as speculative client rollback or replacement SQL.

### Didit flow audit

1. `verificationService.ts` gets the signed-in session and calls `/api/verify` with its bearer token.
2. POST `/api/verify` validates the user server-side. `startVerification` reloads admin-controlled metadata, retrieves an existing decision where applicable, or creates a Didit session using the fixed workflow and authenticated user as `vendor_data`. It stores session state in `auth.users.app_metadata.worksync_didit`.
3. GET retrieves the provider decision and checks session/workflow/vendor identity. A poll alone cannot grant verification; returned approval requires the persisted webhook-approved flag and an approved ID document.
4. `/api/webhooks/didit` verifies the V2 HMAC and timestamp, acknowledges authenticated test/irrelevant events, validates `status.updated`, and calls `applyVerificationEvent`.
5. The handler ignores duplicate, stale, or mismatched events, fetches the authoritative provider decision, rechecks current session state, excludes sandbox approval, and stores result/event marker together in app_metadata. Locks are process-local, not cross-instance database transactions.
6. No application code writes `verification_requests` or `freelancer_profiles.verification_status` from this flow. Admin verification uses `worksync_admin_records` with module `verification`; the local reference implementation reads `verification_requests`. The deployed body's exact source is still unverified. No table synchronization was added because auth triggers, table guards, and session uniqueness remain unknown.

## Requires Environment / External Service Work

- Verify deployed `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET`, the configured workflow, and Didit delivery of signed `status.updated` events to `/api/webhooks/didit`. Check delivery/retry logs and production-versus-sandbox mode; local unit tests do not establish dashboard configuration.
- Verify `APP_URL` makes the intended `/verify/done` callback and that the deployed server has its existing Supabase server credential. No values were printed, changed, or regenerated.
- PayMongo checkout/webhook/payout configuration and settlement cron/environment activation remain separate from this code patch and were not changed or reverified. Missing database dependencies must be resolved before enabling automatic settlement.

## Remaining Runtime Diagnostics

- Admin HTTP 400: need the failing request's `code`, `message`, `details`, and `hint`, plus the deployed function definition/result contract if the response is insufficient. Do not share request authorization headers or tokens.
- Need real admin document access and authenticated client/freelancer create/edit/cancel/review tests after deployment. Current evidence is local checks and the preceding read-only schema audit, not verified production writes.
- Existing test harness failures remain visible in the broader suite; they are not evidence that the corrected RPC writes were exercised live.
