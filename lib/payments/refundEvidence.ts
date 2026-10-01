/** Provider evidence only. This module neither authorizes nor sends a refund. */
export interface RefundExpectation {
  providerPaymentId: string;
  amountCentavos: number;
  live: boolean;
  providerRefundId: string;
}

export function verifiedRefundStatus(
  value: unknown,
  expected: RefundExpectation,
) {
  if (
    !Number.isSafeInteger(expected.amountCentavos) ||
    expected.amountCentavos < 100
  )
    throw new Error("Invalid refund amount.");
  if (!value || typeof value !== "object")
    throw new Error("Refund evidence unavailable.");
  const row = value as Record<string, unknown>;
  const attributes = row.attributes;
  if (!attributes || typeof attributes !== "object")
    throw new Error("Refund evidence unavailable.");
  const a = attributes as Record<string, unknown>;
  if (
    !expected.providerRefundId ||
    !expected.providerPaymentId ||
    row.id !== expected.providerRefundId ||
    row.type !== "refund" ||
    a.payment_id !== expected.providerPaymentId ||
    a.amount !== expected.amountCentavos ||
    a.currency !== "PHP" ||
    a.livemode !== expected.live
  )
    throw new Error("Refund reconciliation mismatch.");
  if (a.status === "succeeded") return "refunded" as const;
  if (a.status === "failed") return "failed" as const;
  if (a.status === "pending" || a.status === "processing")
    return "pending" as const;
  throw new Error("Unknown refund status; reconciliation required.");
}
