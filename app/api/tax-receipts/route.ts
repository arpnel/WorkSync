import { PaymentError } from "@/lib/payments/paymongo";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";
import { receiptForAudience, type ReceiptAudience } from "@/lib/payments/receiptVisibility";
export const runtime = "nodejs";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const nameFor = (profile: { display_name?: string | null } | null, fallback: string) => profile?.display_name?.trim() || fallback;
const paidReceiptFields = "receipt_id,receipt_number,payment_id,document_type,issued_at,snapshot";
const correctionFields = "correction_id,correction_number,receipt_id,reason,issued_at,snapshot";
export async function GET(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const paymentId = new URL(request.url).searchParams.get("paymentId");
    if (!paymentId || !/^[a-f\d-]{36}$/i.test(paymentId)) throw new PaymentError("A valid payment ID is required.", 400);
    const { data: payment, error: paymentError } = await db.from("payments").select("payment_id,project_id,payer_id,amount,status,payment_method,paid_at,transaction_reference,provider_payment_id,freelancer_service_vat_taxable_base,freelancer_service_vat_rate,freelancer_service_vat_amount,freelancer_service_vat_classification,freelancer_service_vat_document_id,freelancer_service_vat_rule,platform_service_fee,platform_vat_taxable_base,platform_vat_rate,platform_vat_amount,platform_tax_treatment,platform_tax_snapshot").eq("payment_id", paymentId).maybeSingle();
    if (paymentError || !payment) throw new PaymentError("Payment unavailable.", 404);
    const { data: project, error: projectError } = await db.from("projects").select("project_id,title,client_id,freelancer_id").eq("project_id", payment.project_id).maybeSingle();
    if (projectError || !project) throw new PaymentError("Project unavailable.", 404);
    const [client, freelancer, admin] = await Promise.all([
      db.from("client_profiles").select("user_id").eq("client_id", project.client_id).maybeSingle(),
      db.from("freelancer_profiles").select("user_id").eq("freelancer_id", project.freelancer_id).maybeSingle(),
      db.from("admin_members").select("user_id").eq("user_id", user.id).maybeSingle(),
    ]);
    if (client.error || freelancer.error || admin.error || !client.data || !freelancer.data) throw new PaymentError("Payment participants unavailable.");
    if (payment.payer_id !== client.data.user_id) throw new PaymentError("Payment payer does not match the project client.", 409);
    if (user.id !== client.data.user_id && user.id !== freelancer.data.user_id && !admin.data) throw new PaymentError("Only transaction participants may access this receipt.", 403);
    const audience: ReceiptAudience = admin.data ? "admin" : user.id === client.data.user_id ? "client" : "freelancer";
    const { data: saved, error: savedError } = await db.from("tax_transaction_receipts").select(paidReceiptFields).eq("payment_id", paymentId).maybeSingle();
    if (savedError) throw new PaymentError("Saved receipts are unavailable. The receipt migration may not be applied yet.");
    if (payment.status !== "paid") {
      if (!saved) throw new PaymentError("A receipt is available after payment is confirmed.", 409);
      const correction = await db.from("tax_transaction_receipt_corrections").select(correctionFields).eq("receipt_id", saved.receipt_id).order("issued_at", { ascending: false }).limit(1).maybeSingle();
      if (correction.error) throw new PaymentError("Receipt correction history is unavailable.");
      return json({ receipt: receiptForAudience(correction.data ? { receipt_number: correction.data.correction_number, document_type: "system_transaction_receipt_correction", issued_at: correction.data.issued_at, snapshot: correction.data.snapshot } : saved, audience) });
    }
    const today = new Date().toISOString().slice(0, 10);
    const [clientProfile, freelancerProfile, payouts, refunds, freelancerTax, clientTax] = await Promise.all([
      db.from("profiles").select("display_name").eq("user_id", client.data.user_id).maybeSingle(),
      db.from("profiles").select("display_name").eq("user_id", freelancer.data.user_id).maybeSingle(),
      db.from("project_payouts").select("payout_id,milestone_id,gross_amount,amount,freelancer_vat_taxable_amount,freelancer_vat_amount,freelancer_vat_rate,freelancer_vat_rule,freelancer_vat_document_id,withholding_basis,withholding_rate,withholding_amount,withholding_rule,withholding_exemption_status,withholding_declaration_id,withholding_document_id,status,paid_at,provider_transfer_id").eq("payment_id", paymentId).neq("status", "cancelled").order("created_at", { ascending: true }),
      db.from("project_refunds").select("refund_id,amount,status,provider_refund_id,refunded_at").eq("payment_id", paymentId).order("claimed_at", { ascending: true }),
      db.from("tax_documents").select("document_id,registered_name,expires_at").eq("user_id", freelancer.data.user_id).eq("party_type", "freelancer").eq("document_type", "bir_cor").eq("status", "verified").or(`expires_at.is.null,expires_at.gte.${today}`).order("reviewed_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("tax_documents").select("document_id,registered_name,expires_at").eq("user_id", client.data.user_id).eq("party_type", "client").eq("document_type", "bir_cor").eq("status", "verified").or(`expires_at.is.null,expires_at.gte.${today}`).order("reviewed_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (clientProfile.error || freelancerProfile.error || payouts.error || refunds.error || freelancerTax.error || clientTax.error) throw new PaymentError("Transaction tax details are unavailable.");
    const rows = payouts.data ?? [];
    const sum = (key: string) => rows.reduce((total, row) => total + Number((row as Record<string, unknown>)[key] ?? 0), 0);
    const refundRows = (refunds.data ?? []).map(row => ({ refundId: row.refund_id, amount: Number(row.amount), status: row.status, refundedAt: row.refunded_at, providerReference: row.provider_refund_id }));
    const taxLines = rows.map(row => ({ payoutId: row.payout_id, taxableBase: Number(row.withholding_basis ?? 0), withholdingRate: Number(row.withholding_rate ?? 0), withholding: Number(row.withholding_amount ?? 0), withholdingRule: row.withholding_rule ?? "not recorded", exemptionStatus: row.withholding_exemption_status ?? "not recorded", freelancerVatBase: Number(row.freelancer_vat_taxable_amount ?? 0), freelancerVatRate: Number(row.freelancer_vat_rate ?? 0), freelancerVat: Number(row.freelancer_vat_amount ?? 0), freelancerVatRule: row.freelancer_vat_rule ?? "not recorded", withholdingDocumentId: row.withholding_document_id, withholdingDeclarationId: row.withholding_declaration_id, freelancerVatDocumentId: row.freelancer_vat_document_id, payoutStatus: row.status, paidAt: row.paid_at, transferReference: row.provider_transfer_id }));
    const snapshot = {
      transactionDate: payment.paid_at, projectDescription: project.title, clientPayment: Number(payment.amount), currency: "PHP", paymentMethod: payment.payment_method ?? "PayMongo", paymentReference: payment.provider_payment_id, checkoutReference: payment.transaction_reference, refunds: refundRows,
      clientServiceVatBase: payment.freelancer_service_vat_taxable_base == null ? null : Number(payment.freelancer_service_vat_taxable_base),
      clientServiceVatRate: payment.freelancer_service_vat_rate == null ? null : Number(payment.freelancer_service_vat_rate),
      clientServiceVat: payment.freelancer_service_vat_amount == null ? null : Number(payment.freelancer_service_vat_amount),
      clientServiceVatClassification: payment.freelancer_service_vat_classification ?? null,
      clientServiceVatRule: payment.freelancer_service_vat_rule ?? null,
      client: { name: nameFor(clientProfile.data, "Client"), registeredName: clientTax.data?.registered_name ?? null },
      freelancer: { name: nameFor(freelancerProfile.data, "Freelancer"), registeredName: freelancerTax.data?.registered_name ?? null },
      workSync: { registeredName: process.env.WORKSYNC_REGISTERED_NAME ?? null, taxRegistrationDetails: process.env.WORKSYNC_TAX_REGISTRATION_DETAILS ?? null },
      serviceGrossEarnings: rows.length ? sum("gross_amount") : null, freelancerNetPayout: rows.length ? sum("amount") : null, withholding: sum("withholding_amount"), freelancerVatBase: sum("freelancer_vat_taxable_amount"), freelancerVat: sum("freelancer_vat_amount"),
      platformServiceFee: payment.platform_service_fee == null ? null : Number(payment.platform_service_fee), platformVatBase: payment.platform_vat_taxable_base == null ? null : Number(payment.platform_vat_taxable_base), platformVatRate: payment.platform_vat_rate == null ? null : Number(payment.platform_vat_rate), platformVat: payment.platform_vat_amount == null ? null : Number(payment.platform_vat_amount), platformTaxTreatment: payment.platform_tax_treatment ?? "not_configured", platformTaxSnapshot: payment.platform_tax_snapshot ?? null,
      platformTaxNote: payment.platform_tax_treatment === "not_configured" ? "WorkSync platform fee VAT has no configured legal treatment or recorded amount." : "WorkSync platform tax treatment is shown from the saved transaction snapshot.",
      taxLines,
      documentTypeLabel: "WorkSync system generated transaction receipt; not a BIR official invoice or receipt.",
    };
    if (!saved) {
      const inserted = await db.from("tax_transaction_receipts").upsert({ payment_id: paymentId, snapshot, created_by: user.id }, { onConflict: "payment_id", ignoreDuplicates: true }).select(paidReceiptFields).maybeSingle();
      if (inserted.error) throw new PaymentError("Receipt could not be recorded.");
      const receipt = inserted.data ?? (await db.from("tax_transaction_receipts").select(paidReceiptFields).eq("payment_id", paymentId).single()).data;
      if (!receipt) throw new PaymentError("Recorded receipt could not be retrieved.");
      return json({ receipt: receiptForAudience(receipt, audience) });
    }
    const latest = await db.from("tax_transaction_receipt_corrections").select(correctionFields).eq("receipt_id", saved.receipt_id).order("issued_at", { ascending: false }).limit(1).maybeSingle();
    if (latest.error) throw new PaymentError("Receipt correction history is unavailable.");
    const previous = latest.data?.snapshot ?? saved.snapshot;
    const previousRecord = previous as Record<string, unknown>;
    const currentRecord = snapshot as Record<string, unknown>;
    // Freeze identity and descriptive fields from the first issued receipt. Current profile
    // and tax-document values must never silently replace historical receipt details.
    for (const key of ["transactionDate", "projectDescription", "client", "freelancer", "workSync"]) {
      if (Object.prototype.hasOwnProperty.call(previousRecord, key)) currentRecord[key] = previousRecord[key];
      else delete currentRecord[key];
    }
    const normalizeSnapshot = (value: Record<string, unknown>) => {
      const normalized = { ...value };
      delete normalized.correctionReason;
      delete normalized.differences;
      normalized.documentTypeLabel = "WorkSync system generated transaction receipt; not a BIR official invoice or receipt.";
      return normalized;
    };
    const previousSnapshot = normalizeSnapshot(previous as Record<string, unknown>);
    const currentSnapshot = normalizeSnapshot(snapshot);
    if (JSON.stringify(previousSnapshot) === JSON.stringify(currentSnapshot)) return json({ receipt: receiptForAudience(latest.data ? { receipt_number: latest.data.correction_number, document_type: "system_transaction_receipt_correction", issued_at: latest.data.issued_at, snapshot: latest.data.snapshot } : saved, audience) });
    const differenceKeys = [...new Set([...Object.keys(previousSnapshot), ...Object.keys(currentSnapshot)])].filter(key => JSON.stringify(previousSnapshot[key] ?? null) !== JSON.stringify(currentSnapshot[key] ?? null));
    const differences = Object.fromEntries(differenceKeys.map(key => [key, { previous: previousSnapshot[key] ?? null, current: currentSnapshot[key] ?? null }]));
    const previousRefunds = JSON.stringify(Array.isArray(previousRecord.refunds) ? previousRecord.refunds : []);
    const currentRefunds = JSON.stringify((snapshot.refunds ?? []) as unknown[]);
    const reason = previousRefunds !== currentRefunds
      ? "Authoritative refund status changed; original receipt remains preserved."
      : !((previousRecord.taxLines as unknown[] | undefined)?.length) && taxLines.length
        ? "Saved payout tax details became available after the original receipt was issued."
        : "Saved transaction snapshot changed; prior receipt remains preserved.";
    const correctionSnapshot = { ...snapshot, correctionReason: reason, differences, documentTypeLabel: `Corrected system transaction receipt for ${saved.receipt_number}; original receipt retained in audit history.` };
    const inserted = await db.from("tax_transaction_receipt_corrections").upsert({ receipt_id: saved.receipt_id, reason, snapshot: correctionSnapshot, created_by: user.id }, { onConflict: "receipt_id,snapshot", ignoreDuplicates: true }).select(correctionFields).maybeSingle();
    if (inserted.error) throw new PaymentError("Receipt correction could not be recorded.");
    const retrieved = inserted.data ? null : await db.from("tax_transaction_receipt_corrections").select(correctionFields).eq("receipt_id", saved.receipt_id).order("issued_at", { ascending: false }).limit(1).maybeSingle();
    if (retrieved?.error) throw new PaymentError("Receipt correction was saved but could not be read.");
    const correction = inserted.data ?? retrieved?.data;
    if (!correction) throw new PaymentError("Recorded receipt correction could not be retrieved.");
    return json({ receipt: receiptForAudience({ receipt_number: correction.correction_number, document_type: "system_transaction_receipt_correction", issued_at: correction.issued_at, snapshot: correction.snapshot }, audience) });
  } catch (error) { return paymentResponse(error); }
}




