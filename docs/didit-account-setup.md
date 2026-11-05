# Didit identity verification setup

## Environment selection

Set DIDIT_ENVIRONMENT to exactly sandbox or live. The integration uses Didit's official https://verification.didit.me/v3/ API host in both modes; the selected mode chooses its own API key, workflow, and webhook secret. There is no cross-environment credential fallback.

Keep these server-only values in local/deployment secrets:

| Setting | Purpose |
| --- | --- |
| DIDIT_ENVIRONMENT | Explicitly selects sandbox or live. |
| DIDIT_SANDBOX_API_KEY | API key from the Didit Sandbox application. |
| DIDIT_SANDBOX_WORKFLOW_ID | Workflow ID created or copied into Didit Sandbox. |
| DIDIT_SANDBOX_WEBHOOK_SECRET | Signing secret for the Sandbox webhook destination. |
| DIDIT_SANDBOX_WEBHOOK_SECRET_PREVIOUS | Optional old signing secret during Didit's 24-hour rotation window. |
| DIDIT_SANDBOX_SUPABASE_PROJECT_REF | Supabase project reference that must match NEXT_PUBLIC_SUPABASE_URL; use local for a local Supabase URL. |
| DIDIT_LIVE_API_KEY | Live API key, kept separate from Sandbox. |
| DIDIT_LIVE_WORKFLOW_ID | Live workflow ID. |
| DIDIT_LIVE_WEBHOOK_SECRET | Signing secret for the Live webhook destination. |
| DIDIT_LIVE_WEBHOOK_SECRET_PREVIOUS | Optional old Live signing secret during rotation. |

Copy placeholders from .env.example; never put real credentials there or expose them through NEXT_PUBLIC_ variables. APP_URL remains optional and is used for the /verify/done callback. Restart the app after changing environment values.

## Didit Sandbox dashboard setup

1. Switch the Didit console to **Sandbox**.
2. Create a Sandbox API key under the Sandbox application.
3. Create or copy the verification workflow into Sandbox and set its Sandbox workflow ID in DIDIT_SANDBOX_WORKFLOW_ID.
4. Create a Sandbox webhook destination at https://YOUR-HOST/api/webhooks/didit and subscribe it to status.updated.
5. Copy that destination's signing secret to DIDIT_SANDBOX_WEBHOOK_SECRET. Sandbox and Live webhook destinations have different secrets.
6. Set NEXT_PUBLIC_SUPABASE_URL, its server-side service-role secret, and DIDIT_SANDBOX_SUPABASE_PROJECT_REF. The reference must match the URL. For this capstone prototype, the currently connected Supabase project may be used during local or preview testing.
7. Set DIDIT_ENVIRONMENT=sandbox, then restart WorkSync.

Didit uses the same API endpoint in both environments; the API key selects the environment. Sandbox has separate keys, workflows, webhook destinations, and verification records. Use only Didit's supplied sample/test data: Sandbox still stores captured media, even though its decisions are simulated. See [Didit's Sandbox guide](https://help.didit.me/getting-started/sandbox-and-testing).

Vercel production deployments cannot run Sandbox verification. Local and preview testing can use the currently connected Supabase project when the explicit project reference matches its URL. Sandbox decisions are simulated, so an approved result can set a freelancer's existing verification status to approved and the interface will show verified; that status represents a test outcome, not confirmed real-world identity. Use a dedicated test account. Starting a Sandbox session for a user can replace that user's current Didit session and mark their previous request as no longer current. Other users' records are left untouched; this setup does not reset all verification records.

## WorkSync verification flow and persistence

The existing verification page and Didit web SDK handoff remain unchanged. WorkSync creates the session on the server using the selected environment's API key and workflow ID, binds vendor_data to the signed-in user's ID, stores the session association, and returns the hosted verification URL to the current page. On return, the page can refresh its existing status.

The existing verification_requests table stores session status and provider metadata; freelancer_profiles.verification_status uses the current database values pending, approved, and rejected. An approved Sandbox document decision stores approved in the configured project and the existing interface presents the verified state. Declined results store rejected; in-progress and review states remain pending; expired or abandoned sessions are marked expired and the profile returns to pending. A network/provider failure is not a Didit decision and leaves stored status unchanged so the request can be retried.

Webhook events must have a valid X-Signature-V2 (and signed timestamp), the selected environment, and the matching current session/user. The handler checks the Didit decision independently before persisting. Duplicate and older event timestamps are ignored; request updates compare the existing updated_at value so a concurrent update forces a retry. The session pointer and last event marker remain in Supabase Auth app_metadata.

The admin verification record can load a minimal identity summary directly from Didit's decision API, and only for the current approved document verification: name on ID, document type, issuing country, and available liveness/face-match statuses. The server verifies the admin role and matches the provider session to the current WorkSync account before returning these fields. They are not copied into WorkSync storage, and document numbers, birth dates, addresses, images, and raw provider payloads are not returned. Sandbox summaries are marked as simulated test data. If the workflow does not return the name, the admin view reports it as unavailable; check Didit's ID Verification Returned data settings for new sessions.

There is no migration in this change. Existing Live verification rows and metadata are preserved. The current schema has no durable webhook inbox, so delivery and cross-instance ordering still rely on Didit's retry behavior and the existing session metadata; request/profile writes are idempotent but are not one database transaction. Do not use this integration for authorization-critical decisions until a durable atomic event-processing path is available.

## Testing

With Sandbox configured and a test account selected:

1. Start with no verification, create a Sandbox session, complete the hosted flow using sample data, and return to WorkSync.
2. Try the approve, a decline_*, and a review_* Sandbox scenario; confirm status and the test freelancer profile update.
3. Confirm an expired/abandoned session can be replaced.
4. Deliver valid and invalid signatures, the wrong environment, a mismatched session, a duplicate event, and an older event. Only the valid current event should update status.
5. Simulate a failed Didit request and confirm no verification status changes.

The Sandbox key, workflow, webhook destination, and matching Supabase project reference are required for provider-level testing. Automated local tests can validate signing, environment selection, persistence mapping, and failure handling without sending identity data to Didit.
