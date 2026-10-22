/** Explicit, transaction-level Philippine tax calculations. No profile defaults are inferred. */
export const PH_VAT_RATE = 0.12;
export const PH_EMARKETPLACE_WITHHOLDING_RATE = 0.005;
export const PH_GROSS_REMITTANCE_THRESHOLD = 500_000;

export type VatPricing = "inclusive" | "exclusive";

export function calculateVat(amount: number, pricing: VatPricing, applies: boolean) {
  if (!Number.isFinite(amount) || amount < 0)
    throw new Error("Taxable amount must be a non-negative finite number.");
  const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  if (!applies)
    return { taxableAmount: cents(amount), vatAmount: 0, total: cents(amount), pricing, applies: false };
  if (pricing === "inclusive") {
    const taxableAmount = cents(amount / (1 + PH_VAT_RATE));
    return { taxableAmount, vatAmount: cents(amount - taxableAmount), total: cents(amount), pricing, applies: true };
  }
  const taxableAmount = cents(amount);
  const vatAmount = cents(taxableAmount * PH_VAT_RATE);
  return { taxableAmount, vatAmount, total: cents(taxableAmount + vatAmount), pricing, applies: true };
}

export type WithholdingExemption = "none" | "submitted_pending_review" | "accepted" | "accepted_threshold_exceeded" | "rejected";

export function calculateMarketplaceWithholding(input: {
  grossRemittance: number;
  applicable: boolean;
  exemption: WithholdingExemption;
  priorAnnualGrossRemittances: number;
}) {
  const { grossRemittance, priorAnnualGrossRemittances, applicable, exemption } = input;
  if (![grossRemittance, priorAnnualGrossRemittances].every(Number.isFinite) || grossRemittance < 0 || priorAnnualGrossRemittances < 0)
    throw new Error("Withholding basis must be non-negative and finite.");
  const annualThresholdReached = priorAnnualGrossRemittances + grossRemittance > PH_GROSS_REMITTANCE_THRESHOLD;
  const acceptedBelowThreshold = exemption === "accepted" && !annualThresholdReached;
  const basis = applicable && !acceptedBelowThreshold ? grossRemittance : 0;
  const amount = Math.round((basis * PH_EMARKETPLACE_WITHHOLDING_RATE + Number.EPSILON) * 100) / 100;
  return {
    applicable,
    basis,
    rate: applicable ? PH_EMARKETPLACE_WITHHOLDING_RATE : 0,
    amount,
    exemptionStatus: exemption === "accepted" && annualThresholdReached ? "threshold_crossed" : exemption,
    rule: "PH RR 5-2025; RR 16-2023 as clarified by RMC 8-2024",
  };
}

export function calculateFreelancerPayout(grossEarnings: number, withholdingAmount: number) {
  if (![grossEarnings, withholdingAmount].every(Number.isFinite) || grossEarnings < 0 || withholdingAmount < 0 || withholdingAmount > grossEarnings)
    throw new Error("Invalid payout calculation.");
  return Math.round((grossEarnings - withholdingAmount + Number.EPSILON) * 100) / 100;
}
