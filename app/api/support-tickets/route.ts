import { createClient } from "@supabase/supabase-js";
import { PaymentError } from "@/lib/payments/paymongo";
import { inspectTaxDocument } from "@/lib/tax/taxDocumentUpload";
import { randomUUID } from "node:crypto";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let db: Awaited<ReturnType<typeof paymentUser>>["db"] | null = null;
  let userId = "";
  let attachmentPath: string | null = null;
  let validationToken: string | null = null;
  let ownsUploadTicket = false;
  try {
    const context = await paymentUser(request);
    db = context.db;
    userId = context.user.id;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const categories = ["Account", "Payments", "Projects", "Technical issue", "Safety concern", "Other", "Capacity increase"];
    if (!body || typeof body.category !== "string" || !categories.includes(body.category)
      || typeof body.subject !== "string" || body.subject.trim().length < 4 || body.subject.trim().length > 120
      || typeof body.description !== "string" || body.description.trim().length < 20 || body.description.trim().length > 4000)
      throw new PaymentError("Enter a valid ticket category, subject, and description.", 400);

    if (body.attachmentPath != null) {
      if (typeof body.attachmentPath !== "string" || !new RegExp(`^${userId}/support/[a-f\\d-]{36}\\.(pdf|jpg|png)$`, "i").test(body.attachmentPath))
        throw new PaymentError("Choose a valid ticket attachment.", 400);
      attachmentPath = body.attachmentPath;
      const ticket = await db.from("support_ticket_upload_tickets")
        .select("file_path,expected_size")
        .eq("file_path", attachmentPath)
        .eq("user_id", userId)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (ticket.error || !ticket.data) throw new PaymentError("The attachment upload expired. Select the file again.", 400);
      ownsUploadTicket = true;
      const file = await db.storage.from("support-ticket-attachments").download(attachmentPath);
      if (file.error || !file.data) throw new PaymentError("Upload the selected file before submitting the ticket.", 400);
      const bytes = new Uint8Array(await file.data.arrayBuffer());
      if (bytes.byteLength !== ticket.data.expected_size) throw new PaymentError("The uploaded file size does not match the selected file.", 400);
      try {
        inspectTaxDocument(attachmentPath.split("/").at(-1) ?? "", file.data.type, bytes);
      } catch (cause) {
        throw new PaymentError(cause instanceof Error ? cause.message : "The attachment file is invalid.", 400);
      }
      validationToken = randomUUID();
      const validated = await db.from("support_ticket_upload_tickets").update({
        validated_at: new Date().toISOString(),
        validation_token: validationToken,
      }).eq("file_path", attachmentPath).eq("user_id", userId).is("validated_at", null);
      if (validated.error) throw new PaymentError("The attachment could not be verified for ticket submission.");
    }

    const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw new PaymentError("Sign in again to submit your ticket.", 401);
    const userDb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } },
    );
    const submitted = await userDb.rpc("worksync_submit_support_ticket", {
      p_category: body.category,
      p_subject: body.subject.trim(),
      p_description: body.description.trim(),
      p_attachment_path: attachmentPath,
      p_validation_token: validationToken,
    });
    if (submitted.error || !submitted.data) throw new PaymentError("The ticket could not be submitted. Please try again.", 409);
    if (attachmentPath) await db.from("support_ticket_upload_tickets").delete().eq("file_path", attachmentPath).eq("user_id", userId);
    return Response.json({ ticketId: submitted.data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (ownsUploadTicket && attachmentPath && db) {
      await Promise.all([
        db.storage.from("support-ticket-attachments").remove([attachmentPath]),
        db.from("support_ticket_upload_tickets").delete().eq("file_path", attachmentPath).eq("user_id", userId),
      ]);
    }
    return paymentResponse(error);
  }
}
