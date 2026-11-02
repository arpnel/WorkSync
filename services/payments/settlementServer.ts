import "server-only";
import { refundCancelledPayment, reconcileRefunds } from "./refundServer";
import { paymentDatabase, reconcilePayment } from "./paymentServer";
import {
  paymentId,
  paymentMode,
  paymongo,
  PaymentError,
} from "@/lib/payments/paymongo";
import {
  transferRequest,
} from "@/lib/payments/payouts";

async function verifyFunding(
  db: ReturnType<typeof paymentDatabase>,
  row: {
    payment_id: string;
    project_id: string;
    order_id: string | null;
    payer_id: string;
    amount: number;
    status: string;
    transaction_reference: string | null;
    payment_method: string | null;
    provider_payment_id?: string | null;
  },
) {
  if (
    !row.transaction_reference ||
    row.payment_id !== paymentId(row.project_id)
  )
    throw new PaymentError("Invalid payment reservation.");
  const session = await paymongo(
    `/v1/checkout_sessions/${encodeURIComponent(row.transaction_reference)}`,
  );
  if (!(await reconcilePayment(db, row, session)))
    throw new PaymentError("Payment is not confirmed.");
  const paid = session.attributes.payments?.find(
    (p) => p.attributes.status === "paid",
  );
  if (!paid) throw new PaymentError("Payment evidence unavailable.");
  const response = await transferRequest(
    `/v1/payments/${encodeURIComponent(paid.id)}`,
  );
  const a = response.data?.attributes;
  if (
    response.data?.id !== paid.id ||
    a?.status !== "paid" ||
    a.amount !== Math.round(Number(row.amount) * 100) ||
    a.currency !== "PHP" ||
    a.livemode !== (paymentMode() === "live") ||
    a.disputed !== false ||
    !Array.isArray(a.refunds) ||
    a.refunds.length !== 0
  )
    throw new PaymentError("Payment requires review before payout.");
  return paid.id;
}

export type ProjectSettlementReviewStatus = "disabled" | "version_unavailable" | "payment_unavailable" | "reviewed_pending" | "completed";

/** Verify and record completed earnings; payout statuses are demo-only and no transfer is sent. */
export async function reviewProjectPayment(projectId: string): Promise<ProjectSettlementReviewStatus> {
  const db = paymentDatabase();
  const version = await db.rpc("worksync_settlement_version");
  if (version.error || version.data !== 3) return "version_unavailable";
  const payment = await db
    .from("payments")
    .select(
      "payment_id,project_id,order_id,payer_id,amount,status,transaction_reference,payment_method,provider_payment_id",
    )
    .eq("payment_id", paymentId(projectId))
    .eq("status", "paid")
    .maybeSingle();
  if (payment.error) throw new PaymentError("Delivery payment unavailable.");
  if (!payment.data) return "payment_unavailable";
  await verifyFunding(db, payment.data);
  const result = await db.rpc("worksync_settle_project", {
    p_project: projectId,
    p_payment: payment.data.payment_id,
    p_mode: paymentMode(),
  });
  if (result.error) throw new PaymentError("Delivery automatic review failed.");
  const project = await db
    .from("projects")
    .select("status")
    .eq("project_id", projectId)
    .maybeSingle();
  if (project.error || !project.data)
    throw new PaymentError("Unable to verify project completion status.");
  return project.data.status === "completed" ? "completed" : "reviewed_pending";
}

export async function settleProjects() {
  const reviewUntil = Date.now() + 60_000;
  const db = paymentDatabase();
  const mode = paymentMode();
  const version = await db.rpc("worksync_settlement_version");
  if (version.error || version.data !== 3)
    throw new PaymentError(
      "Apply the project review automation migration before enabling settlement.",
    );
  const refundTracking = await reconcileRefunds(db, Date.now() + 20_000);
  let reviewed = 0,
    errors = refundTracking.errors;
  let refundsSubmitted = 0;
  // Rotate through payments so an old project or missing destination cannot starve other work.
  const payments = await db
    .from("payments")
    .select(
      "payment_id,project_id,order_id,payer_id,amount,status,transaction_reference,payment_method,provider_payment_id",
    )
    .eq("status", "paid")
    .order("settlement_checked_at", { nullsFirst: true })
    .limit(25);
  if (payments.error)
    throw new PaymentError("Settlement storage is not ready.");
  for (const row of payments.data ?? []) {
    if (Date.now() >= reviewUntil) break;
    try {
      if (
        row.payment_id !== paymentId(row.project_id, mode) ||
        !row.transaction_reference
      )
        continue;
      const providerPaymentId = await verifyFunding(db, row);
      if (await refundCancelledPayment(db, row.payment_id, providerPaymentId)) {
        refundsSubmitted++;
        continue;
      }
      const result = await db.rpc("worksync_settle_project", {
        p_project: row.project_id,
        p_payment: row.payment_id,
        p_mode: mode,
      });
      if (result.error) throw new PaymentError("Automatic review failed.");
      reviewed++;
    } catch {
      errors++;
    } finally {
      await db
        .from("payments")
        .update({ settlement_checked_at: new Date().toISOString() })
        .eq("payment_id", row.payment_id);
    }
  }
  return {
    reviewed,
    sent: 0,
    reconciled: 0,
    errors,
    refundsSubmitted,
    refundsReconciled: refundTracking.reconciled,
  };
}
