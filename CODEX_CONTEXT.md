# WorkSync project handoff for Codex

**Prepared:** 2026-10-15 (Asia/Taipei)  
**Repository:** `H:\capstone\WorkSync`  
**Evidence labels:** **Verified in checkout** means inspected in current files; **historical note** means a repository audit or earlier project record says this; **unverified** means this handoff does not establish current live behavior. A SQL file in this repository is not proof it ran.

## 1. Project overview

WorkSync is a marketplace and project-work platform connecting clients with freelancers. The code supports job and service listings, applications and requests, agreements, project delivery, messaging, payments, profiles, verification, scheduling, and administrative review. Intended users are clients, freelancers, and administrators. This purpose is verified from routes, components, and service names; the checked-in README is still the generic Next.js template and is not authoritative product documentation.

**Stack verified in `package.json`:** Next.js 16.1.7 App Router, React 19, TypeScript, Supabase JS/SSR, Tailwind CSS 4, shadcn/Radix UI, React Hook Form + Zod, date-fns, Recharts, Lucide, Sonner. Integrations/dependencies include Google GenAI, PayMongo via server HTTP/service code, Didit Web SDK, Daily video, and image cropping. Package scripts: `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm lint`, `pnpm typecheck`; on this Windows setup use `pnpm.cmd` if PowerShell blocks `pnpm.ps1`.

## 2. Architecture

### Main layout

- `app/`: App Router pages, route handlers, auth callback, and layouts. Primary authenticated product area is `/home`; admin area is `/admin`.
- `components/`: UI organized by feature (`auth`, `account`, `admin`, `layout`, `marketplace`, `project`, `milestoneproject`, `standardproject`, etc.); shared primitives are under `components/ui` and `components/shared`.
- `services/`: feature workflows and server orchestration, including `auth`, `project`, `payments`, `verification`, `calls`, `marketplace`, `listing`.
- `lib/`: Supabase clients, validation, AI/provider adapters, payment utilities, and shared helpers.
- `types/`, `constants/`, `hooks/`: domain shapes, enums/constants, and client hooks.
- `supabase/migrations/`: SQL migration history and newer prepared migrations. `supabase/schema-preflight.sql` is a read-only schema-preflight aid.
- `docs/`: feature setup guides, audits, and Supabase handoff SQL/notes. Read them before changing a feature with existing deployment caveats.
- `tests/`: local tests; inspect current scripts/config to determine how to run targeted tests (package scripts do not define a `test` command).

### Auth, access, and data flow

Supabase Auth provides identity/session. Browser access is through `lib/supabaseClient.ts` and SSR/server helpers in `lib/server.ts` (inspect these before extending). The `/auth/callback` exchanges auth codes and routes users requiring profile setup; setup routes are `/account-setup/client` and `/account-setup/freelancer`. Authenticated workspace pages sit under `app/home/layout.tsx`; admin pages under `app/admin/layout.tsx`. Do not treat page hiding as authorization: database RLS, RPC guards, and server route checks are security boundaries.

Frontend pages/components call feature services, which use Supabase tables/RPCs and Storage. Sensitive provider operations are routed through `app/api/**/route.ts` and server-only service/lib code. Representative routes: applications/screening, password update, calls, project settlement cron, listing moderation, payments/webhook, payout account, identity verification, project work, and Didit webhook. Follow existing ownership, role, and RLS contracts; do not put privileged credentials in browser code.

### Important route families

- `/home/dashboard`, `/home/marketplace`, `/home/my-listings`, `/home/projects`, `/home/projects/{standard,milestone}/[orderId]`, `/home/messages`, `/home/notifications`, `/home/schedule`, `/home/profile`, `/home/settings`, `/home/payments/return`, `/home/assessments`, `/home/analytics`, `/home/subscription`.
- `/admin`: users, jobs, services, projects, reports, disputes, analytics, financial, verification, assessments, moderation.
- Public marketplace routes exist under `/marketplace` as well as workspace routes.
- API routes are under `app/api`; consult route handlers and service implementations for exact input/output contracts.

