# System audit — 19 September 2026

This is a source and local regression audit, not a claim that every production workflow works. No remote migrations, real payments, identity submissions, or multi-account browser sessions were performed.

## Fixed in this pass

| Area | Finding and correction |
| --- | --- |
| Portfolio | Add, Add First Project, and Edit had no handlers. They now open a validated dialog and persist title, description, and an optional HTTP(S) project link through the existing portfolio table. |
| Portfolio failures | Read failures appeared as empty portfolios or left loading unfinished. Errors now display with Retry; delete failures display an error and a zero-row deletion cannot report success. |
| Profile overview | An optional detail query could prevent the entire profile from loading. Available details now remain visible, with unavailable sections identified instead of displaying false zero totals. |
| Profile services | Browser-only visibility preferences looked like public profile settings. The wording now explains their actual scope. Invalid or unavailable browser storage no longer blocks loading services. |
| Sign-in | Forgot Password and Sign Up were dead controls. Sign Up opens the maintained registration form; password recovery sends a reset email and has a password update page with validation and error states. |
| Auth callback | The server callback did not share the browser session store and ignored exchange failures. The callback now uses the app's browser auth client, handles provider/code/session failures, and routes incomplete accounts to setup. Code exchange is shared across React effect replays. Registration emails explicitly return to this callback. |
| Landing page | Added the missing `/login` destination. Connected Explore Freelancers, replaced placeholder header/footer links with real destinations, and replaced unsupported numerical marketing claims with workflow descriptions. |
| Route casing | Git tracked notifications and both project detail routes under `app/Home`. Corrected them to `app/home` for case-sensitive deployments. These three content-preserving renames are staged; other edits remain unstaged. |
| Schedule | Legacy `in_progress` and milestone `completed` values now map to In progress and Done. Updated obsolete calendar/status tests to reflect signed contracts, the current response shape, and retained Done tasks. |
| Code quality | Fixed all six baseline lint errors and the three baseline warnings. The unused legacy registration implementation now delegates to the maintained registration component. |

## Remaining gaps and deployment checks

| Priority | Area | Current limitation / required next step |
| --- | --- | --- |
| High | Delivery completion | `202609190003_project_delivery_workflow.sql` is prepared locally. Compare the live RPCs, grants and status constraints, then deploy and verify standard/milestone submission, revision and final approval using separate accounts. See [delivery verification](project-delivery-verification.md). |
| High | Payments | Checkout/status/webhook code has regression coverage, but live readiness, provider configuration and webhook delivery were not verified here. Refunds, escrow, installments, fee splitting and automatic freelancer payouts are not implemented; cancellation does not refund money. See [payment setup](paymongo-setup.md). |
| High | Verification badges | Didit state currently uses protected Auth app metadata. It is not synchronized to public profile/admin verification fields, so successful identity verification does not yet activate marketplace badges. Confirm the intended schema before connecting these. See [verification handoff](didit-account-setup.md). |
| High | Password recovery / Google sign-in | Verify Google provider setup, email delivery, and the Supabase redirect allowlist for `/auth/callback` and `/reset-password` on each deployment origin. Test valid, expired and cancelled links in a browser. Local tests do not prove provider/email delivery. |
| Medium | Advanced messaging | Archive, pin and block depend on the deferred messaging migration; attachments depend on private storage policies. The earlier deferral is preserved. Verify participant and unrelated-account behavior when deploying. See [messaging setup](messaging-setup.md). |
| Medium | AI screening | Background screening uses Next.js `after()`, not a durable queue. A process restart can lose work. Provider availability and live save-RPC compatibility still need verification; guaranteed execution requires durable jobs. |
| Medium | Portfolio images | Portfolio metadata and external links are editable. Image upload/thumbnail authoring is still absent from this UI; existing cards display a placeholder. The existing storage helper alone is not a complete image workflow. |
| Medium | Planner / service display | Personal schedule and service-view preferences are stored in this browser; they are not cross-device synchronization or public visibility settings. |
| Low | Legacy project mockups | `components/milestoneproject/milestoneproject.tsx`, `MilestoneProjectLayout.tsx`, and `components/standardproject/standardproject.tsx` retain prototype controls with no actions. No active page imports these layouts; current routes use the workspace components. Retire or migrate them before reuse. |
| Validation blocker | Production build | `pnpm.cmd build` failed while fetching Geist and Geist Mono from Google Fonts. A production build remains unverified. Retry with font-network access or deliberately adopt locally hosted fonts. |

## Coverage and results

- TypeScript: passed after the fixes; Next route types regenerated successfully.
- Tests: **114 passed, 0 failed** across auth callbacks, setup/Didit, applicant screening, marketplace identities, messaging, payments, delivery, resolution, schedule, cache, analytics, and portfolio/profile behavior. These tests use mocks and pure logic; they do not execute live SQL policies.
- Lint: full run passed with one unused suppression warning introduced during this pass; removed that suppression and reran lint on the final changed files successfully. The six original errors and three original warnings are resolved.
- Diff whitespace check: passed.
- Static scans: checked route destinations and button handlers across `app` and `components`, then inspected flagged controls for form/dialog behavior and active imports. This cannot prove every conditional UI path works.
- Source review: landing/auth, setup/profile, marketplace/listings, projects/requests/delivery/payment/chat, messages, notifications, schedule, dashboard/reports, settings, contacts, and admin routes. Existing regression coverage was run for their covered service paths; there was no browser walkthrough of every page.
- Production build: blocked by external font downloads, as described above.
- Browser, mobile visual checks, live Supabase/RLS/storage, email delivery, real provider callbacks, and client/freelancer/unrelated-account acceptance: **not performed in this audit**.

Before deployment, exercise one complete standard project and one milestone project from application/request through agreement, verified payment, work, revision, approval and review. Include cancellation/dispute cases, failed/offline actions, reloads, account switching, and an unrelated user's denied access. Also verify admin restrictions, notifications, private attachments and the public profile from the other account.
