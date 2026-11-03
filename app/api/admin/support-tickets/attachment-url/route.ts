import { PaymentError } from "@/lib/payments/paymongo";
import { paymentResponse, paymentUser } from "@/services/payments/paymentServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { db, user } = await paymentUser(request);
    const admin = await db.from("admin_members").select("user_id").eq("user_id", user.id).maybeSingle();
    if (admin.error) throw new PaymentError("Unable to verify administrator access.");
    if (!admin.data) throw new PaymentError("Administrator access required.", 403);
    const ticketId = new URL(request.url).searchParams.get("ticketId");
    if (!ticketId || !/^[a-f\d-]{36}$/i.test(ticketId)) throw new PaymentError("Choose a valid support ticket.", 400);
    const ticket = await db.from("support_tickets").select("attachment_path").eq("ticket_id", ticketId).maybeSingle();
    if (ticket.error || !ticket.data) throw new PaymentError("Support ticket not found.", 404);
    if (!ticket.data.attachment_path) return Response.json({ url: null }, { headers: { "Cache-Control": "no-store" } });
    const signed = await db.storage.from("support-ticket-attachments").createSignedUrl(ticket.data.attachment_path, 300, { download: true });
    if (signed.error || !signed.data?.signedUrl) throw new PaymentError("Ticket attachment is unavailable.", 404);
    return Response.json({ url: signed.data.signedUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return paymentResponse(error);
  }
}
