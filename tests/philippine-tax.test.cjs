/* eslint-disable @typescript-eslint/no-require-imports -- Node TypeScript test harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const zlib = require("node:zlib");
function load(path, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, TextEncoder, Blob, ...globals });
  return exports;
}
const tax = load("lib/payments/philippineTax.ts");
const taxDeclaration = load("lib/tax/taxDeclaration.ts");
const payoutHistory = load("lib/payments/payoutHistory.ts");
const payoutCsv = load("lib/payments/payoutCsv.ts", { require: (id) => id === "@/lib/payments/payoutHistory" ? payoutHistory : null });
const same = (actual, expected) => assert.equal(JSON.stringify(actual), JSON.stringify(expected));

test("VAT-inclusive price is split without changing the amount paid", () => same(tax.calculateVat(112, "inclusive", true), { taxableAmount: 100, vatAmount: 12, total: 112, pricing: "inclusive", applies: true }));
test("VAT-exclusive price adds VAT only when explicitly applicable", () => {
  same(tax.calculateVat(100, "exclusive", true), { taxableAmount: 100, vatAmount: 12, total: 112, pricing: "exclusive", applies: true });
  same(tax.calculateVat(100, "exclusive", false), { taxableAmount: 100, vatAmount: 0, total: 100, pricing: "exclusive", applies: false });
});
test("VAT and withholding calculations round at cent precision without binary-float drift", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(tax.calculateVat(0.05, "exclusive", true))), { taxableAmount: 0.05, vatAmount: 0.01, total: 0.06, pricing: "exclusive", applies: true });
  assert.equal(tax.calculateMarketplaceWithholding({ grossRemittance: 1, applicable: true, exemption: "none", priorAnnualGrossRemittances: 0 }).amount, 0.01);
  assert.equal(tax.calculateFreelancerPayout(100.01, 0.01), 100);
  assert.throws(() => tax.calculateVat(Number.NaN, "exclusive", true), /Amount/);
  assert.throws(() => tax.calculateFreelancerPayout(1, 1.01), /Invalid payout/);
});
test("marketplace withholding uses 0.5% of applicable gross remittance", () => {
  const result = tax.calculateMarketplaceWithholding({ grossRemittance: 10_000, applicable: true, exemption: "none", priorAnnualGrossRemittances: 0 });
  assert.equal(result.basis, 10_000); assert.equal(result.rate, 0.005); assert.equal(result.amount, 50);
});
test("only an accepted declaration below the threshold exempts withholding in the calculation helper", () => {
  const accepted = tax.calculateMarketplaceWithholding({ grossRemittance: 10_000, applicable: true, exemption: "accepted", priorAnnualGrossRemittances: 100_000 });
  const pending = tax.calculateMarketplaceWithholding({ grossRemittance: 10_000, applicable: true, exemption: "submitted_pending_review", priorAnnualGrossRemittances: 100_000 });
  assert.equal(accepted.amount, 0); assert.equal(pending.amount, 50);
});
test("withholding applies on the remittance that reaches the threshold", () => {
  const result = tax.calculateMarketplaceWithholding({ grossRemittance: 1_000, applicable: true, exemption: "accepted", priorAnnualGrossRemittances: 500_000 });
  assert.equal(result.basis, 1_000); assert.equal(result.amount, 5); assert.equal(result.exemptionStatus, "threshold_crossed");
});
test("no withholding is calculated unless configured as applicable", () => {
  const result = tax.calculateMarketplaceWithholding({ grossRemittance: 10_000, applicable: false, exemption: "none", priorAnnualGrossRemittances: 0 });
  assert.equal(result.basis, 0); assert.equal(result.amount, 0);
});
test("net payout subtracts withholding only and rejects over-deduction", () => {
  assert.equal(tax.calculateFreelancerPayout(10_000, 50), 9_950);
  assert.throws(() => tax.calculateFreelancerPayout(10_000, 10_001));
});

test("withholding declaration years are defaulted from a supported dropdown range and validated strictly", () => {
  same(taxDeclaration.supportedTaxYears(2026), [2027, 2026, 2025, 2024]);
  assert.equal(taxDeclaration.isSupportedTaxYear("2026", 2026), true);
  assert.equal(taxDeclaration.isSupportedTaxYear(2027, 2026), true);
  assert.equal(taxDeclaration.isSupportedTaxYear("2023", 2026), false);
  assert.equal(taxDeclaration.isSupportedTaxYear("2028", 2026), false);
  assert.equal(taxDeclaration.isSupportedTaxYear("20x6", 2026), false);
  assert.equal(taxDeclaration.isSupportedTaxYear("0", 2026), false);
});

test("withholding declarations block duplicate pending or accepted years and permit corrected resubmissions", () => {
  const forYear = (status) => [{ tax_year: 2026, status }];
  assert.equal(taxDeclaration.hasBlockingDeclaration(forYear("pending"), 2026), true);
  assert.equal(taxDeclaration.hasBlockingDeclaration(forYear("accepted"), 2026), true);
  assert.equal(taxDeclaration.hasBlockingDeclaration(forYear("rejected"), 2026), false);
  assert.equal(taxDeclaration.hasBlockingDeclaration(forYear("revoked"), 2026), false);
  assert.equal(taxDeclaration.hasBlockingDeclaration(forYear("accepted"), 2025), false);
});

test("declaration UI, submission API, and admin acceptance confirm the selected tax year", () => {
  const declarationUi = fs.readFileSync("components/account/FreelancerTaxDeclaration.tsx", "utf8");
  const declarationApi = fs.readFileSync("app/api/tax-declarations/route.ts", "utf8");
  const adminUi = fs.readFileSync("components/admin/TaxDeclarationReview.tsx", "utf8");
  const adminApi = fs.readFileSync("app/api/admin/tax-declarations/route.ts", "utf8");
  assert.match(declarationUi, /useState\(String\(currentTaxYear\(\)\)\)/);
  assert.match(declarationUi, /StyledSelect id="tax-declaration-year"/);
  assert.match(declarationUi, /The tax year is the period covered/);
  assert.match(declarationApi, /\.in\("status", \["pending", "accepted"\]\)/);
  assert.match(adminUi, /confirmed that it declares tax year/);
  assert.match(adminApi, /body\.taxYearConfirmed !== true/);
  assert.match(adminApi, /reviewer confirmed the BIR document declares tax year/);
});
test("payout history searches available IDs and sorts newest or oldest", () => {
  const rows = [
    { id: "p1", transactionId: "payment-a", transferReference: "ref-a", status: "paid", createdAt: "2026-02-01T17:00:00.000Z" },
    { id: "p2", transactionId: "payment-b", transferReference: null, status: "processing", createdAt: "2026-02-01T10:00:00.000Z" },
    { id: "p3", transactionId: "payment-c", transferReference: "ref-c", status: "ready", createdAt: "2026-01-31T16:00:00.000Z" },
    { id: "p4", transactionId: "payment-d", transferReference: null, status: "needs_review", createdAt: "2026-02-02T02:00:00.000Z" },
  ];
  const filters = (overrides = {}) => ({ search: "", sortOrder: "newest", ...overrides });
  assert.deepEqual(payoutHistory.filterPayoutHistory(rows, filters()).map((row) => row.id), ["p4", "p1", "p2", "p3"]);
  assert.deepEqual(payoutHistory.filterPayoutHistory(rows, filters({ sortOrder: "oldest" })).map((row) => row.id), ["p3", "p2", "p1", "p4"]);
  assert.deepEqual(payoutHistory.filterPayoutHistory(rows, filters({ search: "REF-C" })).map((row) => row.id), ["p3"]);
  assert.deepEqual(payoutHistory.filterPayoutHistory(rows, filters({ search: "payment-b" })).map((row) => row.id), ["p2"]);
  assert.deepEqual(payoutHistory.filterPayoutHistory(rows, filters({ search: "no-match" })), []);
  assert.equal(payoutHistory.payoutStatusGroup("pending"), "processing");
  assert.equal(payoutHistory.payoutStatusGroup("needs_review"), "needs_review");
});
test("payout history pagination returns bounded pages and supports empty results", () => {
  const rows = Array.from({ length: 23 }, (_, index) => index);
  assert.deepEqual(payoutHistory.paginatePayoutHistory(rows, 0, 10), rows.slice(0, 10));
  assert.deepEqual(payoutHistory.paginatePayoutHistory(rows, 2, 10), rows.slice(20, 23));
  assert.deepEqual(payoutHistory.paginatePayoutHistory([], 0, 10), []);
});
test("payout history keeps desktop table and mobile cards while CSV exports the authorized full dataset", () => {
  const page = fs.readFileSync("components/account/PayoutSettings.tsx", "utf8");
  const api = fs.readFileSync("app/api/payouts/route.ts", "utf8");
  assert.match(page, /hidden overflow-hidden rounded-xl border md:block/);
  assert.match(page, /space-y-3 md:hidden/);
  assert.match(page, /Earnings Summary CSV/);
  assert.match(page, /Detailed Payout &amp; Tax CSV/);
  assert.match(page, /payout-search/);
  assert.match(page, /payout-sort/);
  assert.doesNotMatch(page, /payout-from|payout-to|payout-status|Clear filters/);
  assert.match(page, /const rows = earnings\?\.payouts \?\? \[\]/);
  assert.match(api, /\.eq\("recipient_id", user\.id\)/);
  assert.match(api, /\.range\(from, from \+ 499\)/);
});
test("payout CSV exports have the requested columns, values, dates, and filenames", () => {
  const row = {
    transactionId: "payment-1", id: "payout-1", projectId: "project-1", transferReference: "transfer-1",
    createdAt: "2026-10-26T03:04:05.000Z", grossAmount: 100, freelancerVatTaxableAmount: 100,
    freelancerVatAmount: 0, amount: 99.5, withholdingBasis: 100, withholdingRate: 0.005,
    withholdingAmount: 0.5, withholdingDate: "2026-10-26T04:05:06.000Z", withholdingRule: "PH rule",
    withholdingExemptionStatus: "none", withholdingDeclarationId: "decl-1", withholdingDocumentId: "cor-1",
    freelancerVatDocumentId: null, freelancerVatRule: "not applicable", status: "paid", paidAt: "2026-10-26T05:06:07.000Z",
  };
  const summary = payoutCsv.payoutCsvRows([row], "earnings-summary");
  same(summary[0], ["Created At", "Transaction ID", "Payout ID", "Project ID", "Gross Earnings (PHP)", "Freelancer VAT (PHP)", "Withholding Tax (PHP)", "Net Transfer Amount (PHP)", "Payout Status", "Transfer Reference", "Paid Status", "Confirmed At"]);
  same(summary[1], ["2026-10-26T03:04:05.000Z", "payment-1", "payout-1", "project-1", 100, 0, 0.5, 99.5, "Paid", "transfer-1", "Confirmed", "2026-10-26T05:06:07.000Z"]);
  const detailed = payoutCsv.payoutCsvRows([row], "payout-tax-records");
  same(detailed[0], ["Transaction ID", "Payout ID", "Project ID", "Transfer Reference", "Created At", "Gross Earnings (PHP)", "Freelancer VAT Base (PHP)", "Freelancer VAT (PHP)", "Net Transfer Amount (PHP)", "Withholding Basis (PHP)", "Withholding Rate", "Withholding Amount (PHP)", "Withholding Date", "Withholding Rule", "Exemption Status", "Withholding Declaration ID", "Withholding Document ID", "VAT Document ID", "Freelancer VAT Rule", "Payout Status", "Paid Status", "Confirmed At"]);
  assert.equal(detailed[1][10], "0.50%");
  assert.equal(detailed[1][12], "2026-10-26T04:05:06.000Z");
  assert.equal(detailed[1][17], null);
  assert.equal(detailed[1][20], "Confirmed");
  assert.equal(payoutCsv.payoutCsvFilename("earnings-summary", new Date("2026-10-26T03:00:00Z")), "worksync-earnings-summary-2026-10-26.csv");
  assert.equal(payoutCsv.payoutCsvFilename("payout-tax-records", new Date("2026-10-26T03:00:00Z")), "worksync-payout-tax-records-2026-10-26.csv");
});
test("payout CSV keeps unknown confirmation fields blank and protects spreadsheet text", () => {
  const row = {
    transactionId: "payment-shared", id: "payout-2", projectId: "project-2", transferReference: '=HYPERLINK("bad")',
    createdAt: "2026-10-26T03:04:05Z", grossAmount: 50, freelancerVatTaxableAmount: null,
    freelancerVatAmount: null, amount: 50, withholdingBasis: null, withholdingRate: null,
    withholdingAmount: null, withholdingDate: null, withholdingRule: 'Rule, "quoted"',
    withholdingExemptionStatus: "not_applicable", withholdingDeclarationId: null, withholdingDocumentId: null,
    freelancerVatDocumentId: null, freelancerVatRule: "not recorded", status: "ready", paidAt: null,
  };
  const csv = payoutCsv.buildPayoutCsv([row], "payout-tax-records");
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"'=HYPERLINK\(""bad""\)"/);
  assert.match(csv, /"Rule, ""quoted"""/);
  assert.match(csv, /"Not applicable"/);
  assert.match(csv, /"Ready","",""/);
  assert.doesNotMatch(csv, /"Not confirmed"/);
  const secondMilestone = { ...row, id: "payout-3", projectId: "project-3" };
  const duplicateTransactionRows = payoutCsv.payoutCsvRows([row, secondMilestone], "earnings-summary");
  assert.equal(duplicateTransactionRows.length, 3);
  assert.equal(duplicateTransactionRows[1][1], duplicateTransactionRows[2][1]);
  assert.notEqual(duplicateTransactionRows[1][2], duplicateTransactionRows[2][2]);
});
test("receipt PDF renders saved parties, transaction tax lines and registration context", async () => {
  const receipt = load("lib/payments/receiptPdf.ts");
  const details = receipt.receiptDetailsFromSnapshot({ receipt_number: "WS-TR-1", issued_at: "2026-10-21T10:00:00Z", snapshot: { documentTypeLabel: "WorkSync system generated transaction receipt; not a BIR official invoice or receipt.", transactionDate: "2026-10-21T10:00:00Z", projectDescription: "Project", clientPayment: 112, paymentMethod: "PayMongo", client: { name: "Client" }, freelancer: { name: "Freelancer", registeredName: "Freelancer Business" }, workSync: { registeredName: "WorkSync Inc." }, serviceGrossEarnings: 112, freelancerNetPayout: 111.44, withholding: 0.56, freelancerVatBase: 100, freelancerVat: 12, platformServiceFee: null, platformVatBase: null, platformVat: null, platformTaxNote: "Platform fee and related VAT are not recorded.", taxLines: [{ payoutId: "payout-1", taxableBase: 112, withholdingRate: 0.005, withholding: 0.56, withholdingRule: "PH RR 5-2025", exemptionStatus: "none", withholdingDocumentId: "cor-1", withholdingDeclarationId: null, freelancerVatBase: 100, freelancerVatRate: 0.12, freelancerVat: 12, freelancerVatRule: "VAT-inclusive", freelancerVatDocumentId: "vat-doc-1" }] } });
  const pdf = await receipt.createReceiptPdf(details).text();
  assert.match(pdf, /WS-TR-1/); assert.match(pdf, /PHP 112\.00/);
  assert.match(pdf, /Marketplace withholding/); assert.match(pdf, /PH RR 5-2025/); assert.match(pdf, /Freelancer VAT/); assert.match(pdf, /VAT-inclusive/); assert.doesNotMatch(pdf, /Freelancer earnings|PHP 111\.44/);
  assert.match(pdf, /Fee details not recorded/i); assert.match(pdf, /not an official BIR invoice or receipt/i);
  assert.doesNotMatch(pdf, /PayMongo processing fee/i);
  assert.doesNotMatch(pdf, /Payment recorded/);
  assert.ok(pdf.indexOf('1 1 1 rg 54') < pdf.indexOf('Client payment'), 'breakdown panel must be painted before its text');
  const logoPdf = await receipt.createReceiptPdf({ ...details, logoJpeg: new Uint8Array([255, 216, 255, 217]), logoWidth: 305, logoHeight: 277 }).text();
  assert.ok(logoPdf.includes("/XObject << /Im1"));
  assert.ok(logoPdf.includes("/Subtype /Image"));
});

test("tax uploads accept only matching PDF, JPEG, and PNG signatures under 5 MB", () => {
  const upload = load("lib/tax/taxDocumentUpload.ts");
  const pdfBeforeXref = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n";
  const xrefOffset = new TextEncoder().encode(pdfBeforeXref).length;
  const pdfText = `${pdfBeforeXref}xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  const pdf = new TextEncoder().encode(pdfText);
  const jpeg = Uint8Array.from([0xff,0xd8,0xff,0xc0,0x00,0x0b,0x08,0x00,0x01,0x00,0x01,0x01,0x01,0x11,0x00,0xff,0xda,0x00,0x08,0x01,0x01,0x00,0x00,0x3f,0x00,0x00,0xff,0xd9]);
  const crc32 = (bytes) => { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; };
  const pngChunk = (name, data) => { const kind = new TextEncoder().encode(name); const chunk = new Uint8Array(12 + data.length); chunk.set([(data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255]); chunk.set(kind, 4); chunk.set(data, 8); const crc = crc32(chunk.subarray(4, 8 + data.length)); chunk.set([(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255], 8 + data.length); return chunk; };
  const joinBytes = (...parts) => { const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; for (const part of parts) { joined.set(part, offset); offset += part.length; } return joined; };
  const png = joinBytes(Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), pngChunk("IHDR", Uint8Array.from([0,0,0,1,0,0,0,1,8,6,0,0,0])), pngChunk("IDAT", zlib.deflateSync(Buffer.from([0,0,0,0,0]))), pngChunk("IEND", new Uint8Array()));
  same(upload.inspectTaxDocument("cor.pdf", "application/pdf", pdf), { extension: "pdf", contentType: "application/pdf" });
  same(upload.inspectTaxDocument("cor.jpg", "image/jpeg", jpeg), { extension: "jpg", contentType: "image/jpeg" });
  same(upload.inspectTaxDocument("cor.png", "image/png", png), { extension: "png", contentType: "image/png" });
  assert.throws(() => upload.inspectTaxDocument("cor.docx", "application/pdf", pdf), /PDF, JPG, or PNG/);
  assert.throws(() => upload.inspectTaxDocument("cor.pdf", "application/pdf", jpeg), /contents are invalid/);
  assert.throws(() => upload.inspectTaxDocument("cor.jpg", "image/png", jpeg), /does not match/);
  assert.throws(() => upload.inspectTaxDocument("cor.pdf", "application/pdf", new Uint8Array(5 * 1024 * 1024 + 1)), /5 MB/);
  assert.throws(() => upload.inspectTaxDocument("empty.png", "image/png", new Uint8Array()), /empty/);
  assert.throws(() => upload.inspectTaxDocument("broken.pdf", "application/pdf", new TextEncoder().encode("%PDF-1.4\ncorrupt")), /contents are invalid/);
});

test("receipt API view strips private payout withholding details from client responses", () => {
  const visibility = load("lib/payments/receiptVisibility.ts");
  const full = { clientPayment: 1000, serviceGrossEarnings: 1000, freelancerNetPayout: 995, withholding: 5, taxLines: [{ withholding: 5, withholdingDocumentId: "private-doc", freelancerVat: 0.12, freelancerVatRate: 0.12 }] };
  const client = visibility.receiptSnapshotForAudience(full, "client");
  assert.equal(client.clientPayment, 1000);
  assert.equal("withholding" in client, false);
  assert.equal("freelancerNetPayout" in client, false);
  assert.deepEqual(JSON.parse(JSON.stringify(client.taxLines[0])), { freelancerVat: 0.12, freelancerVatRate: 0.12 });
  const freelancer = visibility.receiptSnapshotForAudience(full, "freelancer");
  assert.equal(freelancer.withholding, 5);
  assert.equal("withholdingDocumentId" in freelancer.taxLines[0], false);
  assert.equal(visibility.receiptSnapshotForAudience(full, "admin"), full);
});

test("tax upload migration restricts storage and publishes only verified VAT classifications", () => {
  const sql = fs.readFileSync("supabase/migrations/202610240002_tax_uploads_and_vat_classification.sql", "utf8");
  const uploadUrl = fs.readFileSync("app/api/tax-documents/upload-url/route.ts", "utf8");
  assert.match(sql, /public = false[\s\S]*file_size_limit = 5242880/);
  assert.match(sql, /drop policy if exists freelancer_tax_declaration_upload/);
  assert.match(sql, /worksync_tax_document_upload_allowed/);
  assert.match(sql, /worksync_public_vat_classifications/);
  assert.match(sql, /vat_classification in \('vat_registered','non_vat'\)/);
  assert.match(uploadUrl, /createSignedUploadUrl/);
  assert.match(uploadUrl, /tax_document_upload_tickets/);
});

test("client receipt PDF never renders freelancer withholding or earnings, while freelancer view does", async () => {
  const receipt = load("lib/payments/receiptPdf.ts");
  const visibility = load("lib/payments/receiptVisibility.ts");
  const full = { receipt_number: "WS-TR-ROLE-1", issued_at: "2026-10-24T00:00:00Z", snapshot: { clientPayment: 1000, serviceGrossEarnings: 1000, freelancerNetPayout: 995, withholding: 5, freelancerVatBase: 888.89, freelancerVat: 111.11, taxLines: [{ taxableBase: 1000, withholdingRate: 0.005, withholding: 5, withholdingRule: "test rule", exemptionStatus: "none", freelancerVatBase: 888.89, freelancerVatRate: 0.12, freelancerVat: 111.11, freelancerVatRule: "VAT included" }] } };
  const clientDetails = receipt.receiptDetailsFromSnapshot(visibility.receiptForAudience(full, "client"));
  const clientPdf = await receipt.createReceiptPdf(clientDetails).text();
  assert.match(clientPdf, /VAT \\\(12%\\\)/);
  assert.match(clientPdf, /PHP 888\.89/);
  assert.match(clientPdf, /PHP 111\.11/);
  assert.doesNotMatch(clientPdf, /Marketplace withholding|Gross earnings|Net payout|PHP 5\.00/);
  const freelancerDetails = receipt.receiptDetailsFromSnapshot(visibility.receiptForAudience(full, "freelancer"));
  const freelancerPdf = await receipt.createReceiptPdf(freelancerDetails).text();
  assert.match(freelancerPdf, /Gross Earnings/);
  assert.match(freelancerPdf, /Withholding Tax/);
  assert.match(freelancerPdf, /Net Payout Amount/);
});
test("new client receipt snapshot shows base price plus separately added freelancer VAT", async () => {
  const receipt = load("lib/payments/receiptPdf.ts");
  const visibility = load("lib/payments/receiptVisibility.ts");
  const saved = { receipt_number: "WS-TR-VAT-BASE-1", issued_at: "2026-10-26T10:00:00Z", snapshot: {
    receiptAudience: "client", clientPayment: 112, clientServiceVatBase: 100,
    clientServiceVatRate: 0.12, clientServiceVat: 12,
    clientServiceVatRule: "Verified VAT registration", transactionType: "service",
    projectDescription: "Service name", transactionDate: "2026-10-26T10:00:00Z", paymentMethod: "QR Ph",
    paymentReference: "paymongo-payment-id-that-is-long-and-must-wrap", checkoutReference: "checkout-session-id-that-is-long-and-must-wrap",
    client: { name: "Client Name" }, freelancer: { name: "Freelancer Name" }, taxLines: [],
  } };
  const details = receipt.receiptDetailsFromSnapshot(visibility.receiptForAudience(saved, "client"));
  const pdf = await receipt.createReceiptPdf(details).text();
  assert.match(pdf, /Service Fee/);
  assert.match(pdf, /PHP 112\.00/);
  assert.match(pdf, /Total paid/);
  assert.doesNotMatch(pdf, /Project Fee|Subtotal|Payment breakdown/);
  assert.match(pdf, /PHP 100\.00/);
  assert.match(pdf, /VAT \\\(12%\\\)/);
  assert.match(pdf, /PHP 12\.00/);
  assert.match(pdf, /Transaction Reference/);
  assert.match(pdf, /PayMongo Payment ID/);
  assert.match(pdf, /Checkout Session ID/);
  assert.match(pdf, /System-generated receipt\./);
  assert.doesNotMatch(pdf, /Not a BIR invoice/);
  assert.equal((pdf.match(/PHP 112\.00/g) ?? []).length, 1, "total amount appears once");
  assert.doesNotMatch(pdf, /Freelancer service VAT|Verified VAT registration|added to the base price/);
  assert.match(pdf, /54 \d+ Td \(Service Fee\)/);
  assert.match(pdf, /WS-TR-VAT-BASE-1/);
  assert.doesNotMatch(pdf, /VAT included in service price/);
});
test("receipt PDF uses pending states for absent earnings and tax snapshots", async () => {
  const receipt = load("lib/payments/receiptPdf.ts");
  const details = receipt.receiptDetailsFromSnapshot({ receipt_number: "WS-TR-COMPLETE-RECEIPT-12345678901234567890", issued_at: "2026-10-22T00:51:00Z", snapshot: { clientPayment: 2356, freelancerNetPayout: 0, transactionDate: "2026-10-21T14:02:00Z", projectDescription: "Design service", paymentMethod: "Card", client: { name: "Client" }, freelancer: { name: "Freelancer" }, platformServiceFee: null } });
  const pdf = await receipt.createReceiptPdf(details).text();
  assert.match(pdf, /PAYMENT RECEIPT/); assert.match(pdf, /TOTAL PAID BY CLIENT/); assert.match(pdf, /PHP 2,356.00/);
  assert.match(pdf, /Fee details not recorded/); assert.match(pdf, /No payout tax calculation saved yet/);
  assert.match(pdf, /WS-TR-COMPLETE-RECEIPT/); assert.match(pdf, /890/);
  assert.doesNotMatch(pdf, /Freelancer earnings|Pending calculation|PHP 0\\.00/);
  assert.equal((pdf.match(/not an official BIR invoice or receipt/g) ?? []).length, 1);
  assert.doesNotMatch(pdf, /not_configured|BIR official invoice or official receipt/);
});
test("receipt PDF paginates long historical tax breakdowns", async () => {
  const receipt = load("lib/payments/receiptPdf.ts");
  const taxLines = Array.from({ length: 35 }, (_, index) => ({ payoutId: `payout-${index}`, taxableBase: 1, withholdingRate: 0, withholding: 0, withholdingRule: "rule", exemptionStatus: "none", freelancerVatBase: 1, freelancerVatRate: 0, freelancerVat: 0, freelancerVatRule: "none" }));
  const details = { receiptNumber: "WS-TR-2", documentType: "receipt", project: "Large project", amount: 1, paidAt: "2026-10-21", paymentMethod: "PayMongo", clientName: "Client", freelancerName: "Freelancer", serviceGrossEarnings: 1, freelancerNetPayout: 1, withholding: 0, freelancerVatBase: 1, freelancerVat: 0, platformServiceFee: null, platformVatBase: null, platformVat: null, taxLines };
  const pdf = await receipt.createReceiptPdf(details).text();
  assert.match(pdf, /\/Count [2-9]/); assert.match(pdf, /Payout 35/);
});
test("tax migration protects snapshots and the existing settlement remains idempotent", () => {
  const sql = fs.readFileSync("supabase/migrations/202610210002_philippine_tax_records.sql", "utf8");
  const extension = fs.readFileSync("supabase/migrations/202610220001_tax_documents_and_receipts.sql", "utf8");
  const settlement = fs.readFileSync("supabase/migrations/202609300004_milestone_settlement.sql", "utf8");
  assert.match(sql, /before insert on public\.project_payouts[\s\S]*?worksync_apply_payout_tax_snapshot/);
  assert.match(sql, /declare applicable boolean:=false/);
  assert.match(sql, /drop policy if exists freelancer_tax_declarations_owner_read on public\.freelancer_tax_declarations;\s*create policy freelancer_tax_declarations_owner_read/);
  assert.match(sql, /drop policy if exists freelancer_tax_declarations_owner_submit on public\.freelancer_tax_declarations;\s*create policy freelancer_tax_declarations_owner_submit/);
  assert.match(sql, /Settled tax snapshots are immutable/); assert.match(sql, /sum\(gross_amount\),0\) into reserved/);
  assert.match(sql, /set status='cancelled'[\s\S]*?sum\(gross_amount\)/);
  assert.match(extension, /status='verified'[\s\S]*?expires_at is null or expires_at>=current_date/);
  assert.match(extension, /accepted_below_threshold/); assert.match(extension, /withholding_declaration_id/); assert.match(extension, /freelancer_vat_document_id/);
  assert.match(extension, /withholding_applicable boolean:=false/);
  assert.match(extension, /drop policy if exists tax_documents_owner_read on public\.tax_documents;\s*create policy tax_documents_owner_read/);
  assert.match(extension, /drop policy if exists tax_documents_owner_submit on public\.tax_documents;\s*create policy tax_documents_owner_submit/); assert.match(extension, /payment_id uuid not null unique/);
  assert.match(extension, /tax_transaction_receipt_corrections/); assert.match(extension, /Issued transaction receipts are immutable/);
  assert.match(extension, /freelancer_tax_profile_events/); assert.match(extension, /Tax configuration changes require an administrator and reason/);
  assert.match(extension, /A review decision and reason are required/);
  assert.match(settlement, /on conflict\(project_id,milestone_id,mode\) where milestone_id is not null do nothing/);
  assert.match(settlement, /on conflict\(project_id,mode\) where milestone_id is null do nothing/);
});






test("onboarding tax uploads are optional and submit through the existing private document workflow", () => {
  const onboarding = fs.readFileSync("components/accountsetup/TaxDocumentOnboarding.tsx", "utf8");
  const setupHook = fs.readFileSync("components/accountsetup/hooks/useSetupForm.ts", "utf8");
  const docsApi = fs.readFileSync("app/api/tax-documents/route.ts", "utf8");
  assert.match(onboarding, /if \(!file\) return/);
  assert.match(onboarding, /fetch\("\/api\/tax-documents"/);
  assert.match(onboarding, /phase === "pending"/);
  assert.match(onboarding, /\/api\/tax-documents\/upload-url/);
  assert.match(onboarding, /uploadToSignedUrl/);
  assert.match(setupHook, /await afterProfileSaved\?\./);
  assert.match(docsApi, /roles\.includes\(partyType/);
  assert.match(docsApi, /inspectTaxDocument/);
  assert.match(docsApi, /\.download\(path\)/);
  assert.match(docsApi, /db\.from\("tax_documents"\)\.insert/);
});

test("document review is admin-only and approval does not activate a generic exemption", () => {
  const adminApi = fs.readFileSync("app/api/admin/tax-documents/route.ts", "utf8");
  const payoutSql = fs.readFileSync("supabase/migrations/202610220001_tax_documents_and_receipts.sql", "utf8");
  assert.match(adminApi, /admin_members/);
  assert.match(adminApi, /review_reason: reason/);
  assert.match(adminApi, /tax_document_review_events/);
  const start = payoutSql.indexOf("create or replace function public.worksync_apply_payout_tax_snapshot");
  const end = payoutSql.indexOf("create or replace function public.worksync_guard_payout_tax_snapshot");
  const payoutFunction = payoutSql.slice(start, end);
  assert.match(payoutFunction, /marketplace_withholding_enabled,false/);
  assert.match(payoutFunction, /withholding_applicable:=withholding_applicable and withholding_globally_enabled/);
  assert.match(payoutFunction, /latest_status='accepted'.*cor_id is not null/s);
  assert.doesNotMatch(payoutFunction, /tax_exemption/);
  assert.match(adminApi, /requires a current verified VAT registration document/);
  assert.match(adminApi, /platformGate/);
  assert.match(adminApi, /remains disabled pending legal confirmation/);
});

test("platform tax amounts remain nullable, receipts use saved fields, and corrections compare snapshots", () => {
  const migration = fs.readFileSync("supabase/migrations/202610220001_tax_documents_and_receipts.sql", "utf8");
  const receiptApi = fs.readFileSync("app/api/tax-receipts/route.ts", "utf8");
  const start = migration.indexOf("create table if not exists public.platform_tax_configuration");
  const end = migration.indexOf("create table if not exists public.tax_documents");
  const setup = migration.slice(start, end);
  assert.match(setup, /marketplace_withholding_enabled boolean not null default false/);
  assert.match(setup, /platform_vat_applicable boolean not null default false/);
  assert.match(setup, /platform_service_fee numeric check\(platform_service_fee is null/);
  assert.match(setup, /platform_vat_amount numeric check\(platform_vat_amount is null/);
  assert.match(setup, /Paid transaction tax snapshots are immutable/);
  assert.match(receiptApi, /platform_service_fee,platform_vat_taxable_base,platform_vat_rate,platform_vat_amount/);
  assert.match(receiptApi, /JSON\.stringify\(previousSnapshot\) === JSON\.stringify\(currentSnapshot\)/);
  assert.match(receiptApi, /tax_transaction_receipt_corrections/);
  assert.match(receiptApi, /const differences = Object\.fromEntries/);
  assert.match(fs.readFileSync("lib/payments/receiptPdf.ts", "utf8"), /correctionDifferences/);
  assert.match(receiptApi, /not a BIR official invoice or receipt/);
});

test("receipt client loads the public WorkSync logo for the generated PDF", () => {
  const client = fs.readFileSync("lib/payments/receiptClient.ts", "utf8");
  assert.ok(client.includes("worksynclogo.png"));
  assert.match(client, /createImageBitmap/);
});

test("receipt correction retrieval avoids filtering by JSON snapshot and receipt actions open the viewer", () => {
  const api = fs.readFileSync("app/api/tax-receipts/route.ts", "utf8");
  const project = fs.readFileSync("components/project/ProjectPaymentPanel.tsx", "utf8");
  const admin = fs.readFileSync("components/admin/AdminRecords.tsx", "utf8");
  const payouts = fs.readFileSync("components/account/PayoutSettings.tsx", "utf8");
  assert.match(api, /const retrieved = inserted\.data \? null : await db[\s\S]*?eq\("receipt_id", saved\.receipt_id\)[\s\S]*?order\("issued_at"/);
  assert.doesNotMatch(api, /eq\("snapshot", correctionSnapshot\)/);
  assert.doesNotMatch(project, /Download PDF|receipt\(true\)/);
  assert.doesNotMatch(admin, /Download PDF|openSavedTaxReceipt\(row\.id, true\)/);
  assert.match(payouts, /View receipt/);
  assert.doesNotMatch(payouts, /Download transaction receipt|openSavedTaxReceipt\(payout\.transactionId, true\)/);
});
test("saved receipt corrections render an explicit before-and-after summary", async () => {
  const receipt = load("lib/payments/receiptPdf.ts");
  const details = receipt.receiptDetailsFromSnapshot({ receipt_number: "WS-TRC-1", issued_at: "2026-10-22T10:00:00Z", snapshot: { documentTypeLabel: "Corrected receipt", clientPayment: 100, transactionDate: "2026-10-22T10:00:00Z", differences: { platformVat: { previous: null, current: 12 } }, correctionReason: "Saved transaction snapshot changed." } });
  const pdf = await receipt.createReceiptPdf(details).text();
  assert.match(pdf, /Reason: Saved transaction snapshot changed/);
  assert.match(pdf, /Changed platformVat: null -> 12/);
});

test("receipt includes recorded PayMongo references and refunds without inventing dates", async () => {
  const receipt = load("lib/payments/receiptPdf.ts");
  const details = receipt.receiptDetailsFromSnapshot({ receipt_number: "WS-TR-REFUND-1", issued_at: "2026-10-25T10:00:00Z", snapshot: {
    clientPayment: 1000,
    transactionDate: null,
    paymentMethod: "gcash",
    paymentReference: "pay_recorded_1",
    checkoutReference: "cs_recorded_1",
    refunds: [
      { refundId: "refund-pending", amount: 100, status: "pending", refundedAt: null, providerReference: "ref-pending" },
      { refundId: "refund-confirmed", amount: 200, status: "refunded", refundedAt: "2026-10-24T12:00:00Z", providerReference: "ref-confirmed" },
    ],
  } });
  const pdf = await receipt.createReceiptPdf(details).text();
  assert.match(pdf, /Payment date not recorded/);
  assert.match(pdf, /pay_recorded_1/);
  assert.match(pdf, /cs_recorded_1/);
  assert.match(pdf, /Refund pending/);
  assert.match(pdf, /Refund refunded/);
  assert.match(pdf, /Confirmed refund total/);
  assert.match(pdf, /PHP 200\.00/);
  assert.match(pdf, /Net after confirmed refunds/);
  assert.match(pdf, /PHP 800\.00/);
});

test("receipt history freezes identity fields and tracks refunds from saved refund rows", () => {
  const api = fs.readFileSync("app/api/tax-receipts/route.ts", "utf8");
  assert.match(api, /from\("project_refunds"\)\.select\("refund_id,amount,status,provider_refund_id,refunded_at"\)/);
  assert.match(api, /transactionDate: payment\.paid_at/);
  assert.doesNotMatch(api, /transactionDate: payment\.paid_at \?\? new Date\(\)/);
  assert.match(api, /\["transactionDate", "projectDescription", "transactionType", "client", "freelancer", "workSync"\]/);
  assert.match(api, /Authoritative refund status changed/);
});

test("freelancer payout statement renders its breakdown, status, and payment references", async () => {
  const receipt = load("lib/payments/receiptPdf.ts");
  const details = receipt.receiptDetailsFromSnapshot({ receipt_number: "WS-TR-PAYOUT-1", issued_at: "2026-10-25T10:00:00Z", snapshot: {
    clientPayment: 1000,
    transactionDate: "2026-10-25T09:00:00Z",
    taxLines: [{ payoutId: "payout-1", taxableBase: 0, withholdingRate: 0, withholding: 0, withholdingRule: "none", exemptionStatus: "not applicable", freelancerVatBase: 1000, freelancerVatRate: 0, freelancerVat: 0, freelancerVatRule: "not configured", payoutStatus: "ready", transferReference: null }],
    serviceGrossEarnings: 1000,
    freelancerNetPayout: 1000,
    withholding: 0,
    paymentReference: "paymongo-payment-reference-long-enough-to-wrap-cleanly",
    checkoutReference: "paymongo-checkout-reference-long-enough-to-wrap-cleanly",
  } });
  const pdf = await receipt.createReceiptPdf({ ...details, audience: "freelancer" }).text();
  assert.match(pdf, /FREELANCER PAYOUT STATEMENT/);
  assert.match(pdf, /NET PAYOUT TO FREELANCER/);
  assert.match(pdf, /PAYOUT BREAKDOWN/);
  assert.match(pdf, /Gross Earnings/);
  assert.match(pdf, /Withholding Tax/);
  assert.match(pdf, /Net Payout Amount/);
  assert.match(pdf, /Transfer status: ready/);
  assert.match(pdf, /PAYMENT REFERENCES/);
  assert.match(pdf, /PayMongo payment reference/);
  assert.match(pdf, /paymongo-payment-reference-long-enough-to-wrap-cleanly/);
  assert.match(pdf, /PayMongo checkout reference/);
  assert.match(pdf, /paymongo-checkout-reference-long-enough-to-wrap-cleanly/);
  assert.match(pdf, /not an official BIR invoice or receipt/);
  assert.ok(pdf.indexOf("Receipt number") < pdf.indexOf("Project / Service"));
  assert.ok(pdf.indexOf("PAYMENT REFERENCES") > pdf.indexOf("PAYOUT BREAKDOWN"));
  assert.doesNotMatch(pdf, /Transferred PHP 1,000\.00/);
});

test("payout statements expose saved transfer references and status context", () => {
  const api = fs.readFileSync("app/api/payouts/route.ts", "utf8");
  const page = fs.readFileSync("components/account/PayoutSettings.tsx", "utf8");
  const csv = fs.readFileSync("lib/payments/payoutCsv.ts", "utf8");
  assert.match(api, /provider_transfer_id/);
  assert.match(api, /transferReference: row\.provider_transfer_id/);
  assert.match(page, /Transfer Reference/i);
  assert.match(page, /Net transfer/);
  assert.match(csv, /Paid Status/);
  assert.match(csv, /Confirmed At/);
  assert.match(page, /payoutStatusLabel\(payout\.status\)/);
  assert.match(page, /payout\.withholdingAmount > 0/);
});

test("tax document and declaration approval revocation stays admin-reviewed and auditable", () => {
  const documentApi = fs.readFileSync("app/api/admin/tax-documents/route.ts", "utf8");
  const declarationApi = fs.readFileSync("app/api/admin/tax-declarations/route.ts", "utf8");
  const declarationUi = fs.readFileSync("components/admin/TaxDeclarationReview.tsx", "utf8");
  const migration = fs.readFileSync("supabase/migrations/202610250005_tax_review_revocation.sql", "utf8");
  assert.match(documentApi, /body\.decision === "revoked" \? \["verified"\]/);
  assert.match(declarationApi, /body\.decision === "revoked" \? \["accepted"\]/);
  assert.match(declarationApi, /paymentUser\(request\)/);
  assert.match(declarationUi, /Revoke accepted declaration/);
  assert.match(declarationUi, /review_events/);
  assert.match(migration, /PREPARED, NOT APPLIED/);
  assert.match(migration, /freelancer_tax_declaration_events/);
  assert.match(migration, /worksync_audit_tax_declaration_review/);
});

test("new base-price VAT migration snapshots verified treatment and preserves payment, payout, and refund guards", () => {
  const migration = fs.readFileSync("supabase/migrations/20261026210000_base_price_vat_transaction_snapshots.sql", "utf8");
  const payment = fs.readFileSync("services/payments/paymentServer.ts", "utf8");
  const settlement = fs.readFileSync("supabase/migrations/202609300004_milestone_settlement.sql", "utf8");
  const receipt = fs.readFileSync("app/api/tax-receipts/route.ts", "utf8");
  assert.match(migration, /PREPARED, NOT APPLIED/);
  assert.match(migration, /add column if not exists freelancer_service_vat_taxable_base/);
  assert.match(migration, /old\.status='paid' or old\.transaction_reference is not null/);
  assert.match(migration, /worksync_project_milestone_vat/);
  assert.match(migration, /final milestone receives any cent-rounding remainder/);
  assert.match(migration, /worksync_payment_matches_project/);
  assert.match(migration, /worksync_claim_payout/);
  assert.match(migration, /refund_amount\+coalesce\([\s\S]*?pay\.amount/);
  assert.match(migration, /withholding not configured as applicable pending legal determination/);
  assert.match(settlement, /on conflict\(project_id,milestone_id,mode\) where milestone_id is not null do nothing/);
  assert.match(payment, /freelancer_service_vat_taxable_base/);
  assert.match(payment, /vat\.status === "review_required"/);
  assert.match(payment, /calculateVat\(baseAmount, "exclusive", true\)/);
  assert.match(payment, /classification === "non_vat"/);
  assert.match(payment, /worksync_freelancer_seller_eligible/);
  assert.match(receipt, /clientServiceVatBase/);
  assert.match(receipt, /freelancer_service_vat_document_id/);
});

test("prepared default VAT migration keeps Form 2303 and reviewed alternative treatment guards", () => {
  const migration = fs.readFileSync("supabase/migrations/202610270008_default_vat_checkout_for_verified_sellers.sql", "utf8");
  assert.match(migration, /PREPARED, NOT APPLIED/);
  assert.match(migration, /'vat_registered','non_vat','default_vat'/);
  assert.match(migration, /Default VAT requires a currently verified Form 2303/);
  assert.match(migration, /A current reviewed non-VAT classification and Form 2303 are required/);
  assert.match(migration, /worksync_freelancer_canonical_bir_cor/);
  assert.match(migration, /VAT registration and Form 2303 must be currently verified/);
});
