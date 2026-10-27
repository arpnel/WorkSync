# Freelancer Skill Assessments — implementation handoff

Implemented locally on 2026-09-30. **The migration is PREPARED, NOT APPLIED.** No live assessments, attempts, notifications, identity changes or AI requests were created during this work.

## 1. Existing architecture reused

The feature uses existing `job_categories`, `category_skills`, `freelancer_categories`, `Users`, `freelancer_profiles`, `profiles`, `notifications`, Supabase authentication, `worksync_is_admin`, and `worksync_marketplace_active`. It uses the existing Admin layout/access wrapper, workspace sidebar, shared UI components, profile About section, notification detail dialog and automatic applicant-screening pipeline.

Read-only live REST/schema checks established the category IDs/names and existing column relationships. The live inventory has 56 categories. IDs are not copied into the migration. These reads do not establish all deployed triggers, policies or write behavior.

## 2. Files created

- `app/admin/assessments/page.tsx`
- `app/home/assessments/page.tsx`
- `components/assessments/AdminAssessments.tsx`
- `components/assessments/AssessmentEditor.tsx`
- `components/assessments/FreelancerAssessments.tsx`
- `components/assessments/ProfileAssessments.tsx`
- `components/assessments/QuizQuestions.tsx`
- `lib/assessments/types.ts`
- `lib/assessments/contracts.ts`
- `services/assessments/assessmentService.ts`
- `scripts/assessment-starter-bank.cjs`
- `supabase/migrations/202609300003_skill_assessments.sql`
- `tests/fixtures/skill-assessment-schema.sql`
- `tests/skill-assessments.test.cjs`
- `tests/assessment-contracts-notifications.test.cjs`
- This handoff.

The authoring script is tooling only; it is not imported into client code. The migration embeds its seed, so applying the one SQL file does not require running the script separately.

## 3. Existing files modified for this feature

`components/admin/admin-navigation.ts`, `components/layout/app-sidebar.tsx`, `components/profile/AboutSection.tsx`, `components/notifications/notification-data.ts`, `components/notifications/NotificationDetailDialog.tsx`, `lib/ai/screening.ts`, `services/project/applicantScreeningServer.ts`, and `tests/applicant-screening.test.cjs`.

Other pre-existing working-tree changes belong to earlier work and were not reverted. No payment, capacity, Didit or project workflow SQL is replaced by this migration.

## 4. Assessment architecture

Four tables:

| Table | Purpose |
| --- | --- |
| `skill_assessments` | One reusable editable draft per existing category; version increments on save |
| `skill_assessment_openings` | Frozen quiz, category name, version, settings and publication/open/close timestamps |
| `skill_assessment_eligible` | Frozen eligible user/freelancer cohort per opening |
| `skill_assessment_attempts` | One attempt per opening/user, saved choices, server deadline and final result |

Questions/options are a validated JSONB document, rather than additional question/option tables. Stable UUIDs identify questions and choices. Validation checks question types, correct selections, points, lengths, limits and category skill tags. Draft saves require the expected version to prevent silently overwriting another admin's edit. Opening snapshots are never updated through the editor RPC.

The seed creates ten single-answer foundation questions for each of the 56 known categories, matched by existing category name. Related categories share eight subject-family banks. These are editable starter material, not standardized or professionally validated examinations. Admin should tailor category specificity, difficulty and thresholds before publishing. Seed reruns preserve existing drafts; they create no categories, openings or notifications. A new or renamed unmatched category can be authored through Admin.

## 5. Eligibility

At publication, SQL requires `Users.role='freelancer'`, an existing freelancer profile, the selected `freelancer_categories` membership, account creation at least 30 days before publication, and active marketplace moderation status. This cohort is stored transactionally.

A scheduled future start still freezes eligibility when Admin confirms publication (`opened_at`), not at the future `opens_at`. The UI explains this. Becoming 30 days old or adding a category later does not add someone to that opening. Existing cohort membership is retained after profile edits. Moderation is rechecked when starting/saving/submitting uncompleted attempts.

## 6. Admin workflow

Admin → Assessments → category → edit title/instructions, pass percentage, optional timer, questions/options, correct answers, integer points and category skill tags. Single-answer, multiple-answer and True/False are supported. Questions can be reordered/deleted and previewed without creating an attempt.

Save the draft, then Open assessment. The dialog previews the question count/settings and current eligible count, accepts optional scheduled start and required closing time, and explains frozen eligibility. SQL computes final eligibility. One active/scheduled opening per category is enforced. Admin can close early and inspect any historical opening's searchable results with eligible, attempted, passed, failed, not-attempted and expired counts.

## 7. Freelancer workflow

Workspace → Assessments (or an invitation) shows available, completed and expired assessments. Only cohort members receive an opening. A shared workspace link may be visible to client accounts, but they receive no assessment access without frozen eligibility.

Before starting, the page displays instructions, questions count, pass threshold, timing and one-attempt rules. Start/resume returns the same attempt. Save progress explicitly persists choices. The countdown uses server time; leaving the page does not pause it. Submission requires confirmation and returns the stored result. The list refreshes periodically and on window focus. Failed/expired openings remain in personal history. Passed category results appear in the profile About section, separate from identity verification.

## 8. Notifications

The existing `notifications` table gets one `skill_assessment` row per eligible user in the same transaction as publication. The opening UUID is the notification's `related_id`. Retrying publication with that UUID reuses the opening and does not send again. A second distinct active opening is rejected by a unique index.

The notification detail resolves current opening state and provides Take Assessment, View Result, or View Assessment for closed/expired invitations. Routes go to `/home/assessments?opening=<id>`. No extra notification storage, email, push provider or cron is introduced.

