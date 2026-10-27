# Milestone payouts, automatic refunds and delivery acceptance

Implemented locally 2026-09-30. **PREPARED, NOT APPLIED:** `supabase/migrations/202609300004_milestone_settlement.sql`. No live refunds, payouts, database mutations or environment changes were performed.

## Confirmed rules

- Clients still pay the full agreed amount upfront. This change splits freelancer payouts, not client checkout charges.
- Each approved milestone gets a separate payout for its agreed amount. A final project does not need to complete before earlier approved milestones can be paid.
- Intermediate milestones get **3 full days after the latest delivery** for review. The final milestone and standard-project delivery get **7 full days after delivery**. Planned due dates do not shorten these windows. Missing work never becomes payable merely because a date passed.
- The final milestone is determined by the agreed display order, with creation time/UUID tie-breakers. Once a payout is reserved, milestone terms and allocations cannot change.
- Only the assigned client may enable automatic acceptance, off by default. It applies only to future deliveries submitted after opt-in; progress notes are not deliveries. Disputes/cancellation holds and funding verification still apply. Disabling it does not undo an approval or transfer already made.
- An accepted cancellation makes only **uncommitted funds** eligible for automatic refund. Unresolved disputes block refunds. Merely requesting cancellation does not authorize a refund.
- Ready/awaiting-account payouts are cancelled when refund reservation wins the lock. Processing, pending, paid, failed and uncertain payouts remain reserved and are deducted from the refundable balance. Failed does not prove the money returned. No automatic clawback is attempted.

## Implementation

The migration extends `project_payouts` with milestone identity and replaces whole-project uniqueness with unique standard-project and milestone payout indexes. It adds protected `project_refunds` and `project_payment_preferences` tables. Existing payment rows remain the full original collection, and refunds have their own ledger; a refunded payment is not made chargeable again.

Settlement validates paid funding, original payer, assigned freelancer, signed contract, project budget and milestone allocation total. Separate transactional claims serialize payouts and refunds through the contract/project/payment locks. A refund reservation blocks later payout claims and reversal of the cancellation. Paid/reserved milestone deliveries cannot be replaced, while later milestones remain usable. Existing full-project payout rows for milestone projects cause the migration to abort for manual reconciliation; no money records are deleted or silently converted.

The existing cron worker verifies PayMongo funding before approval/claim, sends claimed refunds once, and independently retrieves provider evidence before marking refunds confirmed. Provider amount, payment ID, refund ID, PHP currency and test/live mode must match. Timed-out or ambiguous requests are placed in `needs_review`, never blindly resent. Stale processing claims are also quarantined. Remaining refunds below PayMongo's minimum are recorded for support review.

The submission route schedules a best-effort review after a successful delivery save so client auto-accept can take effect promptly. Failure does not undo a saved delivery; cron retries the review. Payout sending still uses the scheduled worker. Background execution is not a guaranteed immediate job queue.

Payment UI shows separate payout rows, cancellation-refund state and client auto-accept controls. Delivery UI explains the 3/7-day review rule. A service-only information RPC returns safe summaries, never encrypted bank details. The settings RPC authenticates the client directly; no browser-provided client identity is trusted.

## Deployment order

1. Keep `PROJECT_SETTLEMENT_ENABLED=false` while deploying. Do not enable it merely because local tests pass.
2. Review/test **only** `supabase/migrations/202609300004_milestone_settlement.sql` in staging. It depends on the already-applied `202609300001_payment_readiness.sql`. Do not rerun the earlier migration after this one: that would restore old settlement functions.
3. Apply the new migration explicitly. Its NOWAIT table locks fail promptly under contention; retry the whole transaction during low traffic. It changes no existing financial records except schema, functions and constraints.
4. Deploy the matching application code. The worker requires settlement version 2 before processing; old storage produces a configuration error rather than running incomplete automation.
5. Configure the existing server settings: `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYOUT_ACCOUNT_ENCRYPTION_KEY`, `PAYMONGO_PAYOUT_SOURCE_NUMBER`, `PAYMONGO_PAYOUT_SOURCE_NAME`, `CRON_SECRET`, `APP_URL`, plus existing public Supabase configuration. No new secret or paid scheduler is required by this change.
6. Confirm PayMongo checkout webhook delivery, payout capability/source balance, eligible refund methods and production credentials. Refunds use the original payment method, not the freelancer payout account. Refund reconciliation is polling-based in the protected worker.
7. Run the acceptance tests below in test/staging, then explicitly enable settlement in the intended deployment. Separately authorize and verify a small live collection, milestone payout and refund before declaring production ready.

