export function toNumberOrUndefined(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function computePrice({
  pricingMode,
  hourlyRate,
  fixedRate,
}: {
  pricingMode: "hourly" | "fixed";
  hourlyRate?: number;
  fixedRate?: number;
}): number {
  return pricingMode === "hourly"
    ? Number(hourlyRate ?? 0)
    : Number(fixedRate ?? 0);
}
