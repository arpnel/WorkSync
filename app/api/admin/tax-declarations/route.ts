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
    const { data, error } = await db.from("freelancer_tax_declarations").select("declaration_id,user_id,tax_year,reported_threshold_status,document_path,status,submitted_at,reviewed_by,reviewed_at,review_notes").order("submitted_at", { ascending: false }).limit(200);
    if (error) throw new PaymentError("Tax declarations are unavailable.");
    const declarationIds = (data ?? []).map(row => row.declaration_id);
    const eventsResult = declarationIds.length
      ? await db.from("freelancer_tax_declaration_events").select("event_id,declaration_id,reviewer_id,previous_status,new_status,reason,created_at").in("declaration_id", declarationIds).order("created_at", { ascending: false })
      : { data: [], error: null };
    const events = new Map<string, unknown[]>();
    for (const event of eventsResult.data ?? []) events.set(event.declaration_id, [...(events.get(event.declaration_id) ?? []), event]);
    const profileRows = await db.from("freelancer_tax_profiles").select("user_id,marketplace_withholding_applicable,freelancer_vat_applicable");
    if (profileRows.error) throw new PaymentError("Freelancer tax settings are unavailable.");
    const profiles = new Map((profileRows.data ?? []).map(row => [row.user_id, row]));
    const platformConfig = await db.from("platform_tax_configuration").select("marketplace_withholding_enabled").eq("configuration_id", true).maybeSingle();
    if (platformConfig.error || !platformConfig.data) throw new PaymentError("Platform tax configuration is unavailable.");
    const marketplaceWithholdingEnabled = platformConfig.data?.marketplace_withholding_enabled === true;
    const declarations = await Promise.all((data ?? []).map(async row => {
      const signed = await db.storage.from("verification-documents").createSignedUrl(row.document_path, 600);
      const config = profiles.get(row.user_id);
      return { ...row, review_events: events.get(row.declaration_id) ?? [], marketplace_withholding_applicable: marketplaceWithholdingEnabled && (config?.marketplace_withholding_applicable ?? false), freelancer_vat_applicable: config?.freelancer_vat_applicable ?? false, document_url: signed.error ? null : signed.data.signedUrl };
    }));
    return json({ declarations, marketplaceWithholdingEnabled, revocationAvailable: !eventsResult.error });
  } catch (error) { return paymentResponse(error); }
}
export async function POST(request: Request) {
  try {
    const { db, user } = await requireAdmin(request);
    const body = await request.json().catch(() => null) as { action?: unknown; declarationId?: unknown; decision?: unknown; notes?: unknown; taxYearConfirmed?: unknown; freelancerId?: unknown; vatApplicable?: unknown; marketplaceWithholdingApplicable?: unknown; reason?: unknown } | null;
    if (body?.action === "configure") {
      if (typeof body.freelancerId !== "string" || typeof body.vatApplicable !== "boolean" || typeof body.marketplaceWithholdingApplicable !== "boolean" || typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 2000) throw new PaymentError("Tax configuration changes require a reason up to 2,000 characters.", 400);
      if (body.marketplaceWithholdingApplicable) {
        const platformGate = await db.from("platform_tax_configuration").select("marketplace_withholding_enabled").eq("configuration_id", true).maybeSingle();
        if (platformGate.error || !platformGate.data) throw new PaymentError("Platform withholding configuration is unavailable; no withholding setting can be activated.", 409);
        if (!platformGate.data.marketplace_withholding_enabled) throw new PaymentError("Marketplace withholding remains disabled pending legal confirmation for WorkSync.", 409);
      }
      if (body.vatApplicable) {
        const today = new Date().toISOString().slice(0, 10);
        const proof = await db.from("tax_documents").select("document_id").eq("user_id", body.freelancerId).eq("party_type", "freelancer").eq("document_type", "vat_registration").eq("status", "verified").or(`expires_at.is.null,expires_at.gte.${today}`).limit(1).maybeSingle();
        if (proof.error || !proof.data) throw new PaymentError("VAT treatment requires a current verified VAT registration document.", 409);
      }
      const result = await db.from("freelancer_tax_profiles").upsert({ user_id: body.freelancerId, marketplace_withholding_applicable: body.marketplaceWithholdingApplicable, freelancer_vat_applicable: body.vatApplicable, vat_classification: body.vatApplicable ? "vat_registered" : "unverified", updated_by: user.id, updated_at: new Date().toISOString(), updated_reason: body.reason.trim() });
      if (result.error) throw new PaymentError("Tax configuration could not be saved.");
      const audit = await db.from("admin_audit_log").insert({ admin_id: user.id, action: "configure_freelancer_tax_treatment", target_id: body.freelancerId, details: { marketplace_withholding_applicable: body.marketplaceWithholdingApplicable, freelancer_vat_applicable: body.vatApplicable, reason: body.reason.trim() } });
      if (audit.error) throw new PaymentError("Tax configuration was saved, but the supplemental admin audit record failed.");
      return json({ saved: true });
    }
    if (typeof body?.declarationId !== "string" || !["accepted", "rejected", "revoked"].includes(String(body.decision)) || typeof body.notes !== "string" || !body.notes.trim() || body.notes.length > 2000)
      throw new PaymentError("Choose an outcome and enter review notes up to 2,000 characters.", 400);
    if (body.decision === "accepted" && body.taxYearConfirmed !== true)
      throw new PaymentError("Confirm that the BIR document declares the selected tax year before accepting it.", 400);
    const currentStatuses = body.decision === "revoked" ? ["accepted"] : ["pending"];
    let reviewNotes = body.notes.trim();
    if (body.decision === "accepted") {
      const pending = await db.from("freelancer_tax_declarations").select("tax_year").eq("declaration_id", body.declarationId).eq("status", "pending").maybeSingle();
      if (pending.error || !pending.data) throw new PaymentError("Pending tax declaration not found.", 409);
      reviewNotes += `\n\nTax-year review: reviewer confirmed the BIR document declares tax year ${pending.data.tax_year}.`;
    }
    const result = await db.from("freelancer_tax_declarations").update({ status: body.decision, reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_notes: reviewNotes }).eq("declaration_id", body.declarationId).in("status", currentStatuses).select("declaration_id,user_id,tax_year,status,reviewed_at").maybeSingle();
    if (result.error || !result.data) throw new PaymentError(body.decision === "revoked" ? "Accepted declaration not found or revocation is unavailable until the prepared tax-review migration is applied." : "Pending tax declaration not found.", 409);
    await db.from("admin_audit_log").insert({ admin_id: user.id, action: `tax_declaration_${body.decision}`, target_id: body.declarationId, details: { tax_year: result.data.tax_year, notes: reviewNotes } });
    return json({ declaration: result.data });
  } catch (error) { return paymentResponse(error); }
}


