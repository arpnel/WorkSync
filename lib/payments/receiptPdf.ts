export type ReceiptTaxLine = {
  payoutId: string;
  taxableBase: number;
  withholdingRate: number;
  withholding: number;
  withholdingRule: string;
  exemptionStatus: string;
  freelancerVatBase: number;
  freelancerVatRate: number;
  freelancerVat: number;
  freelancerVatRule: string;
  payoutStatus?: string;
  paidAt?: string | null;
  transferReference?: string | null;
  withholdingDocumentId?: string | null;
  withholdingDeclarationId?: string | null;
  freelancerVatDocumentId?: string | null;
};
export type ReceiptRefund = {
  refundId: string;
  amount: number;
  status: string;
  refundedAt: string | null;
  providerReference?: string | null;
};
export type ReceiptDetails = {
  audience?: "client" | "freelancer" | "admin";
  receiptNumber: string;
  receiptIssuedAt?: string;
  correctionReason?: string;
  correctionDifferences?: Record<string, { previous: unknown; current: unknown }>;
  documentType: string;
  project: string;
  transactionType?: "project" | "service";
  amount: number;
  clientServiceVatBase?: number | null;
  clientServiceVatRate?: number | null;
  clientServiceVat?: number | null;
  clientServiceVatRule?: string | null;
  paidAt: string | null;
  paymentMethod: string;
  paymentReference?: string | null;
  checkoutReference?: string | null;
  refunds?: ReceiptRefund[];
  clientName: string;
  clientRegisteredName?: string | null;
  freelancerName: string;
  freelancerRegisteredName?: string | null;
  worksyncRegisteredName?: string | null;
  worksyncTaxRegistrationDetails?: string | null;
  serviceGrossEarnings: number | null;
  freelancerNetPayout: number | null;
  withholding: number;
  freelancerVatBase: number;
  freelancerVat: number;
  platformServiceFee: number | null;
  platformVatBase: number | null;
  platformVatRate?: number | null;
  platformVat: number | null;
  platformTaxTreatment?: string;
  platformTaxNote?: string;
  taxLines: ReceiptTaxLine[];
  logoJpeg?: Uint8Array;
  logoWidth?: number;
  logoHeight?: number;
};
const php = (amount: number) => `PHP ${Number(amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const helveticaWidths: Record<string, number> = {
  A: 722, B: 667, C: 667, D: 722, E: 611, F: 556, G: 722, H: 722, I: 278, J: 556, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 333, g: 556, h: 556, i: 278, j: 278, k: 556, l: 278, m: 833, n: 556, o: 556, p: 556, q: 556, r: 444, s: 500, t: 333, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556, " ": 278, "-": 333, "/": 278, ".": 278, ",": 278, ":": 333, "(": 333, ")": 333,
};
const pdfTextWidth = (value: string, size: number) => Array.from(value).reduce((width, character) => width + (helveticaWidths[character] ?? 556), 0) * size / 1000;
function pdfText(value: string) {
  return value.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}
function wrap(value: string, width = 86) {
  const words = value.split(/\s+/).flatMap(word => word.match(new RegExp(".{1," + width + "}", "g")) ?? [word]); const lines: string[] = []; let line = "";
  for (const word of words) { if (!line) line = word; else if ((line + " " + word).length <= width) line += " " + word; else { lines.push(line); line = word; } }
  if (line) lines.push(line); return lines.length ? lines : [""];
}
export function receiptDetailsFromSnapshot(receipt: { receipt_number: string; issued_at: string; snapshot: Record<string, unknown> }): ReceiptDetails {
  const snapshot = receipt.snapshot as Record<string, unknown>;
  const client = snapshot.client as Record<string, unknown> | undefined;
  const freelancer = snapshot.freelancer as Record<string, unknown> | undefined;
  const workSync = snapshot.workSync as Record<string, unknown> | undefined;
  const taxLines = Array.isArray(snapshot.taxLines) ? snapshot.taxLines as ReceiptTaxLine[] : [];
  const numeric = (key: string) => Number(snapshot[key] ?? 0);
  const optionalNumeric = (key: string) => snapshot[key] == null || !Number.isFinite(Number(snapshot[key])) ? null : Number(snapshot[key]);
  return {
    audience: snapshot.receiptAudience === "client" || snapshot.receiptAudience === "freelancer" ? snapshot.receiptAudience : "admin",
    receiptNumber: receipt.receipt_number,
    receiptIssuedAt: receipt.issued_at,
    correctionReason: typeof snapshot.correctionReason === "string" ? snapshot.correctionReason : undefined,
    correctionDifferences: snapshot.differences && typeof snapshot.differences === "object" ? snapshot.differences as Record<string, { previous: unknown; current: unknown }> : undefined,
    documentType: String(snapshot.documentTypeLabel ?? "WorkSync system-generated transaction receipt"),
    project: String(snapshot.projectDescription ?? "Project or service"),
    transactionType: snapshot.transactionType === "service" ? "service" : "project",
    amount: numeric("clientPayment"), paidAt: typeof snapshot.transactionDate === "string" ? snapshot.transactionDate : null,
    clientServiceVatBase: optionalNumeric("clientServiceVatBase"),
    clientServiceVatRate: optionalNumeric("clientServiceVatRate"),
    clientServiceVat: optionalNumeric("clientServiceVat"),
    clientServiceVatRule: typeof snapshot.clientServiceVatRule === "string" ? snapshot.clientServiceVatRule : null,
    paymentMethod: String(snapshot.paymentMethod ?? "Not recorded"),
    paymentReference: typeof snapshot.paymentReference === "string" ? snapshot.paymentReference : null,
    checkoutReference: typeof snapshot.checkoutReference === "string" ? snapshot.checkoutReference : null,
    refunds: Array.isArray(snapshot.refunds) ? snapshot.refunds as ReceiptRefund[] : [],
    clientName: String(client?.name ?? "Client"), clientRegisteredName: client?.registeredName == null ? null : String(client.registeredName),
    freelancerName: String(freelancer?.name ?? "Freelancer"), freelancerRegisteredName: freelancer?.registeredName == null ? null : String(freelancer.registeredName),
    worksyncRegisteredName: workSync?.registeredName == null ? null : String(workSync.registeredName), worksyncTaxRegistrationDetails: workSync?.taxRegistrationDetails == null ? null : String(workSync.taxRegistrationDetails),
    serviceGrossEarnings: optionalNumeric("serviceGrossEarnings"), freelancerNetPayout: optionalNumeric("freelancerNetPayout"), withholding: numeric("withholding"),
    freelancerVatBase: numeric("freelancerVatBase"), freelancerVat: numeric("freelancerVat"),
    platformServiceFee: snapshot.platformServiceFee == null ? null : Number(snapshot.platformServiceFee),
    platformVatBase: snapshot.platformVatBase == null ? null : Number(snapshot.platformVatBase), platformVatRate: snapshot.platformVatRate == null ? null : Number(snapshot.platformVatRate), platformVat: snapshot.platformVat == null ? null : Number(snapshot.platformVat), platformTaxTreatment: snapshot.platformTaxTreatment == null || snapshot.platformTaxTreatment === "not_configured" ? undefined : String(snapshot.platformTaxTreatment),
    platformTaxNote: typeof snapshot.platformTaxNote === "string" ? snapshot.platformTaxNote : undefined, taxLines,
  };
}
export function createReceiptPdf(details: ReceiptDetails) {
  const pages: string[][] = [[]]; let page = pages[0]; let y = 752;
  const watermark = () => page.push("q /WMGS gs 0.08 0.43 0.36 rg BT /F2 48 Tf 0.866 0.5 -0.5 0.866 126 348 Tm (WorkSync) Tj ET Q");
  watermark();
  const nextPage = () => { page = []; pages.push(page); watermark(); y = 752; };
  const put = (value: string, x: number, baseline: number, size = 10, bold = false, color = "0.16 0.20 0.25") => {
    page.push("BT /" + (bold ? "F2" : "F1") + " " + size + " Tf " + color + " rg " + x + " " + baseline + " Td (" + pdfText(value) + ") Tj ET");
  };
  const putRight = (value: string, baseline: number, size = 10, bold = false, color = "0.16 0.20 0.25") => {
    wrap(value, 40).forEach((line, index) => put(line, 558 - pdfTextWidth(line, size), baseline - index * (size + 4), size, bold, color));
    return wrap(value, 40).length;
  };
  const putLeftLines = (value: string, x: number, baseline: number, size = 9, bold = false, color = "0.39 0.43 0.48", width = 74) => {
    const lines = wrap(value, width); lines.forEach((line, index) => put(line, x, baseline - index * (size + 4), size, bold, color)); return lines.length;
  };
  const line = (baseline: number, color = "0.86 0.89 0.91") => page.push(color + " RG 54 " + baseline + " m 558 " + baseline + " l S");
  const box = (x: number, bottom: number, width: number, height: number, fill: string, stroke: string) => page.push("q " + fill + " rg " + x + " " + bottom + " " + width + " " + height + " re f " + stroke + " RG " + x + " " + bottom + " " + width + " " + height + " re S Q");
  const section = (label: string) => { put(isClient ? label : label.toUpperCase(), 54, y, 10, true, "0.18 0.24 0.31"); y -= 20; };

  const isFreelancer = details.audience === "freelancer";
  const isClient = details.audience === "client";
  const headlineAmount = isFreelancer ? details.freelancerNetPayout : details.amount;
  put("WorkSync", details.logoJpeg ? 104 : 54, 750, 14, true, "0.10 0.20 0.34");
  if (details.logoJpeg) page.push("q 44 0 0 40 54 725 cm /Im1 Do Q");
  putRight(isFreelancer ? "FREELANCER PAYOUT STATEMENT" : "PAYMENT RECEIPT", 750, isFreelancer ? 13 : 16, true, "0.08 0.11 0.16");
  if (isClient) {
    putRight("Paid", 729, 9, true, "0.12 0.48 0.28");
    putRight(details.paidAt ? new Date(details.paidAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }) : "Date not recorded", 715, 8, false, "0.39 0.43 0.48");
    put("Receipt No.", 54, 729, 8, false, "0.39 0.43 0.48");
    const receiptLines = wrap(details.receiptNumber, 32);
    receiptLines.forEach((value, index) => put(value, 54, 715 - index * 12, 8, true, "0.13 0.16 0.20"));
    const totalLabelY = Math.min(672, 703 - (receiptLines.length - 1) * 12 - 20);
    put("Total paid", 54, totalLabelY, 9, false, "0.39 0.43 0.48");
    put(headlineAmount == null ? "Not recorded" : php(headlineAmount), 54, totalLabelY - 24, 18, true, "0.08 0.11 0.16");
    y = totalLabelY - 57;
  }
  if (!isClient) {
    box(54, 636, 504, 76, "0.97 0.99 0.98", "0.87 0.91 0.89");
    put(isFreelancer ? "NET PAYOUT TO FREELANCER" : "TOTAL PAID BY CLIENT", 72, 690, 9, true, "0.39 0.43 0.48");
    put(headlineAmount == null ? "Not recorded" : php(headlineAmount), 72, 665, 20, true, "0.08 0.11 0.16");
    put(details.paidAt ? new Date(details.paidAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) : "Payment date not recorded", 72, 647, 8, false, "0.39 0.43 0.48");
    y = 610;
  }
  const detail = (label: string, value: string, divider = true) => {
    const count = putRight(value, y, 9, true, "0.13 0.16 0.20");
    put(label, 54, y, 9, false, "0.34 0.39 0.44");
    y -= Math.max(21, count * 13);
    if (divider) { line(y + 7); y -= 6; }
  };
  if (!isClient) {
    section("Transaction details");
    if (isFreelancer) {
      put("Receipt number", 54, y, 8, false, "0.39 0.43 0.48");
      y -= 13;
      const receiptLines = putLeftLines(details.receiptNumber, 54, y, 9, true, "0.13 0.16 0.20", 86);
      y -= receiptLines * 13 + 8;
    } else detail("Receipt number", details.receiptNumber);
    detail("Project / Service", details.project, !isFreelancer);
    detail("Payment method", details.paymentMethod, !isFreelancer);
    if (!isFreelancer && details.paymentReference) detail("PayMongo payment reference", details.paymentReference);
    if (!isFreelancer && details.checkoutReference) detail("PayMongo checkout reference", details.checkoutReference);
    detail("Client", details.clientName + (details.clientRegisteredName ? " (" + details.clientRegisteredName + ")" : ""), !isFreelancer);
    detail("Freelancer", details.freelancerName + (details.freelancerRegisteredName ? " (" + details.freelancerRegisteredName + ")" : ""), !isFreelancer);
    y -= 8;
    if (isFreelancer) { line(y); y -= 22; }
  }
  if (!isClient && !isFreelancer) section("Payment breakdown");
  const taxNotes = details.taxLines.map((taxLine, index) => {
    const notes = [];
    if (taxLine.freelancerVat > 0) notes.push((details.audience === "client" ? "VAT included in service price: " : "Freelancer VAT: ") + php(taxLine.freelancerVat) + " (" + (taxLine.freelancerVatRate * 100).toFixed(2) + "% of " + php(taxLine.freelancerVatBase) + (details.audience === "client" ? "" : "; " + taxLine.freelancerVatRule) + ")");
    else if (details.audience !== "client") notes.push("Freelancer VAT: none recorded");
    if (details.audience === "client") return "Payout " + (index + 1) + ": " + (notes.length ? notes.join("; ") : "VAT breakdown not recorded");
    if (taxLine.withholding > 0) notes.push("Marketplace withholding: " + php(taxLine.withholding) + " (" + (taxLine.withholdingRate * 100).toFixed(2) + "% of " + php(taxLine.taxableBase) + "; " + taxLine.withholdingRule + "; " + taxLine.exemptionStatus + ")");
    else if (details.audience === "admin") notes.push("Marketplace withholding: none recorded (" + taxLine.withholdingRule + "; " + taxLine.exemptionStatus + ")");
    return "Payout " + (index + 1) + ": " + notes.join("; ");
  });
  const taxRowHeight = !details.taxLines.length || details.taxLines.length > 4 ? 39 : Math.max(52, Math.ceil(taxNotes.join(" | ").length / 68) * 13 + 25);
  const platformVatHeight = details.platformVat != null ? 39 : (details.platformTaxNote ? 48 : 0);
  const breakdownHeight = details.audience === "freelancer"
      ? 39 + (details.freelancerVat > 0 ? 39 : 0) + 39 + 39
      : 36 + 39 + taxRowHeight + platformVatHeight;
  if (!isClient && !isFreelancer) box(54, y - breakdownHeight - 5, 504, breakdownHeight + 12, "1 1 1", "0.87 0.89 0.91");
  const breakdownLeft = isClient || isFreelancer ? 54 : 70;
  const breakdownRow = (label: string, note: string, value: string, height = 39, divider = true) => {
    put(label, breakdownLeft, y, 10, true, "0.13 0.16 0.20");
    if (note) putLeftLines(note, breakdownLeft, y - 13, 8, false, "0.39 0.43 0.48", 68);
    if (value) putRight(value, y - 2, 9, false, "0.29 0.34 0.40");
    y -= height;
    if (divider) line(y + 1, "0.90 0.92 0.94");
  };
  if (isClient) {
    const savedPayoutVatBase = details.taxLines.reduce((total, row) => total + row.freelancerVatBase, 0);
    const savedPayoutVat = details.taxLines.reduce((total, row) => total + row.freelancerVat, 0);
    const feeBase = details.clientServiceVatBase ?? (details.taxLines.length ? savedPayoutVatBase : null);
    const vatAmount = details.clientServiceVat ?? (details.taxLines.length ? savedPayoutVat : null);
    const vatRate = details.clientServiceVatRate ?? details.taxLines[0]?.freelancerVatRate ?? (feeBase && vatAmount != null ? vatAmount / feeBase : null);
    if (feeBase != null) {
      const vatLabel = vatRate == null
        ? "VAT"
        : `VAT (${(vatRate * 100).toFixed(0)}%)`;
      breakdownRow(details.transactionType === "service" ? "Service Fee" : "Project Fee", "", php(feeBase), 25);
      if (vatAmount != null) breakdownRow(vatLabel, "", php(vatAmount), 25);
    } else {
      breakdownRow(details.transactionType === "service" ? "Service Fee" : "Project Fee", "", php(details.amount), 25);
    }
    y -= 8;
    line(y);
    y -= 22;
    section("Transaction Details");
    const clientDetail = (label: string, value: string) => {
      put(label, 54, y, 8, false, "0.39 0.43 0.48");
      putRight(value, y, 9, false, "0.13 0.16 0.20");
      y -= 22;
    };
    clientDetail("Project / Service", details.project);
    clientDetail("Client", details.clientName);
    clientDetail("Freelancer", details.freelancerName);
    clientDetail("Payment method", details.paymentMethod);
    clientDetail("Payment date", details.paidAt ? new Date(details.paidAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) : "Not recorded");
    y -= 4;
    line(y);
    y -= 22;
    section("Transaction Reference");
    const reference = (label: string, value?: string | null) => {
      if (!value) return;
      put(label, 54, y, 8, false, "0.39 0.43 0.48");
      y -= 13;
      const lines = putLeftLines(value, 54, y, 8, false, "0.13 0.16 0.20", 86);
      y -= lines * 12 + 8;
    };
    reference("PayMongo Payment ID", details.paymentReference);
    reference("Checkout Session ID", details.checkoutReference);
    y -= 4;
    line(y);
    y -= 14;
  } else if (details.audience === "freelancer") {
    section("Payout breakdown");
    breakdownRow("Gross Earnings", "Earnings before withholding tax.", details.serviceGrossEarnings == null ? "Not recorded" : php(details.serviceGrossEarnings), 48, false);
    breakdownRow("Withholding Tax", "Tax withheld from freelancer earnings.", details.taxLines.length ? php(details.withholding) : "Not recorded", 48, false);
    const payoutStatuses = [...new Set(details.taxLines.map(line => line.payoutStatus).filter((status): status is string => Boolean(status)))];
    const netPayoutNote = "Final payout amount." + (payoutStatuses.length ? " Transfer status: " + payoutStatuses.join(", ") + "." : "");
    breakdownRow("Net Payout Amount", netPayoutNote, details.freelancerNetPayout == null ? "Not recorded" : php(details.freelancerNetPayout), 48, false);
    y -= 3;
    line(y);
    y -= 22;
    section("Payment references");
    const payoutReference = (label: string, value?: string | null) => {
      if (!value) return;
      put(label, 54, y, 8, false, "0.39 0.43 0.48");
      y -= 13;
      const lines = putLeftLines(value, 54, y, 9, false, "0.13 0.16 0.20", 86);
      y -= lines * 13 + 9;
    };
    payoutReference("PayMongo payment reference", details.paymentReference);
    payoutReference("PayMongo checkout reference", details.checkoutReference);
    y -= 3;
    line(y);
    y -= 18;
  } else {
    breakdownRow("Client payment", "", php(details.amount), 36);
    breakdownRow("WorkSync service fee", details.platformServiceFee == null ? "Fee details not recorded" : "", details.platformServiceFee == null ? "Not available" : php(details.platformServiceFee), 39);
    if (details.platformVat != null) breakdownRow("WorkSync platform VAT", details.platformVatRate == null ? "Saved platform VAT amount" : (details.platformVatRate * 100).toFixed(2) + "% of " + php(details.platformVatBase ?? 0) + (details.platformTaxTreatment ? "; " + details.platformTaxTreatment : ""), php(details.platformVat), 39);
    else if (details.platformTaxNote) breakdownRow("WorkSync platform tax", details.platformTaxNote, "", 48);
    if (!details.taxLines.length) breakdownRow("Payout tax breakdown", "No payout tax calculation saved yet", "Pending", 39);
    else if (details.taxLines.length <= 4) breakdownRow("Payout tax breakdown", taxNotes.join(" | "), "", taxRowHeight);
    else breakdownRow("Payout tax breakdown", "Detailed payout tax breakdown follows", "", 39);
  }
  if (details.refunds?.length) {
    y -= 4;
    section("Refunds and adjustments");
    for (const refund of details.refunds) {
      const metadata = [
        refund.refundedAt ? "confirmed " + new Date(refund.refundedAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" }) : "",
        refund.providerReference ? "reference " + refund.providerReference : "",
      ].filter(Boolean).join("; ");
      detail("Refund " + refund.status.replaceAll("_", " "), php(refund.amount) + (metadata ? " (" + metadata + ")" : ""));
    }
    const confirmedTotal = details.refunds.filter(refund => refund.status === "refunded").reduce((sum, refund) => sum + refund.amount, 0);
    if (confirmedTotal > 0) {
      detail("Confirmed refund total", php(confirmedTotal));
      detail("Net after confirmed refunds", php(Math.max(0, details.amount - confirmedTotal)));
    }
  }
  y -= 20;  if (details.audience !== "client" && details.audience !== "freelancer" && details.taxLines.length > 4) {
    nextPage(); y = 720; section("Saved payout tax breakdown");
    details.taxLines.forEach((taxLine, index) => {
      if (y < 145) { nextPage(); y = 720; section("Saved payout tax breakdown"); }
      put("Payout " + (index + 1), 54, y, 9, true, "0.18 0.24 0.31"); y -= 14;
      const withholdingRate = (taxLine.withholdingRate * 100).toFixed(2) + "%";
      putLeftLines("Marketplace withholding: " + php(taxLine.withholding) + " = " + withholdingRate + " of " + php(taxLine.taxableBase) + "; " + taxLine.withholdingRule + "; " + taxLine.exemptionStatus, 70, y, 8, false, "0.39 0.43 0.48", 76); y -= 13;
      const vatRate = (taxLine.freelancerVatRate * 100).toFixed(2) + "%";
      putLeftLines("Freelancer VAT: " + php(taxLine.freelancerVat) + " = " + vatRate + " of " + php(taxLine.freelancerVatBase) + "; " + taxLine.freelancerVatRule, 70, y, 8, false, "0.39 0.43 0.48", 76); y -= 17;
      line(y + 5);
    });
  }
  if (details.audience !== "client" && details.correctionReason) {
    section("Receipt correction");
    const correctionLines = ["Reason: " + details.correctionReason, ...(details.correctionDifferences ? Object.entries(details.correctionDifferences).map(([field, values]) => "Changed " + field + ": " + JSON.stringify(values.previous) + " -> " + JSON.stringify(values.current)) : []), "Receipt issued " + (details.receiptIssuedAt ? new Date(details.receiptIssuedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) : "Not recorded")];
    const wrappedCorrection = correctionLines.flatMap(value => wrap(value, 85)); const correctionHeight = wrappedCorrection.length * 13 + 16;
    if (y - correctionHeight < 108) nextPage();
    box(54, y - correctionHeight, 504, correctionHeight, "0.99 0.98 1", "0.91 0.86 0.97");
    wrappedCorrection.forEach((value, index) => put(value, 66, y - 14 - index * 13, 8, false, "0.30 0.26 0.39"));
    y -= correctionHeight + 16;
  } else if (!isClient) {
    put((isFreelancer ? "Statement issued " : "Receipt issued ") + (details.receiptIssuedAt ? new Date(details.receiptIssuedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) : "Not recorded"), 54, y, 8, false, "0.39 0.43 0.48");
    y -= 18;
  }
  if (y < 105) nextPage();
  if (isClient) line(82);
  else page.push("0.84 0.88 0.91 RG [2 3] 0 d 54 82 m 558 82 l S [] 0 d");
  if (isClient) {
    const footerNote = "System-generated receipt.";
    const issuedAt = "Issued " + (details.receiptIssuedAt ? new Date(details.receiptIssuedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) : "Not recorded");
    put(footerNote, (612 - pdfTextWidth(footerNote, 8)) / 2, 64, 8, false, "0.39 0.43 0.48");
    put(issuedAt, (612 - pdfTextWidth(issuedAt, 8)) / 2, 50, 8, false, "0.39 0.43 0.48");
  } else {
    if (isFreelancer) {
      put("This is a WorkSync system-generated payout statement,", 78, 64, 8, false, "0.39 0.43 0.48");
      put("not an official BIR invoice or receipt.", 78, 52, 8, false, "0.39 0.43 0.48");
    } else {
      put("This is a WorkSync system-generated transaction receipt,", 78, 64, 8, false, "0.39 0.43 0.48");
      put("not an official BIR invoice or receipt.", 78, 52, 8, false, "0.39 0.43 0.48");
    }
  }
  const encoder = new TextEncoder(); const objects: string[] = [];
  const pageIds = pages.map((_, index) => 3 + index); const regularId = 3 + pages.length; const boldId = regularId + 1; const imageId = details.logoJpeg ? boldId + 1 : null; const watermarkId = (imageId ?? boldId) + 1; const contentIds = pages.map((_, index) => watermarkId + 1 + index);
  objects.push("<< /Type /Catalog /Pages 2 0 R >>"); objects.push("<< /Type /Pages /Kids [" + pageIds.map(id => id + " 0 R").join(" ") + "] /Count " + pages.length + " >>");
  pages.forEach((_, index) => objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 " + regularId + " 0 R /F2 " + boldId + " 0 R >>" + (imageId ? " /XObject << /Im1 " + imageId + " 0 R >>" : "") + " /ExtGState << /WMGS " + watermarkId + " 0 R >> >> /Contents " + contentIds[index] + " 0 R >>"));
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  if (imageId && details.logoJpeg) { const hex = Array.from(details.logoJpeg).map(byte => byte.toString(16).padStart(2, "0")).join("") + ">"; objects.push("<< /Type /XObject /Subtype /Image /Width " + (details.logoWidth ?? 305) + " /Height " + (details.logoHeight ?? 277) + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length " + hex.length + " >>\nstream\n" + hex + "\nendstream"); }
  objects.push("<< /Type /ExtGState /ca 0.08 /CA 0.08 >>");
  pages.forEach(commands => { const stream = commands.join("\n") + "\n"; objects.push("<< /Length " + encoder.encode(stream).length + " >>\nstream\n" + stream + "endstream"); });
  let pdf = "%PDF-1.4\n"; const offsets = [0]; objects.forEach((object, index) => { offsets.push(encoder.encode(pdf).length); pdf += (index + 1) + " 0 obj\n" + object + "\nendobj\n"; });
  const xrefOffset = encoder.encode(pdf).length; pdf += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n"; for (const offset of offsets.slice(1)) pdf += String(offset).padStart(10, "0") + " 00000 n \n";
  pdf += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF";
  return new Blob([pdf], { type: "application/pdf" });
}export function openReceiptPdf(details: ReceiptDetails, download = false) {
  const url = URL.createObjectURL(createReceiptPdf(details));
  if (download) { const link = document.createElement("a"); link.href = url; link.download = `worksync-receipt-${details.receiptNumber}.pdf`; link.click(); }
  else window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}