## 9. Scoring and deadlines

SQL, not the browser or Gemini, grades the frozen answer key. Single-answer/True-False must match the correct option; multiple-answer requires the exact set. Each correct question earns its configured integer points, otherwise zero; no partial or negative credit. Percentage is earned/available points ×100. Passing compares the unrounded value to the frozen threshold; display is rounded to two decimals.

The server deadline is the earlier of opening closure and start time plus optional timer. Server timestamps determine acceptance. Early Admin closure also ends unsubmitted attempts. Late submissions become expired without grading; there is no automatic submission of partially saved answers. Submitted attempts remain immutable through the RPC and repeated submissions return the original result.

## 10. Screening/Gemini integration

The existing automatic screening loader fetches the latest passed result for the applicant and **matching job category only**. It passes category, percentage, passed state, version and completion date as structured evidence, without user IDs, questions or answers. The evidence participates in the input hash, so a changed result invalidates the old screening cache on the next screening request; results are not bulk rescored immediately.

Rubric version is now `worksync-match-v3`; old v1/v2 labels remain readable. Weights remain 40/20/15/10/10/5. The prompt treats knowledge quizzes as supporting skills evidence, not proof of practical ability or certification, forbids a fixed bonus or quiz-dominated judgment, and forbids penalizing absent evidence. There is no numeric bonus in code. The model's adherence still needs representative quality evaluation, beyond mocked tests.

If the new evidence RPC has not been installed (`PGRST202`/`42883`), existing screening proceeds with no assessment evidence. Other evidence errors stop screening instead of silently hiding failures. Existing screening configuration and service-only persistence are preserved.

## 11. Security protections

All four tables have RLS enabled and no direct anonymous/authenticated table privileges. Admin management checks database admin identity. Member operations derive identity from `auth.uid()` and check the frozen cohort; browser-supplied owner/score/deadline fields are not used. Opening row locks serialize starts/submissions and early closure. Unique constraints enforce one attempt and one active opening. Notification creation is atomic with publication.

Member RPCs explicitly construct safe quiz objects without correct answers or private tags. Even completed attempts do not return keys. Runtime response schemas reject incompatible payloads. The public evidence RPC exposes only latest passed category summaries, never failures, answers or unrelated personal data. Admin results show names, outcomes and timestamps, not unrelated identity documents.

These controls do not provide proctoring, prevent screenshots or prove independent test taking. Public passed scores and completion dates are intentionally profile evidence. Trusted database/service-role administrators remain privileged, as elsewhere in WorkSync.

## 12. Validation

- TypeScript: passed (`pnpm.cmd typecheck`).
- Targeted ESLint: passed for changed assessment, navigation, profile, notification, screening and test/tool files.
- Assessment SQL, notification/contracts, screening and Admin regression suite: **43 passed, zero failed**.
- Full suite: **221 tests, 215 passed, 6 failed**. Remaining failures are existing cache-mock problems: three messaging-history cases, one calendar case and two portfolio cases. No assessment failure occurred.
- The actual migration was applied twice in isolated PGlite PostgreSQL with role checks and SQL execution. Tests cover seeds, authorization, editor validation/version conflicts, fixed eligibility, notifications/idempotency, snapshot history, answer secrecy, saved choices, grading types, duplicate submits, time limits, closing limits, scheduled starts, early closure, evidence privacy and screening integration.
- Live Supabase writes, real multi-connection concurrency, deployed notification delivery, browser/mobile flows, production build and actual Gemini quality evaluation were not performed. The fixture is reduced and does not reproduce all live triggers/policies.

## 13. Required Supabase changes

Apply only the new assessment migration after review/staging validation. It creates the four tables, indexes, private validation/projection helpers, admin/member/evidence RPCs, grants and starter drafts, then requests a PostgREST schema reload. It does not change existing identity verification, account age, categories, payments or capacity rules. No environment changes or new scheduler are required; closure is enforced by server time on every relevant operation.

## 14. Exact migration

`supabase/migrations/202609300003_skill_assessments.sql`

**PREPARED, NOT APPLIED.** The user will review and apply separately. The optional starter authoring tool is `node scripts/assessment-starter-bank.cjs`; it rewrites only the embedded seed locally, never calls Supabase.

## 15. Manual configuration and acceptance checks

1. Review/test this migration against staging with the deployed moderation helpers and notification constraints/triggers. Apply the one file, then deploy the matching application changes.
2. Review the starter content per category and tune difficulty, point weights, passing threshold and timer. Do not publish all categories automatically.
3. Use Admin and eligible/ineligible test freelancer accounts to verify invitations and access. Include new accounts, wrong category, clients and suspended accounts.
4. Complete a quiz, resume saved progress, expire a timed attempt, close early, retry publication/submission, and edit/reopen a new version. Verify historical results and exactly-once invitations.
5. Test simultaneous publication/submission/closure using separate real connections; the isolated single-session fixture does not prove live distributed behavior.
6. Inspect participant browser network responses for absence of answer keys; test direct table/RPC access for anonymous, unrelated and non-admin accounts.
7. Confirm desktop/mobile keyboard interaction, timers, profile badges and notification deep links in the deployed app. Existing Supabase configuration is reused; Gemini retains its existing server keys.
8. Evaluate representative Gemini screenings with matching evidence, unrelated evidence, no evidence and adversarial profile text. Confirm explanations do not portray a quiz as certification or practical-work proof.

This repository ignores `docs/`; include this local handoff explicitly when sharing it if needed. Nothing was staged, committed or deployed by this implementation.
