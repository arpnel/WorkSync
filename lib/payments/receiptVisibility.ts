export type ReceiptAudience = "client" | "freelancer" | "admin";

/** Returns only the tax fields appropriate for the authenticated receipt reader. */
export function receiptSnapshotForAudience(snapshotValue: unknown, audience: ReceiptAudience) {
  if (!snapshotValue || typeof snapshotValue !== "object" || Array.isArray(snapshotValue)) return snapshotValue;
  const snapshot = snapshotValue as Record<string, unknown>;
  if (audience === "admin") return snapshot;
  const taxLines = Array.isArray(snapshot.taxLines) ? snapshot.taxLines : [];
  if (audience === "client") {
    return {
      receiptAudience: "client",
      transactionDate: snapshot.transactionDate,
      projectDescription: snapshot.projectDescription,
      clientPayment: snapshot.clientPayment,
      clientServiceVatBase: snapshot.clientServiceVatBase,
      clientServiceVatRate: snapshot.clientServiceVatRate,
      clientServiceVat: snapshot.clientServiceVat,
      clientServiceVatClassification: snapshot.clientServiceVatClassification,
      clientServiceVatRule: snapshot.clientServiceVatRule,
      currency: snapshot.currency,
      paymentMethod: snapshot.paymentMethod,
      paymentReference: snapshot.paymentReference,
      checkoutReference: snapshot.checkoutReference,
      refunds: snapshot.refunds,
      client: snapshot.client && typeof snapshot.client === "object"
        ? { name: (snapshot.client as Record<string, unknown>).name }
        : snapshot.client,
      freelancer: snapshot.freelancer && typeof snapshot.freelancer === "object"
        ? { name: (snapshot.freelancer as Record<string, unknown>).name }
        : snapshot.freelancer,
      freelancerVatBase: snapshot.freelancerVatBase,
      freelancerVat: snapshot.freelancerVat,
      taxLines: taxLines.map((line) => {
        if (!line || typeof line !== "object") return {};
        const row = line as Record<string, unknown>;
        return { freelancerVatBase: row.freelancerVatBase, freelancerVatRate: row.freelancerVatRate, freelancerVat: row.freelancerVat, freelancerVatRule: row.freelancerVatRule };
      }),
      documentTypeLabel: snapshot.documentTypeLabel,
    };
  }
  return {
    receiptAudience: "freelancer",
    transactionDate: snapshot.transactionDate,
    projectDescription: snapshot.projectDescription,
    clientPayment: snapshot.clientPayment,
    clientServiceVatBase: snapshot.clientServiceVatBase,
    clientServiceVatRate: snapshot.clientServiceVatRate,
    clientServiceVat: snapshot.clientServiceVat,
    clientServiceVatClassification: snapshot.clientServiceVatClassification,
    clientServiceVatRule: snapshot.clientServiceVatRule,
    currency: snapshot.currency,
    paymentMethod: snapshot.paymentMethod,
    paymentReference: snapshot.paymentReference,
    checkoutReference: snapshot.checkoutReference,
    refunds: snapshot.refunds,
    client: snapshot.client && typeof snapshot.client === "object"
      ? { name: (snapshot.client as Record<string, unknown>).name }
      : snapshot.client,
    freelancer: snapshot.freelancer,
    serviceGrossEarnings: snapshot.serviceGrossEarnings,
    freelancerNetPayout: snapshot.freelancerNetPayout,
    withholding: snapshot.withholding,
    freelancerVatBase: snapshot.freelancerVatBase,
    freelancerVat: snapshot.freelancerVat,
    taxLines: taxLines.map((line) => {
      if (!line || typeof line !== "object") return {};
      const row = line as Record<string, unknown>;
      return { payoutId: row.payoutId, taxableBase: row.taxableBase, withholdingRate: row.withholdingRate, withholding: row.withholding, withholdingRule: row.withholdingRule, exemptionStatus: row.exemptionStatus, freelancerVatBase: row.freelancerVatBase, freelancerVatRate: row.freelancerVatRate, freelancerVat: row.freelancerVat, freelancerVatRule: row.freelancerVatRule, payoutStatus: row.payoutStatus, paidAt: row.paidAt, transferReference: row.transferReference };
    }),
    documentTypeLabel: snapshot.documentTypeLabel,
  };
}

export function receiptForAudience<T extends { snapshot?: unknown }>(receipt: T, audience: ReceiptAudience) {
  return { ...receipt, snapshot: receiptSnapshotForAudience(receipt.snapshot, audience) };
}
