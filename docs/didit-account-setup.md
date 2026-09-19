# Account setup and Didit handoff

## Current implementation

Both client and freelancer setup load saved profiles, validate required fields, keep existing uploads, save the selected role to `Users.role`, and mark `profiles.account_setup_completed` only after the other writes succeed. Freelancer categories and skills are reconciled against existing relationships so a sequential retry does not insert duplicates. Completion means the profile is saved; it does not grant an identity badge or imply verified professional credentials.

Both setup forms and Settings use Didit's web SDK. WorkSync authenticates the user before creating a session with workflow `b093dd10-8d6b-4282-82cd-424c6a8ae92a`; `vendor_data` comes from the authenticated user, never browser input. ID files are submitted directly to Didit. The old raw ID uploads are removed from these forms; existing stored documents are not deleted.

The API key is server-only in `.env.local`. Live read-only verification confirmed that the supplied key can access the workflow and that its type is `kyc`. No identity verification session or real ID submission was performed during implementation.

## Persistence before table matching

No tables, columns, buckets, grants, or RLS policies were created or modified. Minimal session state currently uses **Supabase Auth `app_metadata.worksync_didit`**, updated only through the server's existing service-role key. It contains the session/workflow IDs, hosted URL, status, verified flag, creation timestamp and last processed event ID/timestamp. It does not store names extracted from IDs, ID numbers, images, birth dates, biometrics, or full decision payloads. `user_metadata` and browser callbacks are never trusted for approval.

`services/verification/verificationServer.ts` isolates this temporary adapter. Replace it with the confirmed verification table in the next stage. Existing public profile/admin verification fields are deliberately not synchronized before their columns, constraints and meanings are confirmed. This implementation therefore does not yet activate marketplace verified badges.

`GET /api/verify` checks the active session against Didit and exposes only status and a verified flag. An SDK result or callback does not grant approval. A signed `status.updated` webhook must be received and persisted. Its active session, vendor/user and workflow are checked against stored state and an independently retrieved decision; approval requires an approved document check. Expiry, decline and resubmission remove verification. Sandbox and Try Webhook examples cannot mark real users verified. Duplicate last-event delivery is a no-op; failed persistence returns an error so it remains retryable. Session and decision updates are serialized per user inside one server process.

## Remaining environment setup

- `DIDIT_API_KEY` has been configured locally from the supplied attachment. Keep it in server deployment secrets too.
- Add a public HTTPS `APP_URL` for `/verify/done` callback navigation (optional with the in-page SDK).
- Register a Didit webhook destination at `https://YOUR-HOST/api/webhooks/didit`, subscribe to `status.updated`, and save its signing secret as `DIDIT_WEBHOOK_SECRET`. This is still required for verified status; localhost alone cannot receive the webhook. Use a public HTTPS deployment or development tunnel.
- Restart the app after changing environment settings. Test valid/declined documents, resubmission, expiry, cancellation, webhook replay, test events and an unrelated account before production use.

The webhook verifies the full `X-Signature-V2` HMAC using recursively sorted compact JSON, checks that the signed payload timestamp matches `X-Timestamp`, and enforces a five-minute window. It returns success only after persistence, not before. Processing is synchronous, so production should add a durable event inbox/queue during the table phase to reliably meet Didit's response deadline.

## Data map to confirm next

| App data | Current target | Confirm in supplied schema |
| --- | --- | --- |
| Auth identity and selected role | `Users.user_id`, `Users.role` | Auth foreign key, role enum/check, allowed role transitions |
| Name, display name, location, English, bio, avatar, completion | `profiles` | Column types, `user_id` uniqueness/PK, completion meaning for multiple roles |
| Client identity | `client_profiles.client_id`, `user_id` | PK/default, unique user constraint |
| Freelancer details and supporting files | `freelancer_profiles` | Experience/preference enums, link and file columns, user uniqueness |
| Industries and skills | `freelancer_categories`, `freelancer_skills` | Relationship keys and composite unique constraints |
| Didit session/current decision | Temporary Auth app metadata | Existing verification table, provider session unique key, statuses, timestamps, role-independent ownership |
| Webhook delivery history and session reservation | Deferred | Durable event IDs, atomic processing/session reservation, retry/ordering rules |
| Public avatar | `avatars`, `profiles.avatar_url` | Public bucket and allowed MIME/size/path rules |
| Resume | `resumes`, `freelancer_profiles.resume_url` | New writes are storage paths; existing URLs remain intact; confirm private access and signed retrieval consumers |
| Portfolio samples/certificates | Existing `verification` bucket, `portfolio_sample_urls` / `certification_urls` | Confirm intended buckets and private retrieval; new writes are paths, existing URLs are retained |
| Legacy uploaded ID documents | Previous buckets/fields untouched | Retention/migration plan; no new direct ID uploads |

For that stage, provide tables, column types/defaults/nullability, primary/foreign/unique keys, enum/check values, and bucket IDs/public flags/file limits. The following policy stage must secure role/setup writes, approval fields, private file access and any privileged RPCs. Current client validation and application ordering are not a replacement for database constraints or RLS.

Known pre-matching limits: multi-table profile saves are not transactional; already-saved steps remain for retries. A fresh upload can remain orphaned if later writes fail. Reusing the selected File avoids another upload during a same-page retry. Concurrent requests across multiple server instances need a database-backed reservation and atomic event inbox; the temporary Auth adapter does not provide distributed locking or full event history. Do not use the new state for financial/marketplace authorization until the table and policy stages are completed.

References: [Didit sessions](https://docs.didit.me/sessions-api/create-session), [webhook signatures and delivery](https://docs.didit.me/integration/webhooks), [decision retrieval](https://docs.didit.me/sessions-api/retrieve-session).