## 3. Database and Supabase

### What is knowable

The checkout has 32 migration files, spanning `202609060001_messaging_features.sql` through `202610130001_listing_moderation_subscriptions.sql`. Names and contents describe messaging; core workflows, contract lifecycle, admin moderation, job agreements, milestone planning, permissions/access/storage, atomic requests, realtime, lifecycle/account moderation, dispute/resolution/analytics/schedule; applicant screening; PayMongo security/payment gates/delivery; settlement/readiness/capacity/skill assessment; submission comments; and listing moderation/subscriptions.

The September platform notes and `docs/supabase-handoff/database-audit-2026-09-30.md` report a read-only live API-schema comparison on 2026-09-30. That historical snapshot found 49 supplied tables and 50 live API tables, with 118 SELECT query shapes resolving under the configured server credential. It did not prove authenticated-user RLS, row visibility, writes, or all workflow behavior. The same audit specifically reported missing live payout tables/columns and settlement RPCs at that time, and a missing `verification-documents` bucket. This may have changed since; recheck before relying on it.

Earlier notes characterize the large 2026-09-14 migration batch as pending setup requiring staging/live preflight. `202609270001_project_settlement.sql` was explicitly described as prepared, not applied; a later payment-readiness migration was described as superseding that draft. The current uncommitted `202610040001_project_submission_comments.sql` and `202610130001_listing_moderation_subscriptions.sql` are prepared code, not evidence of application. **No current deployment ledger or live migration status was verified in this task. Do not infer that any migration was applied from its presence.** Obtain the current remote migration history and inspect live schema/policies before proposing a migration. Never run migration or database writes without the user's explicit approval.

### Supplied schema inventory

The user-provided attachment `Pasted text.txt` (the 49-table schema inventory) is now represented below so another account can use it without access to the original attachment. **Evidence scope:** it lists table names, primary keys, columns (including nullable markers where supplied), some foreign keys/unique keys, several enum labels, and seven storage bucket IDs. It does not state when the query was run, include every column type/default/check/index, enumerate RLS policies/grants/triggers, give storage visibility/limits/policies, or prove current live state. Treat it as a useful schema snapshot, not a deployment ledger. Refresh with read-only live inspection before SQL or security decisions.

**Listed base/application tables (1–34):**

