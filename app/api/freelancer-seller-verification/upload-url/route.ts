import { PaymentError } from "@/lib/payments/paymongo";
import { TAX_DOCUMENT_MAX_BYTES } from "@/lib/tax/taxDocumentUpload";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const type = body?.documentType;
    if (type !== "bir_cor" && type !== "seller_registration_support") throw new PaymentError("Choose a valid seller document type.", 400);
    if (typeof body?.fileName !== "string" || typeof body.contentType !== "string" || typeof body.size !== "number" || body.size < 1 || body.size > TAX_DOCUMENT_MAX_BYTES) throw new PaymentError("Choose a PDF, JPG, or PNG file up to 5 MB.", 400);
    const ext = body.fileName.split(".").at(-1)?.toLowerCase();
    const valid = (ext === "pdf" && body.contentType === "application/pdf") || (["jpg", "jpeg"].includes(ext ?? "") && ["image/jpeg", "image/jpg"].includes(body.contentType)) || (ext === "png" && body.contentType === "image/png");
    if (!valid) throw new PaymentError("The file type does not match its extension.", 400);
    const profile = await db.from("freelancer_profiles").select("freelancer_id").eq("user_id", user.id).maybeSingle();
    if (profile.error) throw new PaymentError("Unable to check freelancer profile.");
    if (!profile.data) throw new PaymentError("A freelancer profile is required.", 403);
    const req = await db.from("freelancer_seller_verification_requirements").select("requirement_id,status").eq("user_id", user.id).eq("document_type", type).maybeSingle();
    if (req.error || !req.data) throw new PaymentError("Seller verification is not enabled yet. Try again after setup is saved.", 503);
    if (req.data.status !== "not_submitted" && req.data.status !== "rejected") throw new PaymentError("This document cannot be submitted in its current review status.", 409);
    const extension = ext === "jpeg" ? "jpg" : ext;
    const path = `${user.id}/seller-verification/${type}/${crypto.randomUUID()}.${extension}`;
    const signed = await db.storage.from("verification-documents").createSignedUploadUrl(path, { upsert: false });
    if (signed.error || !signed.data?.token) throw new PaymentError("A secure private upload could not be prepared.");
    const ticket = await db.from("freelancer_seller_verification_upload_tickets").insert({ document_path: path, user_id: user.id, requirement_id: req.data.requirement_id, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
    if (ticket.error) throw new PaymentError("A secure private upload could not be prepared.");
    return Response.json({ path, token: signed.data.token, contentType: body.contentType === "image/jpg" ? "image/jpeg" : body.contentType }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return paymentResponse(error); }
}
