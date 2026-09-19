# Applicant screening

New job applications automatically start screening after they are saved. The server responds to the freelancer immediately, then runs screening with Next.js after(). The Requests view quietly reads saved results every ten seconds while visible, including in an open applicant dialog. These reads never call Gemini. Existing applications are not retroactively screened.

Clients can use **Retry AI screening** if an assessment fails, or **Check AI match** to check an existing result. Existing discussion/rejection actions and job grouping remain intact. The optional checkbox sorts applicants within each job by their saved score; it does not make a hiring decision.

Automatic screening rechecks that the newly saved application belongs to the authenticated submitting freelancer, resolves the job owner from the database, and uses the existing owner-checked save RPC. The server-only service-role client allows this work to continue without the freelancer's session. Browsers cannot select an owner, supply evidence, or write scores. Application creation itself still uses the freelancer's JWT and the existing application RPC.

Transient overload/rate-limit failures get one delayed retry. Background failures preserve the application and leave the manual retry available. This uses the hosting platform's request-lifetime background support (120-second route budget); it is not a durable queue and cannot survive a server crash, restart or platform termination. Keep the dev server running locally and deploy on a host supporting Next.js after(). No additional SQL is needed beyond the already deployed application and screening RPCs.


## Server configuration and database setup

The existing `@google/genai` installation is reused. Save these server-only environment variables locally and in your deployment environment, then restart the application:

```dotenv
GEMINI_API_KEY=your-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
# Optional model override; default is gemini-3.6-flash.
GEMINI_MODEL=gemini-3.6-flash
```

`GEMINI_API_KEY` is now present in the saved `.env.local`; `SUPABASE_SERVICE_ROLE_KEY` was still missing at the last check. No secrets or environment files were changed by this implementation. Never use a `NEXT_PUBLIC_` prefix for these keys.

Apply **only** `supabase/migrations/202609150001_applicant_screening.sql` for this feature. It adds no tables. It creates a service-role-only save RPC and participant read policies on the existing `screening_results`. The transaction saves the result and updates `job_applications.screening_id` together. It verifies the job owner again and rejects changed job/application timestamps. It updates a previously linked result instead of accumulating duplicate rows.

This SQL has **not** been executed against Supabase. Before applying, inspect the deployed screening column types (in particular `result`, `strengths`, and `weaknesses` must accept serialized JSON text), existing application triggers, and relevant RLS. The supplied column listing does not establish these details. If a legacy trigger requires `auth.uid()` on every application UPDATE, reconcile its screening-link behavior with this server-only RPC; do not disable the trigger globally. User-scoped reads must permit the client to read the application's job, professional profile, skill links, skill names, and category. The migration does not widen those unrelated table policies. Confirm that existing policies on those tables do not recurse through `screening_results`.

Manual screening verifies the caller's JWT and job ownership with the normal user-scoped Supabase client before using the service-role save RPC. Automatic screening uses the verified creation flow described above. Browsers cannot call the save RPC or write screening rows directly. Client owners and the applicant can read their assessment through RLS; unrelated users cannot.

## Evaluation and persistence

The server sends an allowlist: job title/description/category, required skills, experience level, budget/pricing type and deadline; application proposal/price/delivery days/submission date; freelancer headline/skills/experience years/employment preference. IDs, names, avatars, email fields, location and private document fields are excluded. Contact addresses, phone-like sequences and HTTP links embedded in text are redacted. Freeform professional text is treated as untrusted evidence, not model instructions; the model is told not to assess personal characteristics.

Gemini returns six integer dimension scores plus at most four strengths, four weaknesses, and a short recommendation. Zod rejects missing fields, extra fields, fractional/out-of-range scores, and oversized text. The server computes the rounded weighted score: skills **40%**, experience **20%**, proposal **15%**, capability **10%**, delivery **10%**, pricing **5%**. Missing or incomparable delivery/pricing requirements receive a neutral 50 according to the rubric. Labels are derived by the server: 80+ Strong Match, 60–79 Potential Match, below 60 Limited Match Evidence. This score represents evidence of job fit, not personal quality. Model judgments can still vary despite a fixed rubric and temperature.

`strengths` and `weaknesses` store JSON arrays as text. `result` stores a versioned JSON text envelope containing the display label and a SHA-256 fingerprint of the professional inputs, model and rubric version. The frontend decodes the label and still supports older plain-text result labels. `screened_at` is the database timestamp; `expires_at` is seven days later. Legacy results without a fingerprint are evaluated once on the next explicit request. Changed inputs invalidate reuse; saved scores remain labelled as historical assessments until checked again.

Concurrent identical requests share a promise within one server process. Persisted, unexpired fingerprints prevent repeated calls across refreshes/restarts. Limits of five uncached attempts per user per minute and twenty in-flight operations are process-local. Multiple server instances can still generate simultaneously before either saves; the transactional save serializes row updates, but this is not a distributed Gemini quota or lock. A failed persistence attempt never returns an unsaved score as success.

## Files and checks

- `lib/ai/gemini.ts`: server-only Gemini client and structured-output request.
- `lib/ai/screening.ts`: rubric, validation, redaction and legacy label decoding.
- `services/project/applicantScreeningServer.ts`: ownership, professional queries, cache, limits and persistence.
- `app/api/applications/[applicationId]/screening/route.ts`: client-owner manual retry endpoint.
- `app/api/applications/route.ts`: authenticated application creation and background scheduling.
- `services/project/automaticScreeningServer.ts`: saved-applicant verification, owner resolution and background retries.
- `hooks/project/useProjectRequests.ts`: visible-page polling for saved results.
- `services/marketplace/listingActions.ts`: application submission through the server route.
- `services/project/applicantScreeningService.ts`: browser request using the current session token.
- `services/project/projectRequestService.ts`: stored label decoding.
- `components/project/RequestList.tsx` and `RequestCard.tsx`: explicit action, errors, saved results and sorting.
- `supabase/migrations/202609150001_applicant_screening.sql`: pending database function and access policies.
- `tests/applicant-screening.test.cjs`: scoring, output rejection, ownership, cache/concurrency, input changes and failed persistence.

Automated checks cover mocked provider/database responses. Live Gemini, Supabase RPC/RLS behavior and browser interaction still need testing with configured credentials and the migration applied. Test as the client owner, the applicant and an unrelated account. Confirm refresh reuses the saved assessment, changed requirements cause a fresh evaluation when requested, and provider failures preserve existing data.

Implementation reference: [Google's structured-output documentation](https://ai.google.dev/gemini-api/docs/generate-content/structured-output). The installed SDK's `responseJsonSchema` option is used with independent server validation.
