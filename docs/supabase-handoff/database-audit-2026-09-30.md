# Database compatibility audit — 2026-09-30

Follow-up: application fixes and remaining database checks are documented in [application-compatibility-fixes-2026-09-30.md](application-compatibility-fixes-2026-09-30.md). Findings below preserve the pre-fix audit snapshot.

Read-only comparison of the supplied 49-table inventory, current application source, and live Supabase REST/OpenAPI and bucket metadata for project `gxnynnhdjlgzybuwmpnq`. No database records, functions, policies, buckets, credentials, or environment settings were changed. Application fixes from the preceding admin-crash task remain separate from this audit.

## Scope and evidence

- Scanned 353 TypeScript/TSX files under app, components, hooks, lib, and services: 270 `.from(...)` call sites, including storage. Also checked constants/types for database calls. Reviewed dynamic table names, update payloads, the project-work request schema, and admin read dispatch separately.
- Compared application RPC argument names with the currently exposed live signatures. This supersedes the **signature findings** in the September 18 audit; most of its 18 mismatches have since been reconciled.
- All 49 supplied tables and their listed columns appear in the live API schema. Live schema exposes 50 tables, including `integration_webhook_events`.
- **118 distinct SELECT shapes passed live `limit=0` checks**, including embedded project/order/contract queries. These validate names, relationships, and access using the configured server credential; they do not prove authenticated-user RLS, row cardinality, or write behavior.
- Payment readiness RPC returned HTTP 200 and `true` using the server credential. This does not establish checkout, webhook, refund, or payout behavior.
- Admin read probes reached the functions but returned HTTP 403 / `42501`, `Administrator access required`: the server credential has no signed-in admin identity. This is not the user's HTTP 400 reproduction and does not establish an admin-account permission defect.
- No write RPCs were executed, no users were impersonated, and no business rows or credentials were printed. Evidence is summarized in `database-audit-2026-09-30-evidence.json`.

## Confirmed mismatches

| Priority | Finding | Evidence and impact |
| --- | --- | --- |
| High | Delivery approval/revision RPC arguments do not match | `services/project/projectDeliveryService.ts:125` sends `p_submission`, `p_action`, `p_instructions`. Live `worksync_review_submission` accepts `p_submission_id`, `p_approve` (boolean), `p_instructions`. The current call cannot resolve this signature. Map approval/revision semantics as well as names; inspect the live body before replacing it with local SQL. |
| High | Meeting create/edit/cancel RPC arguments do not match | `components/project/ProjectMeetings.tsx:82` sends `p_id`, `p_project`, `p_start`, `p_end`, `p_cancel`, `p_title`, `p_link`. Live `worksync_save_meeting` accepts `p_meeting_id`, `p_project_id`, `p_starts_at`, `p_ends_at`, `p_status`, `p_title`, `p_link`. Cancellation sends null dates and a boolean, whereas the live contract uses status and requires start/end arguments. Verify cancellation semantics before adapting. |
| High for automatic payout | Payout tables are unavailable | `freelancer_payout_accounts` and `project_payouts` are absent from the live API schema; direct zero-row reads returned HTTP 404 / `PGRST205`. Used by `app/api/payout-account/route.ts:21`, `services/payments/paymentServer.ts:182`, and `services/payments/settlementServer.ts:105`. Payout-account operations cannot work against this exposed schema. Payment status handles a failed payout lookup as `unavailable`. |
| High for automatic payout | Settlement columns are missing | `payments.settlement_checked_at` and `project_submissions.auto_reviewed_at` each returned HTTP 400 / `42703`, column does not exist. The worker sorts and updates the first (`services/payments/settlementServer.ts:76`, `:100`). The second is written by the prepared settlement SQL; normal delivery-history reads use `*` and treat this field as optional. |
| High for automatic payout | Settlement RPCs are not exposed | `worksync_settle_project` and `worksync_claim_payout` do not appear in the live API schema available to the server credential. Called at `services/payments/settlementServer.ts:88` and `:137`. These tables, columns, and functions belong to `supabase/migrations/202609270001_project_settlement.sql`, explicitly marked **PREPARED, NOT APPLIED**. The cron is gated by `PROJECT_SETTLEMENT_ENABLED`; enabling it alone cannot provide the missing dependencies. |
| Medium | Admin verification attachments use a nonexistent bucket | `components/admin/AdminRecords.tsx:240` opens `verification-documents`. Live storage contains private `verification`, but no `verification-documents`. Existing document paths and policies must be checked before choosing a replacement bucket. Normal profile documents already use `verification` and `resumes`. |

## Admin HTTP 400: still requires the actual database diagnostic

Live `worksync_admin_records` currently accepts exactly the app's `p_module`, `p_search`, and `p_offset`. Live `worksync_admin_analytics` also accepts `p_from`, `p_to`, and `p_status`. All tables/columns referenced by the local admin records query are present in the supplied/live table metadata.

Therefore, **the current evidence does not support saying the admin failure is caused by a missing base table or mismatched RPC parameter name**. A function-body error, incompatible returned JSON, deployed bundle difference, or another runtime condition remains possible. The API schema does not expose these functions' JSON response contracts or implementations. The previous `.map()` / `.toLocaleString()` crashes demonstrate the need for response validation, not the exact SQL error.

