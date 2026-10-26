/** Explicit, transaction-level Philippine tax calculations. No profile defaults are inferred. */
export const PH_VAT_RATE = 0.12;
export const PH_EMARKETPLACE_WITHHOLDING_RATE = 0.005;
export const PH_GROSS_REMITTANCE_THRESHOLD = 500_000;

export type VatPricing = "inclusive" | "exclusive";

const toCents = (amount: number) => {
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100)))
    throw new Error("Amount must be a non-negative finite PHP value with safe cent precision.");
  return Math.round((amount + Number.EPSILON) * 100);
};
const fromCents = (amount: number) => amount / 100;
const roundRatio = (numerator: number, denominator: number) =>
  Math.floor((numerator + denominator / 2) / denominator);

export function calculateVat(amount: number, pricing: VatPricing, applies: boolean) {
  const amountCents = toCents(amount);
  if (!applies)
    return { taxableAmount: fromCents(amountCents), vatAmount: 0, total: fromCents(amountCents), pricing, applies: false };
  if (pricing === "inclusive") {
    const taxableCents = roundRatio(amountCents * 100, 112);
    return { taxableAmount: fromCents(taxableCents), vatAmount: fromCents(amountCents - taxableCents), total: fromCents(amountCents), pricing, applies: true };
  }
  const vatCents = roundRatio(amountCents * 12, 100);
  return { taxableAmount: fromCents(amountCents), vatAmount: fromCents(vatCents), total: fromCents(amountCents + vatCents), pricing, applies: true };
}

export type WithholdingExemption = "none" | "submitted_pending_review" | "accepted" | "accepted_threshold_exceeded" | "rejected";

export function calculateMarketplaceWithholding(input: {
  grossRemittance: number;
  applicable: boolean;
  exemption: WithholdingExemption;
  priorAnnualGrossRemittances: number;
}) {
  const { grossRemittance, priorAnnualGrossRemittances, applicable, exemption } = input;
  const grossCents = toCents(grossRemittance);
  const priorCents = toCents(priorAnnualGrossRemittances);
  const annualThresholdReached = priorCents + grossCents > PH_GROSS_REMITTANCE_THRESHOLD * 100;
  const acceptedBelowThreshold = exemption === "accepted" && !annualThresholdReached;
  const basisCents = applicable && !acceptedBelowThreshold ? grossCents : 0;
  const amountCents = roundRatio(basisCents * 5, 1000);
  const basis = fromCents(basisCents);
  const amount = fromCents(amountCents);
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
  const grossCents = toCents(grossEarnings);
  const withholdingCents = toCents(withholdingAmount);
  if (withholdingCents > grossCents)
    throw new Error("Invalid payout calculation.");
  return fromCents(grossCents - withholdingCents);
}
