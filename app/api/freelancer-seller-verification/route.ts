import { PaymentError } from "@/lib/payments/paymongo";
import { inspectTaxDocument } from "@/lib/tax/taxDocumentUpload";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";
import { notifySellerDocumentSubmitted } from "@/services/email/sellerVerificationEmails";

export const runtime = "nodejs";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const profile = await db.from("freelancer_profiles").select("freelancer_id").eq("user_id", user.id).maybeSingle();
    if (profile.error) throw new PaymentError("Unable to check freelancer profile.");
    if (!profile.data) return json({ requirements: [], events: [], eligible: false, setupRequired: true });
    const [requirements, eligible] = await Promise.all([
      db.from("freelancer_seller_verification_requirements").select("requirement_id,document_type,requirement_label,required_for_publishing,status,current_submission_id,review_reason,updated_at").eq("user_id", user.id).order("created_at"),
      db.rpc("worksync_freelancer_seller_eligible", { p_user: user.id }),
    ]);
    if (requirements.error || eligible.error) throw new PaymentError("Seller verification is not available yet. The prepared database migration must be applied by an administrator.", 503);
    const ids = (requirements.data ?? []).map(row => row.requirement_id);
    const events = ids.length ? await db.from("freelancer_seller_verification_events").select("event_id,requirement_id,action,previous_status,new_status,reason,created_at").in("requirement_id", ids).order("created_at", { ascending: false }) : { data: [], error: null };
    if (events.error) throw new PaymentError("Seller verification history is unavailable.");
    return json({ requirements: requirements.data ?? [], events: events.data ?? [], eligible: eligible.data === true });
  } catch (error) { return paymentResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if ((body?.documentType !== "bir_cor" && body?.documentType !== "seller_registration_support") || typeof body.documentPath !== "string" || typeof body.registeredName !== "string" || body.registeredName.length > 200) throw new PaymentError("Choose a document, upload it, and enter the registered name when submitting Form 2303.", 400);
    const expectedPrefix = `${user.id}/seller-verification/${body.documentType}/`;
    if (!body.documentPath.startsWith(expectedPrefix)) throw new PaymentError("Invalid seller document path.", 400);
    const downloaded = await db.storage.from("verification-documents").download(body.documentPath);
    if (downloaded.error || !downloaded.data) throw new PaymentError("Uploaded document could not be verified in private storage.", 400);
    try { inspectTaxDocument(body.documentPath, downloaded.data.type || "application/octet-stream", new Uint8Array(await downloaded.data.arrayBuffer())); }
    catch (cause) { throw new PaymentError(cause instanceof Error ? cause.message : "Document contents are invalid.", 400); }
    const result = await db.rpc("worksync_submit_freelancer_seller_document", { p_user: user.id, p_document_type: body.documentType, p_document_path: body.documentPath, p_registered_name: body.registeredName.trim() });
    if (result.error) throw new PaymentError(result.error.message || "Seller document could not be submitted.", 409);
    const documentLabel = body.documentType === "bir_cor"
      ? "Your BIR Certificate of Registration"
      : "Your seller registration supporting document";
    await notifySellerDocumentSubmitted(user.id, result.data, documentLabel);
    return json({ submissionId: result.data, status: "pending" });
  } catch (error) { return paymentResponse(error); }
}
