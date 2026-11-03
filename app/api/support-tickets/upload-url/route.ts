import { randomUUID } from "node:crypto";
import { PaymentError } from "@/lib/payments/paymongo";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";
import { TAX_DOCUMENT_MAX_BYTES } from "@/lib/tax/taxDocumentUpload";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (typeof body?.fileName !== "string" || typeof body.contentType !== "string" || typeof body.size !== "number" || !Number.isInteger(body.size) || body.size < 1 || body.size > TAX_DOCUMENT_MAX_BYTES)
      throw new PaymentError("Choose a PDF, JPG, or PNG file up to 5 MB.", 400);
    const extension = body.fileName.split(".").at(-1)?.toLowerCase();
    const valid = (extension === "pdf" && body.contentType === "application/pdf")
      || (["jpg", "jpeg"].includes(extension ?? "") && ["image/jpeg", "image/jpg"].includes(body.contentType))
      || (extension === "png" && body.contentType === "image/png");
    if (!valid) throw new PaymentError("The file type must match its PDF, JPG, or PNG extension.", 400);

    const stale = await db.from("support_ticket_upload_tickets").select("file_path").lt("expires_at", new Date().toISOString()).limit(100);
    if (!stale.error && stale.data?.length) {
      await db.storage.from("support-ticket-attachments").remove(stale.data.map((row) => row.file_path));
      await db.from("support_ticket_upload_tickets").delete().in("file_path", stale.data.map((row) => row.file_path));
    }

    const normalizedExtension = extension === "jpeg" ? "jpg" : extension;
    const path = `${user.id}/support/${randomUUID()}.${normalizedExtension}`;
    const signed = await db.storage.from("support-ticket-attachments").createSignedUploadUrl(path, { upsert: false });
    if (signed.error || !signed.data?.token) throw new PaymentError("A secure attachment upload could not be prepared.");
    const ticket = await db.from("support_ticket_upload_tickets").insert({
      file_path: path,
      user_id: user.id,
      expected_size: body.size,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
    if (ticket.error) throw new PaymentError("Attachment uploads are not enabled yet. Please submit your ticket without a file.", 503);
    return Response.json({ path, token: signed.data.token, contentType: extension === "jpeg" || extension === "jpg" ? "image/jpeg" : body.contentType }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return paymentResponse(error);
  }
}
