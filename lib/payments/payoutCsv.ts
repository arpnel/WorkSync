import { payoutStatusLabel } from "@/lib/payments/payoutHistory";

export type PayoutCsvRow = {
  transactionId: string;
  id: string;
  projectId: string;
  transferReference: string | null;
  createdAt: string;
  grossAmount: number | null;
  freelancerVatTaxableAmount: number | null;
  freelancerVatAmount: number | null;
  amount: number | null;
  withholdingBasis: number | null;
  withholdingRate: number | null;
  withholdingAmount: number | null;
  withholdingDate: string | null;
  withholdingRule: string | null;
  withholdingExemptionStatus: string | null;
  withholdingDeclarationId: string | null;
  withholdingDocumentId: string | null;
  freelancerVatDocumentId: string | null;
  freelancerVatRule: string | null;
  status: string;
  paidAt: string | null;
};

export type PayoutCsvFormat = "earnings-summary" | "payout-tax-records";

const earningsColumns = [
  "Created At", "Transaction ID", "Payout ID", "Project ID", "Gross Earnings (PHP)",
  "Freelancer VAT (PHP)", "Withholding Tax (PHP)", "Net Transfer Amount (PHP)",
  "Payout Status", "Transfer Reference", "Paid Status", "Confirmed At",
];

const detailedColumns = [
  "Transaction ID", "Payout ID", "Project ID", "Transfer Reference", "Created At",
  "Gross Earnings (PHP)", "Freelancer VAT Base (PHP)", "Freelancer VAT (PHP)", "Net Transfer Amount (PHP)",
  "Withholding Basis (PHP)", "Withholding Rate", "Withholding Amount (PHP)", "Withholding Date", "Withholding Rule",
  "Exemption Status", "Withholding Declaration ID", "Withholding Document ID", "VAT Document ID", "Freelancer VAT Rule",
  "Payout Status", "Paid Status", "Confirmed At",
];

function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (typeof value === "string" && /^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function isoTimestamp(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function label(value: string | null | undefined) {
  if (!value || value === "not recorded") return "";
  if (value === "not_applicable") return "Not applicable";
  return value.replaceAll("_", " ");
}

function paidStatus(row: PayoutCsvRow) {
  return row.paidAt ? "Confirmed" : "";
}

export function payoutCsvRows(rows: PayoutCsvRow[], format: PayoutCsvFormat) {
  if (format === "earnings-summary") {
    return [earningsColumns, ...rows.map((row) => [
      isoTimestamp(row.createdAt), row.transactionId, row.id, row.projectId,
      row.grossAmount, row.freelancerVatAmount, row.withholdingAmount, row.amount,
      payoutStatusLabel(row.status), row.transferReference, paidStatus(row), isoTimestamp(row.paidAt),
    ])];
  }
  return [detailedColumns, ...rows.map((row) => [
    row.transactionId, row.id, row.projectId, row.transferReference, isoTimestamp(row.createdAt),
    row.grossAmount, row.freelancerVatTaxableAmount, row.freelancerVatAmount, row.amount,
    row.withholdingBasis, row.withholdingRate == null ? "" : `${(row.withholdingRate * 100).toFixed(2)}%`,
    row.withholdingAmount, isoTimestamp(row.withholdingDate), row.withholdingRule,
    label(row.withholdingExemptionStatus), row.withholdingDeclarationId, row.withholdingDocumentId,
    row.freelancerVatDocumentId, row.freelancerVatRule, payoutStatusLabel(row.status), paidStatus(row), isoTimestamp(row.paidAt),
  ])];
}

export function buildPayoutCsv(rows: PayoutCsvRow[], format: PayoutCsvFormat) {
  return `\uFEFF${payoutCsvRows(rows, format).map((line) => line.map(csvCell).join(",")).join("\r\n")}`;
}

export function payoutCsvFilename(format: PayoutCsvFormat, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Manila",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  return format === "earnings-summary"
    ? `worksync-earnings-summary-${date}.csv`
    : `worksync-payout-tax-records-${date}.csv`;
}