1. `Users`: PK `user_id`; `email`, `role` enum (`client`, `freelancer`, `admin`), `created_at`; unique email; user_id references `auth.users(id)`.
2. `freelancer_profiles`: PK `freelancer_id`; `user_id`, `headline`, `hourly_rate`, `created_at`, `verification_status` enum (`pending`, `approved`, `rejected`), experience/preference and portfolio/social/resume/government-ID/sample/certification fields; FK user_id to `Users`.
3. `profiles`: PK/FK `user_id` to `Users`; avatar, bio, location, timestamps, display/banner names, setup flag, first/last name, province/city, English proficiency.
4. `portfolio`: PK `portfolio_id`; freelancer FK; title/description/project URL/thumbnail image FK/created time.
5. `portfolio_images`: PK `id`; portfolio FK; image URL/order/time.
6. `reviews`: PK `review_id`; rating/comment/time, project/client/freelancer FKs, reviewer role.
7. `projects`: PK `project_id`; freelancer/client FKs, title/description/budget, status enum (`pending`, `active`, `revision`, `completed`, `cancelled`), dates, optional order and application FKs.
8. `job_categories`: PK `id`; name/time; unique name.
9. `skills`: PK `id`; name/time.
10. `service_skills`: composite PK `(service_id, skill_id)`; FKs to `services` and `skills`.
11. `category_skills`: composite PK `(category_id, skill_id)`; FKs to `job_categories` and `skills`.
12. `saved_services`: PK `saved_id`; user/service FKs and created time.
13. `service_orders`: PK `order_id`; optional service/job/application FKs; freelancer/client FKs; status and timestamps.
14. `milestones`: PK `milestone_id`; project FK; title/description/amount/date/status enum (`pending`, `in_progress`, `submitted`, `revision_requested`, `approved`, `overdue`), created time/order.
15. `service_media`: PK `media_id`; service FK, media URL/type/order/time.
16. `service_milestones`: PK `service_milestone_id`; service FK, title/description/amount/order/time.
17. `contracts`: PK `contract_id`; optional order/application FKs; unique order_id; price/delivery/revision/terms/status (`draft`, `pending_client`, `pending_freelancer`, `active`, `rejected`, `cancelled`, `completed`, `pending`), signature and timestamps.
18. `contract_milestones`: PK `contract_milestone_id`; contract FK; title/description/amount/order/time.
19. `client_profiles`: PK `client_id`; user FK; timestamps.
20. `freelancer_categories`: composite PK `(freelancer_id, category_id)`; freelancer/category FKs.
21. `freelancer_skills`: composite PK `(freelancer_id, skill_id)`; freelancer/skill FKs.
22. `services`: PK `service_id`; freelancer/category FKs; title/description/price/pricing mode/delivery/revisions/type; status enum (`Active`, `Paused`, `Archived`); slug/cover/timestamps/archive flag.
23. `jobs`: PK `job_id`; client/category FKs; title/description/budget range/pricing/deadline/status/timestamps/experience/archive flag.
24. `job_skills`: composite PK `(job_id, skill_id)`; job/skill FKs.
25. `job_applications`: PK `application_id`; job/freelancer/screening-result FKs; proposal/price/days/status enum (`pending`, `shortlisted`, `accepted`, `rejected`, `withdrawn`, `in_review`), timestamps.
26. `screening_results`: PK `screening_id`; freelancer FK, optional application FK; score/result/strengths/weaknesses/recommendation and screened/expiry/created times.
27. `conversations`: PK `conversation_id`; optional project/order/job/application FKs and created time.
28. `conversation_participants`: composite PK `(conversation_id, user_id)`; conversation and `Users` FKs; joined time.
29. `messages`: PK `message_id`; conversation and sender FKs; optional body/attachment/read time, created time.
30. `notifications`: PK `notification_id`; user FK; optional type/title/message/related ID, `is_read`, created time.
31. `freelancer_availability`: PK `availability_id`; freelancer FK; optional day/time range and availability flag.
32. `subscriptions`: PK `subscription_id`; user FK; optional plan/status/start/expiry and created time.
33. `payments`: PK `payment_id`; optional order/project FKs; payer FK; amount/status/method/reference/time.
34. `contract_item_approvals`: PK `approval_id`; contract FK; item key and client/freelancer approval timestamps plus created/updated times.

**Additional tables in supplied inventory (35–49):**

`admin_members` (PK user_id → `Users`); `admin_audit_log` (PK audit_id, admin FK); `saved_jobs` (composite user/job PK); `listing_moderation` (composite listing_type/listing_id PK, reviewed_by FK); `listing_reports` (PK report_id, reporter/owner/reviewed_by user FKs and optional service/job FKs); `verification_requests` (PK request_id, user/reviewer FKs); `project_submissions` (PK submission_id, project/milestone/author FKs); `revision_requests` (PK revision_id, unique submission_id, project/submission/requester FKs); `account_moderation` (PK user_id and admin/user FKs); `project_disputes` (PK dispute_id, project/milestone/opened_by/reviewer FKs); `project_cancellations` (PK cancellation_id, order/requester/responder FKs); `planner_documents` (PK user_id FK); `project_meetings` (PK meeting_id, project/creator FKs); `conversation_preferences` (composite conversation/user PK and FK to participant pair); `user_blocks` (composite blocker/blocked PK and both user FKs).

**Storage bucket IDs listed:** `avatars`, `banners`, `message-attachments`, `portfolio_images`, `resumes`, `service-media`, `verification`. The inventory does not say which are public or what policies/limits apply.

Migration/source references also include later tables such as `project_submission_comments`, `subscription_plans`, `user_subscriptions`, `listing_submissions`, and `listing_moderation_events`; these are not in the user's 49-table inventory and their live presence must be checked independently.

