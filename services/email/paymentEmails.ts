import "server-only";
import { emailAdminClient, getTrustedUserEmail, sendWorkSyncEmailSafely } from "@/services/email/brevoEmailService";
import { workSyncUrl } from "@/lib/email/emailLinks";

export async function notifyPaymentConfirmed(paymentId: string, projectId: string, payerUserId: string) {
  const db = emailAdminClient();
  const { data: project, error } = await db.from("projects").select("title,order_id").eq("project_id", projectId).maybeSingle();
  if (error || !project) return;
  const recipient = await getTrustedUserEmail(payerUserId);
  if (!recipient) return;
  const path = project.order_id ? `/home/projects/milestone/${project.order_id}` : "/home/projects";
  await sendWorkSyncEmailSafely({
    kind: "payment_confirmed",
    eventId: `payment-confirmed:${paymentId}`,
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    subject: "Your WorkSync payment is confirmed",
    heading: "Payment received",
    message: `Your payment for ${project.title || "your project"} has been verified. Open the project to view the transaction receipt.`,
    actionLabel: "View payment and receipt",
    actionUrl: workSyncUrl(path),
  });
}
