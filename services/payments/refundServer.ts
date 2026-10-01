import "server-only";
import { paymentDatabase } from "./paymentServer";
import { paymentMode, PaymentError } from "@/lib/payments/paymongo";
import { transferRequest } from "@/lib/payments/payouts";
import { verifiedRefundStatus } from "@/lib/payments/refundEvidence";
type DB = ReturnType<typeof paymentDatabase>;

/** Caller has independently reconciled the paid checkout with no existing refunds. */
export async function refundCancelledPayment(
  db: DB,
  paymentId: string,
  providerPaymentId: string,
) {
  const mode = paymentMode();
  const claim = await db.rpc("worksync_claim_project_refund", {
    p_payment: paymentId,
    p_mode: mode,
  });
  if (claim.error) throw new PaymentError("Refund claim failed.");
  const row = claim.data?.[0];
  if (!row) return false;
  try {
    const cents = Math.round(Number(row.amount) * 100);
    if (
      row.payment_id !== paymentId ||
      row.mode !== mode ||
      row.status !== "processing" ||
      !Number.isSafeInteger(cents) ||
      cents < 100 ||
      Math.abs(Number(row.amount) * 100 - cents) > 0.00001
    )
      throw new PaymentError("Invalid refund reservation.");
    // Recheck after the database claim; a provider-side manual refund can race the first read.
    const funding = await transferRequest(
      `/v1/payments/${encodeURIComponent(providerPaymentId)}`,
    );
    const a = funding.data?.attributes;
    if (
      funding.data?.id !== providerPaymentId ||
      a?.status !== "paid" ||
      a.currency !== "PHP" ||
      a.livemode !== (mode === "live") ||
      a.disputed !== false ||
      !Number.isSafeInteger(a.amount) ||
      a.amount < cents ||
      !Array.isArray(a.refunds) ||
      a.refunds.length
    )
      throw new PaymentError("Refund funding requires review.");
    // Unknown and indirect-return methods (for example Brankas) require support;
    // a provider success for those does not establish a return to the customer.
    if (
      ![
        "card",
        "gcash",
        "grab_pay",
        "paymaya",
        "shopee_pay",
        "bpi",
        "billease",
        "qrph",
      ].includes(a.source?.type)
    )
      throw new PaymentError(
        "This payment method requires manual refund review.",
      );
    const response = await transferRequest("/v1/refunds", {
      data: {
        attributes: {
          amount: cents,
          payment_id: providerPaymentId,
          reason: "others",
          notes: `WorkSync cancellation refund ${row.refund_id}`,
        },
      },
    });
    const providerId = response.data?.id;
    if (typeof providerId !== "string" || !providerId.startsWith("ref_"))
      throw new PaymentError("Refund receipt unavailable.");
    // Save receipt before retrieval so an interrupted reconciliation remains recoverable.
    const saved = await db
      .from("project_refunds")
      .update({
        provider_refund_id: providerId,
        status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("refund_id", row.refund_id)
      .eq("status", "processing");
    if (saved.error)
      throw new PaymentError("Refund receipt could not be saved.");
    verifiedRefundStatus(response.data, {
      providerPaymentId,
      providerRefundId: providerId,
      amountCentavos: cents,
      live: mode === "live",
    });
    return true;
  } catch (error) {
    const saved = await db
      .from("project_refunds")
      .update({ status: "needs_review", updated_at: new Date().toISOString() })
      .eq("refund_id", row.refund_id)
      .in("status", ["processing", "pending"]);
    if (saved.error)
      throw new PaymentError(
        "Refund recovery tracking failed; reconcile the claimed refund.",
      );
    throw error;
  }
}

export async function reconcileRefunds(db: DB, stopAt: number) {
  const mode = paymentMode();
  const stale = await db
    .from("project_refunds")
    .update({ status: "needs_review" })
    .eq("mode", mode)
    .eq("status", "processing")
    .lt("claimed_at", new Date(Date.now() - 30 * 60000).toISOString());
  if (stale.error) throw new PaymentError("Refund recovery unavailable.");
  const pending = await db
    .from("project_refunds")
    .select("*")
    .eq("mode", mode)
    .eq("status", "pending")
    .order("updated_at")
    .limit(20);
  if (pending.error) throw new PaymentError("Refund tracking unavailable.");
  let reconciled = 0,
    errors = 0;
  for (const row of pending.data ?? []) {
    if (Date.now() >= stopAt) break;
    try {
      const payment = await db
        .from("payments")
        .select("provider_payment_id")
        .eq("payment_id", row.payment_id)
        .single();
      if (payment.error || !payment.data?.provider_payment_id)
        throw new PaymentError("Refund payment unavailable.");
      const response = await transferRequest(
        `/v1/refunds/${encodeURIComponent(row.provider_refund_id)}`,
      );
      const status = verifiedRefundStatus(response.data, {
        providerPaymentId: payment.data.provider_payment_id,
        providerRefundId: row.provider_refund_id,
        amountCentavos: Math.round(Number(row.amount) * 100),
        live: mode === "live",
      });
      const saved = await db
        .from("project_refunds")
        .update({
          status,
          refunded_at: status === "refunded" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("refund_id", row.refund_id)
        .eq("status", "pending");
      if (saved.error) throw new PaymentError("Refund reconciliation failed.");
      reconciled++;
    } catch {
      errors++;
      await db
        .from("project_refunds")
        .update({ updated_at: new Date().toISOString() })
        .eq("refund_id", row.refund_id)
        .eq("status", "pending");
    }
  }
  return { reconciled, errors };
}
