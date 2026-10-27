# Project automatic review and payouts

Prepared locally; migration, deployment, scheduler and real two-party/provider checks are not verified.

## Rules

- Passing the project deadline does not cancel a project. An active overdue project shows a warning.
- Only the newest final delivery for a project/milestone is eligible. Progress notes never trigger release. A revision-requested delivery is not auto-approved.
- Eligibility is `max(submitted_at, min(project_due_date, submitted_at + 7 days))`. A submission after the deadline is eligible immediately. Missing deadline means seven days. Timestamps use the persisted database timezone/instant.
- Pending cancellations and unresolved disputes pause automatic review and payout claims. If a hold is lifted after eligibility, the next run can process it; the timer does not restart.
- Each milestone delivery can be approved automatically, but the full agreed project amount is paid only after ALL milestones are approved. No partial milestone payouts or platform fee deductions are introduced. The merchant wallet must cover transfer fees in addition to the agreed payout.
- Manual final approval also feeds the same one-payout-per-project-and-mode queue.
- Paid checkout is distinct from payout. Only independently retrieved `succeeded` transfer evidence is displayed as paid out. Refunded or disputed provider payments fail closed.
- Cancelling an agreement does not automatically refund checkout. Refund decisions and provider refunds remain a separate support operation; never mark a refund completed from a cancellation status.

## Deployment

1. Review [payment-readiness.md](payment-readiness.md) and the single prepared `supabase/migrations/202609300001_payment_readiness.sql` against the supplied live metadata. Test it in staging before an explicit production deployment. It supersedes the UNAPPLIED September 27 draft; do not run the old draft or replay the historical migration folder. Existing cancellation and dispute RPC bodies remain intact.
2. Configure these server-only variables using deployment secret storage (do not put values in tickets/logs):
   - Existing `PAYMONGO_SECRET_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
   - `PAYOUT_ACCOUNT_ENCRYPTION_KEY`: a cryptographically random 32-byte key encoded as 64 hexadecimal characters. Keep a protected backup; changing it without re-encrypting stored destinations prevents recovery.
   - `PAYMONGO_PAYOUT_SOURCE_NUMBER` and `PAYMONGO_PAYOUT_SOURCE_NAME`: the source account provisioned for the activated PayMongo Wallet. BIC is `PAEYPHM2XXX`.
   - `CRON_SECRET`: a random scheduler bearer secret.
   - `PROJECT_SETTLEMENT_ENABLED=true` only after test-mode validation. Leave unset/false during setup.
3. `vercel.json` registers a daily schedule at 00:00 UTC (`0 0 * * *`). Verify it in the production deployment. If a higher frequency is needed, review plan capacity before changing it or configure an external scheduler to call GET `/api/cron/project-settlement` with `Authorization: Bearer <CRON_SECRET>`. This route is server-only and does not depend on someone viewing the project. Eligibility is a cutoff, not a promise of immediate bank settlement. Work is processed in bounded rotating batches; monitor backlog and errors and increase scheduling capacity for volume.
4. In Settings > Payouts, freelancers enter their account holder name, account number twice, receiving bank BIC, bank label, network and ownership confirmation. Confirm supported BIC/network through PayMongo. Saving is not bank ownership verification. GET returns only the bank label and last four digits. Test and live destinations are stored separately.
5. Queued transfers snapshot the encrypted destination. Changing the saved account affects newly queued payouts, not transfers already queued/sent. InstaPay payouts over PHP 50,000 require support review; use a supported PESONet destination for larger projects.

## Verification before enabling live settlement

- Test early deadline, seven-day deadline, late submission, no submission, progress-only, revisions, newer superseding delivery, missing date and each milestone independently.
- Using two accounts, race review/cancellation/dispute against automatic review and assert contract locks serialize decisions. Test held and cancelled projects never pay out.
- Invoke the worker concurrently and repeat runs; assert one provider POST per payout and exactly one final project payout. Test database transaction rollback on failed notifications/contract completion.
- Test payment amount/payer/currency/mode mismatch, provider refund/dispute, wrong transfer reference/destination and unrelated-user access.
- Test pending, succeeded and failed provider responses; test timeouts and process crashes after claiming. No automatic retry of ambiguous provider writes.
- Test anonymous API calls, client-only accounts, RLS direct reads/writes, key-unavailable/tampered ciphertext, test/live isolation and account changes while payout is queued.
- Browser-check the dispute dialog at 375/390/414/430px, keyboard radio navigation, evidence upload, cancellation responses, overdue notice and masked payout account UI.

## Recovery

`needs_review` is deliberate: a timeout, unexpected response, oversized InstaPay transfer or abandoned claim must not cause another transfer. Support must reconcile PayMongo by the payout UUID reference, recover the existing batch/transfer IDs if present and verify destination and amount before changing state. Provider idempotency retention is limited; do not reset and resend old claims blindly. Failed transfers likewise need an explicit support decision and a new audited attempt, not an automatic retry. Polling of stored pending IDs is safe and runs every scheduled invocation. Monitor returned error counts and the ready/processing/pending/needs_review queue. Neither account numbers, ciphertext nor raw provider responses are logged.

Official provider references: https://docs.paymongo.com/docs/money-movement-moving-money-with-api and https://docs.paymongo.com/docs/money-movement-best-practices .
