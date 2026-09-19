# PayMongo payments

Implemented: authenticated hosted checkout, full signed project amount in PHP, one durable checkout reservation per project and mode, participant-only status checks, verified PayMongo reconciliation, signed webhook handling, and payment panels in both project workspaces. Existing `payments` records feed the existing admin transaction view. The server reads agreement amounts; browser-provided amounts are rejected. No project stages are changed by payment.

## Required setup

1. Apply `supabase/migrations/202609180001_paymongo_security.sql` in the connected Supabase project's SQL Editor. It restricts payment writes to the server and adds a readiness check. It does not change payment columns or create tables. Checkout fails closed until this check passes. Review any custom security-definer RPC that can write payments as part of deployment; table grants cannot prevent such a function from writing on behalf of its owner.
2. Keep these variables server-only in `.env.local` and your deployment environment:

   ```dotenv
   PAYMONGO_SECRET_KEY=sk_test_your_key
   SUPABASE_SERVICE_ROLE_KEY=your_existing_service_role_key
   # Optional for localhost; required for a deployed app:
   APP_URL=https://your-public-app.example
   PAYMONGO_WEBHOOK_SECRET=your_endpoint_signing_secret
   # Only methods enabled on your merchant account:
   PAYMONGO_PAYMENT_METHODS=gcash,card,qrph
   ```

3. Register `https://your-public-app.example/api/payments/webhook` in PayMongo for `checkout_session.payment.paid`, matching test/live mode. Copy that endpoint's signing secret to `PAYMONGO_WEBHOOK_SECRET`. Localhost cannot receive external webhooks; use a public HTTPS development tunnel or deployment. Local test mode can reconcile using the return page or Refresh payment status without a webhook. Live checkout requires both a public HTTPS APP_URL and a webhook secret.
4. Restart the dev server after environment changes. Open a project whose agreement both parties signed, use Pay with PayMongo, complete a test payment, and verify the return page and admin transaction record. Test an unrelated user, double-click/concurrent checkout, cancelled/failed checkout, webhook retries, and wrong signatures before switching to a live key.

## Behavior and recovery

- Payments charge the full agreement amount, including milestone projects. Installments, escrow, platform-fee splitting, automatic freelancer payouts, and refunds are not implemented. Funds go to the configured merchant account; project cancellation does not refund a payment.
- `payments.transaction_reference` stores the checkout session ID. `status` uses `pending` and `paid`; the existing live table declares text columns, but deployments must permit these values in any additional checks/triggers. Provider payment evidence is retrieved before marking paid, checking mode, reference, project, payer, amount, and currency. Redirect parameters never mark paid.
- Test and live payment reservations have different deterministic UUIDs. The project panel labels test mode. The current admin view can distinguish integration records by joining `payments` to projects and comparing the reservation formula in `lib/payments/paymongo.ts`; it does not yet show a dedicated mode field. Do not interpret test records as collected revenue.
- A primary-key reservation prevents two processes from creating independent checkout sessions. An ambiguous timeout or failed persistence intentionally leaves the reservation pending without automatic retry. Support must inspect PayMongo by `reference_number` (the payment UUID), recover the existing session ID, and set `transaction_reference`. A verified paid webhook can recover a missing reference. Never delete the reservation and retry while an earlier payable session may exist.
- Existing expired checkout sessions are not replaced automatically. Support must reconcile and confirm the old session cannot be paid before any manual recovery. Existing unrelated/legacy payments block creation of a new checkout; support must reconcile those records first.
- Payment checks reconcile when participants view/refresh the panel or return from checkout. Production also needs the public webhook so closing the browser does not prevent recording payment.

References: [Hosted Checkout](https://docs.paymongo.com/docs/payment-channels-hosted-checkout), [retrieve checkout](https://docs.paymongo.com/re/reference/get_checkout_sessions), [webhook signatures](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management).