Obtain either the failing admin request's Response JSON (`code`, `message`, `details`, `hint`, without headers/tokens), or run the accompanying read-only SQL metadata audit in Supabase SQL Editor. Admin records must return `{rows: [...], total: number, stats?: {...}}`; analytics must return `counts`, nullable numeric metrics, `categories`, and `activity`. `components/admin/DisputeContext.tsx:43` still accepts unchecked RPC JSON and calls `.map()` on multiple arrays, so incompatible dispute-context results can still crash that separate detail panel.

## Required-field and constraint risks needing SQL metadata

The following omissions are confirmed in source and exposed schema, but their failure is **conditional on whether a BEFORE INSERT trigger supplies the missing values**. No inserts were attempted.

| Operation | App omission | Live metadata | Location |
| --- | --- | --- | --- |
| Create freelancer during account setup | `freelancer_id` | Required, no advertised default | `components/accountsetup/service/accountSetup.service.ts:254` |
| Create client via dashboard role switch | `client_id` | Required, no advertised default | `services/marketplace/AccountServices.ts:158`; invoked by `components/layout/dashboard-header.tsx:216` |
| Insert portfolio image | `created_at` | Required, no advertised default | `components/profile/PortfolioEditor.tsx:96` |

The separate client-onboarding path explicitly generates `client_id`, so it does not share that omission. If no trigger fills the omitted fields, the affected inserts will fail with a not-null violation.

Other required constraints cannot be proven from the supplied list or OpenAPI:

- Saving services uses `ON CONFLICT (user_id, service_id)` (`services/marketplace/listingActions.ts:38`). It needs a matching unique constraint/index, not just the supplied `saved_id` primary key. Its presence is unverified, not confirmed absent.
- Profile lookups assume at most one client/freelancer profile per user (`single`/`maybeSingle`); verify unique indexes on both profile tables' `user_id`.
- Agreement approvals assume uniqueness of `(contract_id, item_key)`. Project/workspace reads assume appropriate order/project/conversation cardinality.
- Multiple client-side profile/listing writes are separate requests. A later failure can leave earlier successful writes saved. Matching columns does not make those workflows atomic.

## Verification integration and migration drift

1. **Didit storage is not connected to the database verification queue in current application code.** `services/verification/verificationServer.ts:14` describes a temporary adapter, and `:70` saves results in `auth.users.app_metadata.worksync_didit`. It does not write `verification_requests` or `freelancer_profiles.verification_status`. Live `verification_requests` now has provider/session/status columns, but the adapter does not use them. New Didit results will not populate the table-based admin queue through this code alone; any database-side synchronization remains unverified.
2. **Local admin approval SQL has an enum mismatch.** `supabase/migrations/202609140003_admin_moderation.sql:83` assigns `verification_status='verified'`. The live enum accepts only `pending`, `approved`, and `rejected`. This local implementation would fail on approval; the deployed function body has not been retrieved, so this is not yet a confirmed deployed failure.
3. **Local migration history cannot be treated as a replay of production.** Live meeting/review RPC contracts differ from local definitions. The original core workflow also writes milestone status `completed`, which is absent from the live enum; later local September 19 migrations use `approved`. Do not deploy the old migration bundle indiscriminately.
4. Live `payments` has `provider`, `livemode`, `currency`, `provider_payment_id`, `paid_at`, and `updated_at`, absent from the pasted inventory. Current payment writes use the older columns and query PayMongo for payment time. That is not a missing-column failure, but code does not populate these extra integration fields directly. Database-trigger population is unverified.

## What currently aligns

- Tables/columns used by ordinary marketplace, profiles, messages, notifications, applications, contracts, project history, and planner reads passed the checked SELECT shapes.
- Primary apply-for-job arguments match. Its legacy fallback has intentionally old arguments and is incompatible with this deployment, but is only attempted after a primary `PGRST202`; it is not a current primary-path mismatch.
- Admin records/analytics/actions/moderation, dispute listing/context/resolution, listing reports, service requests/responses, application responses/cancellation, milestone add/remove, planner save, screening save, submission creation, and project reviews have matching argument **names**. Return values, body semantics, permissions, and transactional behavior still require verification.
- Live `project-attachments` exists and is private, although omitted from the pasted bucket list. `message-attachments`, `resumes`, and `verification` are also private; avatars, banners, portfolio_images, and service-media are public.
- Matching schema and a server-credential SELECT do not establish user-role RLS, storage policies, contract activation/reset triggers, block enforcement, realtime publications, or safe payment writes.

## Next evidence and repair order

1. Retrieve the admin error JSON and deployed admin function definitions to identify the actual 400 and returned JSON contracts.
2. Adapt delivery-review and meeting calls after checking live function semantics; these are confirmed current input mismatches.
3. Resolve the admin attachment bucket/path contract and inspect the three missing-field insert triggers.
4. Reconcile Didit persistence with the intended admin verification workflow and the `approved` enum value.
5. Review the prepared settlement migration against live functions before deploying any automatic-payout dependencies.
6. Run `database-runtime-readonly-audit.sql` and the existing `rls-readonly-audit.sql`, then verify client, freelancer, admin, and unrelated-user access plus the relevant end-to-end writes. No such write tests or database changes were made during this audit.