The 2026-10-04 prepared comments migration defines `project_submission_comments` linked to `project_submissions`, `projects`, and `"Users"`, with 1–2000 trimmed characters and project-party read/author insert policies. The 2026-10-13 prepared listing/subscription migration defines `subscription_plans`, `user_subscriptions`, `listing_submissions`, and `listing_moderation_events`, plus related policies/functions. Treat both as unavailable until confirmed live.

Important rules captured in project SQL/docs: preserve existing tables and data; many migrations reuse existing tables rather than recreate them; private work/verification files require scoped policies; project workflow transitions and approvals are guarded through RPCs/triggers; listing moderation failures must remain manual review; payment checkout and freelancer payout are separate; cancellation does not imply a refund; settlement is feature-gated and must not be enabled until schema/provider validation. Some local migration files use `CREATE TABLE IF NOT EXISTS` but that does not make them safe to blindly replay against an unknown database.

### RPCs / buckets

RPC names referenced by code/docs include `worksync_review_submission`, `worksync_save_meeting`, `worksync_admin_records`, `worksync_admin_analytics`, `worksync_settle_project`, `worksync_claim_payout`, and helpers such as `worksync_is_admin` / project-party checks. Signatures and availability are not stable assumptions: the 2026-09-30 audit found delivery-review and meeting-save argument mismatches between app calls and live signatures then. Inspect live signatures and bodies/grants before adapting or replacing any RPC.

Project docs mention private `project-attachments` and `verification-documents`, plus `verification`, `resumes`, and public `avatars`. The historical 2026-09-30 audit found `verification-documents` absent while `verification` existed. Confirm current bucket IDs, public/private flags, file limits, policies, and real object paths before storage changes.

## 4. Features and implementation status

**Checkout presence is not proof of deployment or successful runtime behavior.** Current working tree contains substantial uncommitted changes. On 2026-10-15, `git status --short` showed modifications across listing/settings/auth/project/payment/workspace files, new moderation/password/subscription/comment components and services, and the two migrations above. Inspect `git diff` before editing or staging; preserve unrelated work.

### Feature areas visible in source

- Authentication/profile setup/password reset: `app/login`, `app/reset-password`, `app/auth/callback`, setup routes, `components/auth`, `services/auth`. Current uncommitted work adds shared password requirements and server password endpoint. Historical 2026-10-13 note says local typecheck and targeted lint passed; browser and Supabase Auth password-policy verification remain outstanding.
- Marketplace/listings: public and authenticated marketplace routes, job/service details, saved listings, applications, reports, listing editing/archive. New uncommitted moderation endpoints/services/admin queue and subscription page; migration-dependent.
- Projects/contracts/delivery: standard and milestone workspaces, agreement/contract/payment/delivery panels and services. Historical audits describe application/request/agreement/active/completed workflow, milestone planning, append-only submissions, revision allowances, approval, and reviews. Two-way submission comments have UI/service plus prepared migration; persistence/RLS is not established until migration is verified.
- Messaging, notifications, schedule, dashboard/analytics, account/settings, admin moderation/disputes/verification: routes and supporting components exist. Messaging migration has previously been deferred in notes; archive/pin/block/attachments may depend on it. Reconfirm current migration state.
- AI applicant screening and listing moderation are server-side integrations. Screening historically uses Next.js `after()` and is not a durable queue. Listing failures/malformed assessment should stay `manual_review`; auto-reject is gated.
- Payments/settlement: checkout/webhook and payout/settlement code exists. Historical audits warn that actual provider configuration, payout tables/RPCs, and real money movement need live verification. Keep `PROJECT_SETTLEMENT_ENABLED` false/unset until reviewed and validated. Checkout is distinct from payout; cancellation does not automatically refund.
- Didit identity setup exists, but historical handoff says Didit session state is temporarily kept in protected Auth app metadata and is deliberately not synchronized into public verified badges until schema/policies are confirmed.
- Daily video calling has implementation/docs. Historical setup reported the configured provider credential returned HTTP 401, so live room/token and two-device/browser call behavior were unverified then.
- Portfolio metadata editing exists; historical system audit says portfolio image upload/thumbnail authoring was absent and cards used a placeholder. Recheck current UI before continuing.

