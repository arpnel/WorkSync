/* eslint-disable @typescript-eslint/no-require-imports -- Node TypeScript test harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(path, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, TextEncoder, Blob, ...globals });
  return exports;
}
const tax = load("lib/payments/philippineTax.ts");
const same = (actual, expected) => assert.equal(JSON.stringify(actual), JSON.stringify(expected));

test("VAT-inclusive price is split without changing the amount paid", () => same(tax.calculateVat(112, "inclusive", true), { taxableAmount: 100, vatAmount: 12, total: 112, pricing: "inclusive", applies: true }));
test("VAT-exclusive price adds VAT only when explicitly applicable", () => {
  same(tax.calculateVat(100, "exclusive", true), { taxableAmount: 100, vatAmount: 12, total: 112, pricing: "exclusive", applies: true });
  same(tax.calculateVat(100, "exclusive", false), { taxableAmount: 100, vatAmount: 0, total: 100, pricing: "exclusive", applies: false });
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
  assert.match(onboarding, /verification-documents/);
  assert.match(onboarding, /fetch\("\/api\/tax-documents"/);
  assert.match(onboarding, /phase === "uploading"/);
  assert.match(onboarding, /phase === "pending"/);
  assert.match(onboarding, /partyType: party/);
  assert.match(setupHook, /await afterProfileSaved\?\./);
  assert.match(docsApi, /roles\.includes\(partyType/);
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
  assert.match(adminApi, /requires a current verified registration document/);
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
  assert.match(payouts, /View transaction receipt/);
  assert.doesNotMatch(payouts, /Download transaction receipt|openSavedTaxReceipt\(payout\.transactionId, true\)/);
});
test("saved receipt corrections render an explicit before-and-after summary", async () => {
  const receipt = load("lib/payments/receiptPdf.ts");
  const details = receipt.receiptDetailsFromSnapshot({ receipt_number: "WS-TRC-1", issued_at: "2026-10-22T10:00:00Z", snapshot: { documentTypeLabel: "Corrected receipt", clientPayment: 100, transactionDate: "2026-10-22T10:00:00Z", differences: { platformVat: { previous: null, current: 12 } }, correctionReason: "Saved transaction snapshot changed." } });
  const pdf = await receipt.createReceiptPdf(details).text();
  assert.match(pdf, /Reason: Saved transaction snapshot changed/);
  assert.match(pdf, /Changed platformVat: null -> 12/);
});
