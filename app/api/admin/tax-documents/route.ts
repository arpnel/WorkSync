import { PaymentError } from "@/lib/payments/paymongo";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function requireAdmin(request: Request) {
  const { db, user } = await paymentUser(request);
  const member = await db.from("admin_members").select("user_id").eq("user_id", user.id).maybeSingle();
  if (member.error || !member.data) throw new PaymentError("Administrator access required.", 403);
  return { db, user };
}
export async function GET(request: Request) {
  try {
    const { db } = await requireAdmin(request);
    const { data, error } = await db.from("tax_documents").select("document_id,user_id,party_type,document_type,registered_name,claimed_tax_treatment,legal_basis,tax_year,issued_at,expires_at,status,submitted_at,reviewed_by,reviewed_at,review_reason,document_path,is_canonical_bir_cor").order("submitted_at", { ascending: false }).limit(300);
    if (error) throw new PaymentError("Tax documents are unavailable. The tax document migration may not be applied yet.");
    const profileRows = await db.from("freelancer_tax_profiles").select("user_id,marketplace_withholding_applicable,freelancer_vat_applicable,vat_classification");
    if (profileRows.error) throw new PaymentError("Freelancer tax settings are unavailable.");
    const configs = new Map((profileRows.data ?? []).map(row => [row.user_id, row]));
    const platformConfig = await db.from("platform_tax_configuration").select("marketplace_withholding_enabled").eq("configuration_id", true).maybeSingle();
    if (platformConfig.error || !platformConfig.data) throw new PaymentError("Platform tax configuration is unavailable.");
    const marketplaceWithholdingEnabled = platformConfig.data?.marketplace_withholding_enabled === true;
    const ids = (data ?? []).map(row => row.document_id);
    const eventsResult = ids.length ? await db.from("tax_document_review_events").select("event_id,document_id,reviewer_id,previous_status,new_status,reason,created_at").in("document_id", ids).order("created_at", { ascending: false }) : { data: [], error: null };
    if (eventsResult.error) throw new PaymentError("Tax review history is unavailable.");
    const events = new Map<string, unknown[]>();
    for (const event of eventsResult.data ?? []) events.set(event.document_id, [...(events.get(event.document_id) ?? []), event]);
    const documents = await Promise.all((data ?? []).map(async row => {
      const { data: signed, error: signedError } = await db.storage.from("verification-documents").createSignedUrl(row.document_path, 600, { download: true });
      const expired = row.status === "verified" && row.expires_at && row.expires_at < new Date().toISOString().slice(0, 10);
      const config = configs.get(row.user_id);
      return { ...row, review_events: events.get(row.document_id) ?? [], marketplace_withholding_applicable: marketplaceWithholdingEnabled && (config?.marketplace_withholding_applicable ?? false), freelancer_vat_applicable: config?.freelancer_vat_applicable ?? false, vat_classification: config?.vat_classification ?? "unverified", status: expired ? "expired" : row.status, document_url: signedError ? null : signed.signedUrl };
    }));
    return json({ documents, marketplaceWithholdingEnabled });
  } catch (error) { return paymentResponse(error); }
}
export async function POST(request: Request) {
  try {
    const { db, user } = await requireAdmin(request);
    const body = await request.json().catch(() => null) as { action?: unknown; freelancerId?: unknown; vatApplicable?: unknown; vatClassification?: unknown; marketplaceWithholdingApplicable?: unknown; documentId?: unknown; decision?: unknown; reason?: unknown } | null;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (body?.action === "configure_freelancer") {
      const classification = body.vatClassification ?? (body.vatApplicable === true ? "vat_registered" : "unverified");
      if (typeof body.freelancerId !== "string" || !["unverified","pending_review","vat_registered","non_vat","rejected","expired"].includes(String(classification)) || typeof body.marketplaceWithholdingApplicable !== "boolean" || typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 2000) throw new PaymentError("Tax configuration changes require a valid VAT classification and a reason up to 2,000 characters.", 400);
      if (body.marketplaceWithholdingApplicable) {
        const platformGate = await db.from("platform_tax_configuration").select("marketplace_withholding_enabled").eq("configuration_id", true).maybeSingle();
        if (platformGate.error || !platformGate.data) throw new PaymentError("Platform withholding configuration is unavailable; no withholding setting can be activated.", 409);
        if (!platformGate.data.marketplace_withholding_enabled) throw new PaymentError("Marketplace withholding remains disabled pending legal confirmation for WorkSync.", 409);
      }
      if (classification === "vat_registered" || classification === "non_vat") {
        const today = new Date().toISOString().slice(0, 10);
        const cor = await db.from("tax_documents").select("document_id").eq("user_id", body.freelancerId).eq("party_type", "freelancer").eq("document_type", "bir_cor").eq("is_canonical_bir_cor", true).eq("status", "verified").or(`expires_at.is.null,expires_at.gte.${today}`).maybeSingle();
        if (cor.error || !cor.data) throw new PaymentError("A public VAT classification requires a current verified COR.", 409);
        if (classification === "vat_registered") {
          const proof = await db.from("tax_documents").select("document_id").eq("user_id", body.freelancerId).eq("party_type", "freelancer").eq("document_type", "vat_registration").eq("status", "verified").or(`expires_at.is.null,expires_at.gte.${today}`).limit(1).maybeSingle();
          if (proof.error || !proof.data) throw new PaymentError("VAT-Registered classification requires a current verified VAT registration document.", 409);
        }
      }
      const vatApplicable = classification === "vat_registered";
      const saved = await db.from("freelancer_tax_profiles").upsert({ user_id: body.freelancerId, vat_classification: classification, freelancer_vat_applicable: vatApplicable, marketplace_withholding_applicable: body.marketplaceWithholdingApplicable, updated_by: user.id, updated_at: new Date().toISOString(), updated_reason: body.reason.trim() });
      if (saved.error) throw new PaymentError("Tax configuration could not be saved.");
      const audit = await db.from("admin_audit_log").insert({ admin_id: user.id, action: "configure_freelancer_tax_treatment", target_id: body.freelancerId, details: { vat_classification: classification, freelancer_vat_applicable: vatApplicable, marketplace_withholding_applicable: body.marketplaceWithholdingApplicable, reason: body.reason.trim() } });
      if (audit.error) throw new PaymentError("Tax configuration was saved, but the supplemental admin audit record failed.");
      return json({ saved: true });
    }
    if (body?.action === "select_canonical_bir_cor") {
      if (typeof body.documentId !== "string" || !reason || reason.length > 2000) throw new PaymentError("Choose a Form 2303 and provide a reason for canonical selection.", 400);
      const selected = await db.rpc("worksync_admin_select_canonical_bir_cor", { p_actor: user.id, p_document_id: body.documentId, p_reason: reason });
      if (selected.error) throw new PaymentError(selected.error.message || "Canonical Form 2303 could not be selected.", 409);
      return json({ selected: true });
    }
    if (typeof body?.documentId !== "string" || !["verified", "rejected", "expired", "revoked"].includes(String(body.decision)) || !reason || reason.length > 2000)
      throw new PaymentError("Choose a document status and enter a review reason up to 2,000 characters.", 400);
    const { data: current, error: currentError } = await db.from("tax_documents").select("document_id,user_id,party_type,document_type,claimed_tax_treatment,legal_basis,expires_at,status").eq("document_id", body.documentId).maybeSingle();
    if (currentError || !current) throw new PaymentError("Tax document not found.", 404);
    if (body.decision === "verified" && current.document_type === "tax_exemption" && (!current.claimed_tax_treatment?.trim() || !current.legal_basis?.trim()))
      throw new PaymentError("A special tax treatment cannot be verified without a stated treatment and legal basis.", 400);
    if (body.decision === "verified" && current.expires_at && current.expires_at < new Date().toISOString().slice(0, 10))
      throw new PaymentError("This document is expired. Ask the user to submit a renewed copy.", 409);
    const allowedCurrentStatuses = body.decision === "expired" ? ["pending", "verified"] : body.decision === "revoked" ? ["verified"] : ["pending"];
    const isFreelancerCor = current.party_type === "freelancer" && current.document_type === "bir_cor";
    const result = isFreelancerCor
      ? await db.rpc("worksync_admin_review_canonical_bir_cor", { p_actor: user.id, p_document_id: body.documentId, p_decision: body.decision, p_reason: reason })
      : await db.from("tax_documents").update({ status: body.decision, reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_reason: reason }).eq("document_id", body.documentId).in("status", allowedCurrentStatuses).select("document_id,user_id,party_type,document_type,status,reviewed_at,review_reason").maybeSingle();
    if (result.error) throw new PaymentError(body.decision === "revoked" ? "Document revocation is unavailable until the prepared tax-review migration is applied." : "Document review could not be saved.", 409);
    if (!isFreelancerCor && !result.data) throw new PaymentError(body.decision === "revoked" ? "Verified document not found or already revoked." : "Pending document not found or already reviewed.", 409);
    const audit = isFreelancerCor ? { error: null } : await db.from("admin_audit_log").insert({ admin_id: user.id, action: `tax_document_${body.decision}`, target_id: body.documentId, details: { party_type: current.party_type, document_type: current.document_type, reason } });
    if (audit.error) throw new PaymentError("Document status was saved, but the supplemental admin audit record failed.");
    return json({ document: result.data });
  } catch (error) { return paymentResponse(error); }
}








