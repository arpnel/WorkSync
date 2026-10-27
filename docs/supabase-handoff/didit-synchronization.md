# Didit synchronization implementation

## Implemented

The existing integration is extended, not replaced. `verificationPersistence.ts` is server-only and receives the service-role client created by `verificationServer.ts`. No browser obtains that credential or writes verification approvals.

- Session creation retains authenticated `vendor_data`, the fixed existing workflow, and admin-controlled `worksync_didit` metadata. Before returning the session URL, it registers the request and resets an existing freelancer profile to pending.
- `verification_requests.provider_session_id` is the unique idempotency key. Registration uses INSERT and a 23505 re-read, rather than assuming a partial index is usable as a generic PostgREST upsert conflict target. Owner/provider/workflow must match before reusing a row.
- Inserts set `provider='didit'`, session/workflow UUIDs, the verification URL, `provider_status='Not Started'`, `status='pending'`, `is_current=true`, and empty document paths. No identity document or biometric payload is stored.
- Existing pending reviews, including manual reviews, are preserved and block replacement. A completed Didit request is made non-current before a replacement is registered. Unique current/pending indexes arbitrate conflicting inserts. Expired/declined legacy sessions are synchronized before replacement. Unfinished sessions are reused.
- Signed webhooks retain the existing V2 signature verification, independently retrieve the provider decision, and check provider session/workflow/vendor against the server-created association. Unknown or mismatched sessions return 409; unknown accounts return 404; database failures return 503. Authenticated unrelated event types continue to be acknowledged without writes.
- Request updates are scoped by provider_session_id, user_id, provider, and is_current. Unchanged results avoid request updates. Profile writes skip rows already at the target status. No notifications are created by this implementation.
- Metadata event markers are saved only after request and profile writes succeed. A retry repairs a partially completed write rather than creating another request. Successful duplicate events preserve the event marker and verified timestamp. Current signed `created_at` is used for event ordering when supplied, with the legacy timestamp fallback retained.
- Verification GET reads the request status as workflow authority and checks the current provider decision; a browser poll does not grant approval. Metadata remains the session association/compatibility state. Existing metadata-only sessions are registered when starting/resuming or processing a webhook, not by an unsupervised bulk backfill.
- Existing `/admin/verification` still loads the verification module through `worksync_admin_records`. Persisted rows now provide pending/approved/rejected/expired statuses without exposing identity payloads. The unrelated admin RPC HTTP 400 still needs its database diagnostic; live Admin rendering is not established by these unit tests.

Status mapping is centralized in `lib/verification/didit.ts`:

| Provider result | Request | Freelancer profile |
| --- | --- | --- |
| Approved with an approved identity document, permitted production approval | approved | approved |
| Declined | rejected | rejected |
| Expired / Kyc Expired | expired | pending |
| Abandoned (closed unfinished session) | expired | pending |
| Not Started / In Progress / Awaiting User / In Review / Resubmitted | pending | pending |
| Approved without qualifying document evidence, or sandbox approval | pending | pending |

Provider status is preserved verbatim in `provider_status`, including Abandoned. A database/network failure never becomes a rejection. Business/lookup-only approvals still cannot grant a document-verification badge.

## Supabase work and limits

Implementation relies on the user-confirmed valid session unique index, one-current and one-pending indexes, permitted provider/request enum values, empty document defaults, service-role grants, and freelancer status guard. No database objects or environments were changed.

**Writes are retryable, not atomic.** No existing RPC was available to atomically register/replace a request or update request + freelancer + compatibility metadata. Calls are serialized per user within a process; this is not a distributed lock across Vercel instances. Unique indexes prevent duplicate session/current/pending records but do not serialize status decisions or guarantee cross-table consistency. Concurrent replacement, manual moderation, and overlapping webhooks can race between calls. Failed insertion after retirement can temporarily leave no current request; a failed profile update can leave request/profile statuses temporarily different until retry. Provider-session creation and auth metadata also cannot share a database transaction.

For strict production concurrency guarantees, a service-role-only transactional RPC is required: lock a per-user row, verify the authoritative current session, enforce event ordering/deduplication, retire/register requests or update results, update the freelancer status, and return authoritative state for metadata compatibility. Inspect the existing integration event table before choosing an event-receipt contract. This RPC was not invented, called, created, or deployed as part of the application change. No claim of complete cross-instance atomicity is made.

Historical manual verification SQL has a known `verified` enum mismatch; inspect the deployed manual-review function before approving/rejecting provider requests through Admin. No manual-review bypass was added.

## Didit environment variables required

- `DIDIT_API_KEY`
- `DIDIT_WEBHOOK_SECRET`

## Vercel configuration required

In each Production/Preview environment intended to run verification, configure the matching Didit variables plus `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `APP_URL`. Use the intended callback origin for `/verify/done`. Do not give browser variables privileged secrets. No environment changes were made.

## Didit dashboard configuration required

In API & Webhooks, configure an HTTPS destination at `<deployment-origin>/api/webhooks/didit`, subscribe to `status.updated`, and use the destination's secret as `DIDIT_WEBHOOK_SECRET` in that deployment. Ensure the API key belongs to the intended application/workflow. Existing code retains the fixed workflow ID. Signed test events are acknowledged without approving accounts; sandbox events cannot grant production approval. Check the destination delivery log after deployment. See [Didit's webhook contract](https://docs.didit.me/integration/webhooks).

## Tests

- `pnpm.cmd typecheck`: passed.
- Targeted ESLint on the changed integration and test files: passed.
- `node --test tests/didit-account-setup.test.cjs`: 23 passed, 0 failed.
- `node --test tests/*.test.cjs`: 157 passed, 7 failed (164 total). The same previously identified cache-mock/module-resolution failures remain in marketplace identities, messaging history, calendar, and portfolio tests.
- Tests cover signature/timestamp binding, malformed requests, user/session mismatch, unknown sessions, duplicate events, concurrent same-session registration, initial creation, resume/replacement, preserved manual pending reviews, status mapping, sandbox approval exclusion, and retry after request/profile/metadata errors.
- No live write, provider session, deployed webhook, or browser end-to-end test was performed. SQL prerequisite evidence was supplied by the user; it was not re-established through privileged mutations.

## Manual end-to-end test after deployment

1. Use an authenticated test freelancer with no pending manual request. Start verification in WorkSync. Confirm a single Didit request for the returned session ID, provider didit, pending status, and is_current=true; inspect no document payloads.
2. Complete the configured Didit flow. Check the signed `status.updated` delivery receives HTTP 200. Confirm the request's provider_status matches the provider, its mapped status is correct, and the freelancer status follows the mapping above. Sandbox approval must stay pending.
3. Check metadata compatibility still contains the session and minimal state. Visit Admin → Verification and check the result; capture the actual response JSON if the existing admin RPC fails.
4. Re-deliver the same signed event through Didit. Confirm request count, verified_at, profile status, and notification count remain unchanged.
5. Use separate sessions/accounts for declined, in-review, expired, and abandoned outcomes. Confirm expired requests release the pending slot while freelancer status remains pending. Start a replacement and confirm only one request is current.
6. Verify an unknown/mismatched session cannot update another account; an invalid signature returns 401 and malformed signed input returns 400. Do not disable verification to conduct the test.
7. In a controlled test deployment, inject a database failure. Confirm a retryable error, no rejection caused by the failure, and recovery on re-delivery without duplicate rows. Do not revoke production grants as a test.
8. Treat concurrent-instance/manual-review stress testing as pending the transactional RPC described above.
