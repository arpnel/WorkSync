import { PaymentError } from "@/lib/payments/paymongo";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";
import { notifySellerDocumentReviewed } from "@/services/email/sellerVerificationEmails";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function requireAdmin(request: Request) {
  const auth = await paymentUser(request);
  const member = await auth.db.from("admin_members").select("user_id").eq("user_id", auth.user.id).maybeSingle();
  if (member.error || !member.data) throw new PaymentError("Administrator access required.", 403);
  return auth;
}

export async function GET(request: Request) {
  try {
    const { db } = await requireAdmin(request);
    const result = await db.from("freelancer_seller_verification_requirements").select("requirement_id,user_id,freelancer_id,document_type,requirement_label,required_for_publishing,status,current_submission_id,review_reason,updated_at").neq("document_type", "bir_cor").order("updated_at", { ascending: false }).limit(500);
    if (result.error) throw new PaymentError("Seller verification queue is unavailable. The prepared migration may not be applied.", 503);
    const ids = (result.data ?? []).map(row => row.requirement_id);
    const [submissions, events] = ids.length ? await Promise.all([
      db.from("freelancer_seller_verification_submissions").select("submission_id,requirement_id,user_id,document_path,registered_name,status,submitted_at,review_reason").in("requirement_id", ids).order("submitted_at", { ascending: false }),
      db.from("freelancer_seller_verification_events").select("event_id,requirement_id,actor_id,actor_kind,action,previous_status,new_status,reason,created_at").in("requirement_id", ids).order("created_at", { ascending: false }),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (submissions.error || events.error) throw new PaymentError("Seller verification history is unavailable.");
    const signedRows = await Promise.all((submissions.data ?? []).map(async row => {
      const signed = await db.storage.from("verification-documents").createSignedUrl(row.document_path, 600, { download: true });
      return { ...row, document_url: signed.error ? null : signed.data.signedUrl };
    }));
    return json({ requirements: result.data ?? [], submissions: signedRows, events: events.data ?? [] });
  } catch (error) { return paymentResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { db, user } = await requireAdmin(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (body?.action === "configure") {
      if (typeof body.userId !== "string" || body.documentType !== "seller_registration_support" || typeof body.label !== "string" || typeof body.required !== "boolean" || reason.length < 2 || reason.length > 2000)
        throw new PaymentError("Provide a freelancer, document type, requirement label, required status, and reason.", 400);
      const configured = await db.rpc("worksync_admin_configure_seller_requirement", { p_actor: user.id, p_user: body.userId, p_document_type: body.documentType, p_label: body.label.trim(), p_required: body.required, p_reason: reason });
      if (configured.error) throw new PaymentError(configured.error.message || "Requirement could not be configured.", 409);
      return json({ requirementId: configured.data });
    }
    if (typeof body?.requirementId !== "string" || !["verified", "rejected", "not_applicable"].includes(String(body.action)) || reason.length < 2 || reason.length > 2000)
      throw new PaymentError("Choose an action and enter a clear review reason.", 400);
    const requirementRow = await db.from("freelancer_seller_verification_requirements").select("document_type").eq("requirement_id", body.requirementId).maybeSingle();
    if (requirementRow.error || !requirementRow.data || requirementRow.data.document_type === "bir_cor")
      throw new PaymentError("Form 2303 is reviewed in Tax Documents. This queue accepts additional seller requirements only.", 409);
    const reviewed = await db.rpc("worksync_admin_review_seller_requirement", { p_actor: user.id, p_requirement_id: body.requirementId, p_action: body.action, p_reason: reason });
    if (reviewed.error) throw new PaymentError(reviewed.error.message || "Seller document review could not be saved.", 409);
    const requirement = await db.from("freelancer_seller_verification_requirements").select("user_id,current_submission_id,requirement_label").eq("requirement_id", body.requirementId).maybeSingle();
    if (requirement.error || !requirement.data?.user_id) {
      console.warn("Seller verification email skipped", { reason: "review_recipient_lookup_failed", code: requirement.error?.code ?? null });
    } else if (requirement.data.current_submission_id) {
      await notifySellerDocumentReviewed(
        requirement.data.user_id,
        requirement.data.current_submission_id,
        body.action as "verified" | "rejected" | "not_applicable",
        requirement.data.requirement_label,
        reason,
      );
    }
    return json({ saved: true });
  } catch (error) { return paymentResponse(error); }
}
