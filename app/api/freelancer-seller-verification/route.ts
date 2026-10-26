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
    const requirementsWithoutBir = (requirements.data ?? []).filter(row => row.document_type !== "bir_cor");
    const birRows = await db.from("tax_documents").select("document_id,document_type,registered_name,status,submitted_at,reviewed_at,review_reason,expires_at,is_canonical_bir_cor").eq("user_id", user.id).eq("party_type", "freelancer").eq("document_type", "bir_cor").order("submitted_at", { ascending: false });
    if (birRows.error) throw new PaymentError("Canonical BIR registration status is unavailable.");
    return json({ requirements: requirementsWithoutBir, events: (events.data ?? []).filter(event => requirementsWithoutBir.some(row => row.requirement_id === event.requirement_id)), eligible: eligible.data === true, birCorDocuments: birRows.data ?? [] });
  } catch (error) { return paymentResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (body?.documentType !== "seller_registration_support" || typeof body.documentPath !== "string" || typeof body.registeredName !== "string" || body.registeredName.length > 200) throw new PaymentError("BIR Form 2303 is submitted in Documentation. Choose a valid additional seller requirement.", 400);
    const expectedPrefix = `${user.id}/seller-verification/${body.documentType}/`;
    if (!body.documentPath.startsWith(expectedPrefix)) throw new PaymentError("Invalid seller document path.", 400);
    const downloaded = await db.storage.from("verification-documents").download(body.documentPath);
    if (downloaded.error || !downloaded.data) throw new PaymentError("Uploaded document could not be verified in private storage.", 400);
    try { inspectTaxDocument(body.documentPath, downloaded.data.type || "application/octet-stream", new Uint8Array(await downloaded.data.arrayBuffer())); }
    catch (cause) { throw new PaymentError(cause instanceof Error ? cause.message : "Document contents are invalid.", 400); }
    const result = await db.rpc("worksync_submit_freelancer_seller_document", { p_user: user.id, p_document_type: body.documentType, p_document_path: body.documentPath, p_registered_name: body.registeredName.trim() });
    if (result.error) throw new PaymentError(result.error.message || "Seller document could not be submitted.", 409);
    await notifySellerDocumentSubmitted(user.id, result.data, "Your additional seller registration supporting document");
    return json({ submissionId: result.data, status: "pending" });
  } catch (error) { return paymentResponse(error); }
}
