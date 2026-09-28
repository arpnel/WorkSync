import "server-only";
import { paymentDatabase, reconcilePayment } from "./paymentServer";
import {
  paymentId,
  paymentMode,
  paymongo,
  PaymentError,
} from "@/lib/payments/paymongo";
import {
  decryptDestination,
  payoutSource,
  transferRequest,
  verifiedTransferStatus,
  type ProviderTransfer,
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
}

export async function settleProjects() {
  const db = paymentDatabase();
  const mode = paymentMode();
  const source = payoutSource();
  let reviewed = 0,
    sent = 0,
    reconciled = 0,
    errors = 0;
  // Rotate through payments so an old project or missing destination cannot starve other work.
  const payments = await db
    .from("payments")
    .select(
      "payment_id,project_id,order_id,payer_id,amount,status,transaction_reference,payment_method",
    )
    .eq("status", "paid")
    .order("settlement_checked_at", { nullsFirst: true })
    .limit(25);
  if (payments.error)
    throw new PaymentError("Settlement storage is not ready.");
  for (const row of payments.data ?? []) {
    try {
      if (
        row.payment_id !== paymentId(row.project_id, mode) ||
        !row.transaction_reference
      )
        continue;
      await verifyFunding(db, row);
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
  const ready = await db
    .from("project_payouts")
    .select("payout_id,payment_id,amount,encrypted_destination")
    .eq("mode", mode)
    .eq("status", "ready")
    .order("updated_at")
    .limit(10);
  if (ready.error) throw new PaymentError("Payout queue unavailable.");
  for (const queued of ready.data ?? []) {
    let claimedId: string | null = null;
    try {
      const destination = decryptDestination(queued.encrypted_destination);
      if (
        destination.provider === "instapay" &&
        Number(queued.amount) > 50000
      ) {
        await db
          .from("project_payouts")
          .update({ status: "needs_review" })
          .eq("payout_id", queued.payout_id)
          .eq("status", "ready");
        continue;
      }
      const funding = await db
        .from("payments")
        .select(
          "payment_id,project_id,order_id,payer_id,amount,status,transaction_reference,payment_method",
        )
        .eq("payment_id", queued.payment_id)
        .single();
      if (funding.error || !funding.data)
        throw new PaymentError("Funding unavailable.");
      await verifyFunding(db, funding.data);
      const claim = await db.rpc("worksync_claim_payout", {
        p_id: queued.payout_id,
      });
      if (claim.error) throw new PaymentError("Payout claim failed.");
      const row = claim.data?.[0];
      if (!row) continue;
      claimedId = row.payout_id;
      // Persisted claim prevents another worker from sending this payout. Never retry an ambiguous POST automatically.
      const response = await transferRequest(
        "/v2/batch_transfers",
        {
          transfers: [
            {
              provider: destination.provider,
              amount: Math.round(Number(row.amount) * 100),
              currency: "PHP",
              purpose: "Disbursement",
              description: "WorkSync project payment",
              reference_number: row.payout_id,
              source_account: source,
              destination_account: {
                name: destination.name,
                number: destination.number,
                bic: destination.bic,
              },
            },
          ],
        },
        row.payout_id,
      );
      const transfer = response.data?.transfers?.[0] as
        | ProviderTransfer
        | undefined;
      if (!transfer || !response.data?.id)
        throw new PaymentError("Transfer response unavailable.");
      // Persist identifiers first, then independently retrieve settlement evidence below.
      verifiedTransferStatus(
        transfer,
        row.payout_id,
        Number(row.amount),
        destination,
      );
      const saved = await db
        .from("project_payouts")
        .update({
          status: "pending",
          provider_batch_id: response.data.id,
          provider_transfer_id: transfer.id,
          updated_at: new Date().toISOString(),
        })
        .eq("payout_id", row.payout_id)
        .eq("status", "processing");
      if (saved.error)
        throw new PaymentError("Transfer tracking could not be saved.");
      sent++;
    } catch {
      errors++;
      if (!claimedId)
        await db
          .from("project_payouts")
          .update({ updated_at: new Date().toISOString() })
          .eq("payout_id", queued.payout_id)
          .eq("status", "ready");
      if (claimedId)
        await db
          .from("project_payouts")
          .update({
            status: "needs_review",
            updated_at: new Date().toISOString(),
          })
          .eq("payout_id", claimedId)
          .eq("status", "processing");
    }
  }
  // A worker crash after claiming is ambiguous. Quarantine it; do not risk a second transfer.
  await db
    .from("project_payouts")
    .update({ status: "needs_review" })
    .eq("mode", mode)
    .eq("status", "processing")
    .lt("claimed_at", new Date(Date.now() - 30 * 60000).toISOString());
  const pending = await db
    .from("project_payouts")
    .select("*")
    .eq("mode", mode)
    .eq("status", "pending")
    .order("updated_at")
    .limit(25);
  if (pending.error) throw new PaymentError("Transfer tracking unavailable.");
  for (const row of pending.data ?? []) {
    try {
      const response = await transferRequest(
        `/v2/transfers/${encodeURIComponent(row.provider_transfer_id)}`,
      );
      if (response.data?.id !== row.provider_transfer_id)
        throw new PaymentError("Transfer identity mismatch.");
      const status = verifiedTransferStatus(
        response.data,
        row.payout_id,
        Number(row.amount),
        decryptDestination(row.encrypted_destination),
      );
      const result = await db
        .from("project_payouts")
        .update({
          status,
          paid_at: status === "paid" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("payout_id", row.payout_id)
        .eq("status", "pending");
      if (result.error)
        throw new PaymentError("Transfer status could not be saved.");
      reconciled++;
    } catch {
      errors++;
      await db
        .from("project_payouts")
        .update({ updated_at: new Date().toISOString() })
        .eq("payout_id", row.payout_id);
    }
  }
  return { reviewed, sent, reconciled, errors };
}