## Scheduler and provider limits

The existing Vercel Hobby cron remains `0 0 * * *` UTC. Three/seven days defines eligibility, not an exact transfer time. Processing may occur at the next daily run and later if there is a backlog. An external scheduler or a suitable hosting plan is needed for more frequent guaranteed checks; this change does not configure one.

PayMongo supports partial refunds but method-specific windows, minimums, available balance and exceptions apply. Unknown and indirect-return methods such as Brankas go to support review. Maya partial refunds can be restricted on the payment day; provider rejection also goes to review. No automatic retry is made after a failed/ambiguous refund. Provider success is not a promise that the customer's bank has already posted the credit. References: [refund guide](https://docs.paymongo.com/docs/payment-acceptance-refunds), [refund resource](https://docs.paymongo.com/reference/refund-resource).

Refunds sent directly through PayMongo outside WorkSync, or chargebacks between provider verification and transfer, still require reconciliation. No database lock spans the provider. The code stops release on detected external refunds/disputes. Merchant reserves and support procedures remain necessary.

This remains a service-order settlement flow. Job-application projects without an order are not newly supported. Installment collection, platform commissions, escrow, bank-account ownership verification and automatic recovery of already-transferred money are not added.

## Tests and remaining verification

- TypeScript and targeted ESLint passed.
- **79 targeted tests passed**, including payment collection, existing payment SQL, new milestone SQL, refund evidence/worker, payout worker and project submission regressions.
- New SQL was applied twice in the isolated PGlite fixture. Checks cover individual milestone release, 3/7-day windows, latest delivery, full allocation, client-only opt-in, future-only auto-accept, cancellation/refund reservations, disputes, preventing duplicate claims and protecting funded work.
- Refund worker tests cover competing calls, provider timeouts, receipt persistence failure, wrong evidence, unsupported methods and pending/failed outcomes. These use mocked provider responses, not actual PayMongo calls.
- Full suite: **245 tests, 239 passed, 6 failed**. An outdated submission-route mock for the new `after()` hook was updated and the affected tests now pass. The six remaining pre-existing cache mock failures concern messaging (3), calendar (1) and portfolio (2).
- No browser/phone test, production build, live Supabase writes, real multi-connection database race test or live PayMongo transfer/refund has been run. The database fixture is reduced and does not reproduce every deployed trigger or RLS policy.

### Manual acceptance checks

1. Collect the full test payment for a two-milestone project. Approve the first and verify only its allocated amount is transferred while the second stays editable.
2. Verify three days for the intermediate delivery and seven for the final/standard delivery, including late delivery, superseding delivery, progress-only notes and no delivery. Do not change production timestamps to test.
3. Enable auto-accept as the client, submit a new delivery and verify approval; ensure an earlier pending delivery is not retroactively auto-accepted. Disable the setting and confirm subsequent deliveries use the review window. Reject freelancer/unrelated-user settings requests.
4. Request cancellation and ensure releases pause without a refund. Accept it and verify the remaining amount is refunded once. Repeat with an already claimed milestone transfer, unresolved dispute, unknown provider method and insufficient merchant refund balance.
5. Race claim/cancellation/closure using separate database connections, run overlapping workers, and interrupt after a provider POST. Confirm no duplicate transfer or refund. Deadlocks in existing participant RPC lock orders may require transaction retries; fixture tests do not prove all live lock interactions.
6. Verify actual deployed cancellation/review RPCs still work with the revised triggers and that the UI reports payout/refund statuses correctly. Inspect provider dashboard and recipient receipt, not just local database status.
7. For `needs_review`, reconcile PayMongo IDs, original reference, amount, recipient and any external refunds before any manual recovery. Never reset a claimed record to ready blindly.

## Changed files

Migration above; new `services/payments/refundServer.ts` and `app/api/payment-preferences/route.ts`; updated settlement/payment services, project-work route, project payment/delivery/resolution UI, active workspace and review-date helper. Tests are `milestone-settlement-sql.test.cjs`, `refund-worker.test.cjs`, the existing refund-evidence test, and updated settlement/platform-workflow tests. Earlier unrelated working-tree edits were preserved.
