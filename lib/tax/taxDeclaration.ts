export const MIN_SUPPORTED_TAX_YEAR = 2024;

export function currentTaxYear() {
  return new Date().getUTCFullYear();
}

export function supportedTaxYears(currentYear = currentTaxYear()) {
  return Array.from(
    { length: Math.max(0, currentYear + 2 - MIN_SUPPORTED_TAX_YEAR) },
    (_, index) => currentYear + 1 - index,
  );
}

export function isSupportedTaxYear(value: unknown, currentYear = currentTaxYear()) {
  const year = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d{4}$/.test(value)
      ? Number(value)
      : Number.NaN;
  return Number.isInteger(year)
    && year >= MIN_SUPPORTED_TAX_YEAR
    && year <= currentYear + 1;
}

export function hasBlockingDeclaration(
  declarations: ReadonlyArray<{ tax_year: number; status: string }>,
  taxYear: number,
) {
  return declarations.some(
    (declaration) => declaration.tax_year === taxYear
      && (declaration.status === "pending" || declaration.status === "accepted"),
  );
}
