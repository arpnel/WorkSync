# Applicant assessment review — 2026-09-30

## Verified

- Automatic screening is scheduled only after successful application persistence. Background failure does not fail or delete an application.
- The background worker verifies the applicant and resolves the job owner from database records. The assessment service authorizes the job owner before model use or cached-result reuse.
- Input contains job requirements, listed skills, profile headline/years and proposal/price/duration. Names, profile IDs, resume files and portfolios are not sent as structured evidence. Free text is contact-redacted and bounded, but this is not comprehensive anonymization.
- Zod validates output; the server calculates weighted score and label. Model-supplied total scores or extra keys are rejected. Input fingerprints and save timestamps guard against stale results.
- Live read-only zero-row checks passed for application status/timestamps and screening result columns. OpenAPI exposes the expected nine-argument `worksync_save_screening` contract.
- The locally configured Gemini model metadata returned HTTP 200 and advertises `generateContent`. This is not a generation, quota, Vercel or quality test. No applicant content was sent and no assessment records were written.

## Changes

- Versioned prompt `worksync-match-v2`, preserving weights 40/20/15/10/10/5 and the existing database response contract.
- Dimension-specific scoring anchors, self-reported versus verified evidence, no invented portfolio review, no inference of personal traits, and explicit handling of missing requirements.
- Stronger instructions against prompt injection in every input field, not just proposal text. These reduce risk; a prompt cannot guarantee semantic correctness or injection resistance.
- Hourly prices are not compared to an application amount with unspecified units; cheapest price is not rewarded. Proposed days are not treated as a calendar completion date without a start date.
- Provider JSON schema now matches application string-length limits. Non-STOP provider completions are rejected even when their text parses.
- Rejected/withdrawn/cancelled applications cannot initiate another assessment; application state participates in the cache fingerprint.
- V1 saved labels still render. New rubric requests cannot reuse V1 cached assessments. No bulk re-scoring or automatic migration of saved scores occurs.
- UI shows scores out of 100 rather than percentages, explicitly states portfolios are not assessed, labels expired results and excludes them from current score sorting.
- Missing assessments display initial preparation for two minutes from application creation, then a truthful unavailable/delayed state. This is an age-based display heuristic, not a persisted worker status. It adds no retry button and makes no extra generation request.

## Remaining limitations

1. `after()` is best-effort background execution, not a durable queue. A crash/deployment can lose work; read polling cannot restart generation. Guaranteed eventual assessments need a durable job/retry contract and worker, not another prompt edit.
2. Rate limiting and in-flight deduplication are per process. They do not prevent duplicate generation or enforce a global quota across multiple Vercel instances. The existing save RPC must arbitrate persisted duplicates; its deployed body/concurrency was not independently tested here.
3. Profile/skill changes are checked by reloading inputs before saving, but the save RPC's timestamp arguments cover the application and job only. Cross-table changes in the final save gap are not atomically covered.
4. Scores are subjective alignment guidance. No calibrated quality/fairness evaluation or live synthetic generation was performed. A valid schema is not proof of factual correctness; retain human review. Google also recommends semantic validation in its [structured-output guidance](https://ai.google.dev/gemini-api/docs/generate-content/structured-output?hl=en).
5. Legacy results remain visible until refreshed/expired. No browser end-to-end test, signed-in RLS test, live save or production configuration inspection was performed.

## Validation

TypeScript and targeted ESLint passed. All 15 applicant-screening tests passed, covering authorization, application independence, cache/coalescing, stale-input protection, save failure, invalid output, legacy labels, terminal applications, output limits/completion checks and expired/delayed display states. These tests do not establish actual model scoring quality.

No SQL migration is required for these changes. Redeploy application code to use the revised prompt for future assessments. Deployment should be followed by a controlled test application and confirmation that its saved score appears without relying on the applicant returning to the browser.