### Known issues and validation record

- `docs/system-audit.md` (2026-09-19) reports an earlier 114-test pass and TypeScript/lint success, but production build failed fetching Geist fonts from Google Fonts; browser/mobile/live Supabase/provider checks were not performed in that audit. Do not treat this as current HEAD validation.
- Later docs report local typecheck/targeted lint and tests for specific feature passes; those are historical snapshots, not a current validation of today's uncommitted tree.
- The 2026-09-30 live compatibility audit documented (at that time) RPC argument mismatches for delivery review and meetings, absent payout schema dependencies, and an admin HTTP 400 case that required the actual database diagnostic. Recheck live state and current implementation.
- Current task did not run tests, typecheck, lint, build, browser flows, or live Supabase checks.
- Read `docs/system-audit.md`, `docs/platform-development.md`, `docs/payment-readiness.md`, `docs/project-delivery-verification.md`, `docs/project-settlement.md`, `docs/didit-account-setup.md`, `docs/daily-video-calls.md`, and relevant `docs/supabase-handoff/*` before touching those areas.

## 5. External integrations and configuration names

Environment variable names below were found in source or setup docs. **No values are included.** Presence in source does not confirm that a value exists or is correctly configured in any environment.

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, server-only `SUPABASE_SERVICE_ROLE_KEY`.
- Gemini: `GEMINI_API_KEY`, optional/model selector `GEMINI_MODEL`; used for applicant screening and listing assessment. `LISTING_AUTO_REJECT_ENABLED` gates severe automatic rejection. Fail closed to manual review on malformed/provider-failed moderation.
- PayMongo: `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, `PAYMONGO_PAYMENT_METHODS`, `APP_URL`; payout-related `PAYOUT_ACCOUNT_ENCRYPTION_KEY`, `PAYMONGO_PAYOUT_SOURCE_NUMBER`, `PAYMONGO_PAYOUT_SOURCE_NAME`, `CRON_SECRET`, and `PROJECT_SETTLEMENT_ENABLED`. See `docs/paymongo-setup.md`, `docs/payment-readiness.md`, and `docs/project-settlement.md`; test/live mode, merchant capability, webhook delivery, payout enablement, and live settlement are separate requirements.
- Didit: `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET`, `APP_URL`; webhook endpoint is `/api/webhooks/didit`. See `docs/didit-account-setup.md` for workflow and remaining persistence caveats.
- Daily: `DAILY_API_KEY`; see `docs/daily-video-calls.md`. Historical provider check returned 401; verify current key/configuration safely.

Never print, copy into docs, or expose values for any secret. Keep service-role/provider credentials server-side.

## 6. Important project decisions and preferences

These are recorded project agreements/preferences, not universal assumptions; latest user direction wins:

- Inspect current contracts and diffs before broad edits. Preserve existing Supabase queries, RPCs, APIs, handlers, and data structures for frontend-only work.
- Never apply migrations or destructive database changes without explicit user approval. Prepare complete reviewable SQL and inspect live schema, exact RPC signatures, grants, RLS, constraints, and storage first. Never recreate existing tables or delete data.
- Preserve unrelated working-tree changes. Before a requested push, inspect `git diff --cached --name-only`; selectively stage only requested files and do not follow selective staging with `git add -A`.
- Preserve the accepted app shell: `SidebarTrigger` plus the “Workspace” label. Dashboard changes are additive; do not remove existing elements unless explicitly requested.
- Use shared global theme tokens/fonts; prefer established components for equivalent states and avoid redundant modules. Phone layouts should be purpose-built and checked at 375/390/414/430 px when UI work is requested.
- Password requirements apply on both frontend and server; reuse shared validation/checklist across signup/change/reset, and align Supabase Auth policy.
- Enforce date/amount bounds in the visible form (no invalid past milestone date; clamp/show remaining allowance).
- Keep submission comments durable and visible to both client and freelancer per submission; browser-only state is insufficient.
- Explain client checkout separately from freelancer payout. Distinguish local code checks, browser evidence, applied migration status, and live provider/Supabase behavior.
- Treat database/payment/configuration audits as read-only when requested; report variable names and locations, never values.

## 7. Strict development rules

1. Inspect source, current contracts, relevant docs, `git status`, and diffs before edits.
2. Do not recreate tables, delete data, alter production data, or apply migrations without explicit approval. Migration file existence is not deployment evidence.
3. Preserve working features and backend contracts unless a requested change requires otherwise; avoid duplicate implementations and unnecessary dependencies.
4. Keep secrets server-side and out of output, commits, and documentation.
5. Run appropriate checks after code changes when requested/appropriate, and report exact scope/results. Do not claim tests or checks were run if they were not. Distinguish typecheck, lint, tests, build, browser, live DB, and provider evidence.
6. Do not claim a feature works from static code alone. Verify relevant flows and access boundaries at the level the claim implies.
7. For changes to data access, inspect RPC signature/body, grants, RLS `USING`/`WITH CHECK`, helper execution privileges, triggers, and storage policies as applicable.

## 8. Handoff checklist

### Inspect first

1. Run `git status --short` and inspect the full diff. The current checkout has many uncommitted edits and new files; do not overwrite or discard them.
2. Read `docs/system-audit.md`, `docs/platform-development.md`, and the feature-specific docs listed above.
3. Inspect the current app entry/auth/layout and service boundaries (`lib/supabaseClient.ts`, `lib/server.ts`, `app/home/layout.tsx`, `app/admin/layout.tsx`, relevant `app/api` routes and `services`).
4. Review every migration in sequence and compare it with the current remote migration ledger/schema using read-only access. Confirm tables, keys/enums, RPC signatures/grants, RLS/triggers, buckets/storage rules, and realtime publication. Do not apply anything during inspection.
5. Confirm deployment environment variable names/configuration through authorized secret metadata only; never read or expose values in a handoff.

### Unfinished or needs follow-up

- Current uncommitted 2026-10-13 security/moderation/subscription/archive/password changes need the intended code review, applicable local checks, and browser validation. The listing/subscription migration is prepared; live application is unknown.
- Submission comments UI/service needs the prepared migration reviewed/approved/applied before durable cross-account operation can be claimed; verify RLS/realtime with two accounts.
- Confirm current Supabase migration history and reconcile historical migration notes before any deployment. Several past notes label migration batches pending, but status may have changed.
- Reconcile current delivery/meeting RPC implementations with live signatures; old audit reported mismatches.
- Verify PayMongo checkout/webhook configuration and provider callbacks. Payout schema and settlement availability were missing in the 2026-09-30 audit; keep settlement disabled until rechecked and staged end-to-end.
- Verify Didit persistence plan and badge synchronization; historical implementation intentionally did not grant public badges from temporary app metadata.
- Recheck Daily credential and two-device video flow; historical provider validation failed with 401.
- Recheck build/font network issue; last documented production build failure was Google Fonts fetch. Browser and mobile acceptance were not established by that audit.
- Review portfolio image authoring gap and deferred messaging migration/features against current UI and live state.

### User attention / approvals

- Any migration, SQL execution, destructive data/schema action, production settlement enablement, or provider financial operation requires explicit user approval and a concrete reviewed plan.
- Before continuing the current uncommitted branch, ask which of the in-progress features is the next priority if no task-specific request is given; preserve all work meanwhile.

### Could not verify for this handoff

- Current remote Supabase migration ledger, schema/RLS/storage state, or whether any local migration has been applied since the dated audits.
- Current deployment secrets/configuration or provider account readiness.
- Whether historical bugs remain fixed in the current working tree.
- Current test/typecheck/lint/build status, browser behavior, multi-account access, real payment/payout, identity verification, or video calling. No checks or external writes were run for this documentation task.

