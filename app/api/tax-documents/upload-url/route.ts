import { PaymentError } from "@/lib/payments/paymongo";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";
import { TAX_DOCUMENT_MAX_BYTES } from "@/lib/tax/taxDocumentUpload";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const types = ["bir_cor", "vat_registration", "tax_exemption", "business_tax_support"];

export async function POST(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const uploadKind = body?.uploadKind === "withholding_declaration" ? "withholding_declaration" : "tax_document";
    if (!(body?.partyType === "freelancer" || body?.partyType === "client") || (uploadKind === "tax_document" && (typeof body.documentType !== "string" || !types.includes(body.documentType)))) throw new PaymentError("Choose a valid account role and tax document type.", 400);
    if (typeof body.fileName !== "string" || typeof body.contentType !== "string" || typeof body.size !== "number" || !Number.isInteger(body.size) || body.size < 1 || body.size > TAX_DOCUMENT_MAX_BYTES) throw new PaymentError("Choose a PDF, JPG, or PNG file up to 5 MB.", 400);
    const ext = body.fileName.split(".").at(-1)?.toLowerCase();
    const valid = (ext === "pdf" && body.contentType === "application/pdf")
      || (["jpg", "jpeg"].includes(ext ?? "") && ["image/jpeg", "image/jpg"].includes(body.contentType))
      || (ext === "png" && body.contentType === "image/png");
    if (!valid) throw new PaymentError("The file type does not match its extension.", 400);
    const [freelancer, client] = await Promise.all([
      db.from("freelancer_profiles").select("user_id").eq("user_id", user.id).maybeSingle(),
      db.from("client_profiles").select("user_id").eq("user_id", user.id).maybeSingle(),
    ]);
    if (freelancer.error || client.error) throw new PaymentError("Unable to check account roles.");
    if (body.partyType === "freelancer" ? !freelancer.data : !client.data) throw new PaymentError("That account role is not available.", 403);
    if (uploadKind === "withholding_declaration") {
      const year = Number(body.taxYear);
      if (body.partyType !== "freelancer" || !Number.isInteger(year) || year < 2024 || year > new Date().getUTCFullYear() + 1) throw new PaymentError("Choose a valid freelancer tax year.", 400);
    }

    const normalizedExtension = ext === "jpeg" ? "jpg" : ext;
    const path = uploadKind === "withholding_declaration"
      ? `${user.id}/tax/${Number(body.taxYear)}/${crypto.randomUUID()}.${normalizedExtension}`
      : `${user.id}/tax-docs/${body.partyType}/${crypto.randomUUID()}.${normalizedExtension}`;
    const { data: signed, error: signedError } = await db.storage.from("verification-documents").createSignedUploadUrl(path, { upsert: false });
    if (signedError || !signed?.token) throw new PaymentError("A secure upload could not be prepared.");
    await db.from("tax_document_upload_tickets").delete().lt("expires_at", new Date().toISOString());
    const ticket = await db.from("tax_document_upload_tickets").insert({ document_path: path, user_id: user.id, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
    if (ticket.error) throw new PaymentError("A secure upload could not be prepared.");
    return json({ path, token: signed.token, uploadKind, contentType: body.contentType === "image/jpg" ? "image/jpeg" : body.contentType });
  } catch (error) { return paymentResponse(error); }
}
