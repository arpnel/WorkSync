import "server-only";
import { workSyncUrl } from "@/lib/email/emailLinks";
import {
  getTrustedUserEmail,
  sendWorkSyncEmailSafely,
} from "@/services/email/brevoEmailService";

export async function notifySellerDocumentSubmitted(
  userId: string,
  submissionId: string,
  documentLabel: string,
) {
  const kind = "seller_verification_submitted" as const;
  try {
    const recipient = await getTrustedUserEmail(userId);
    if (!recipient) {
      console.warn("WorkSync email skipped", {
        kind,
        reason: "recipient_email_unavailable",
      });
      return;
    }
    await sendWorkSyncEmailSafely({
      kind,
      eventId: `seller-verification-submitted:${submissionId}`,
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      subject: "Seller document submitted for review",
      heading: "Your document is awaiting review",
      message: `${documentLabel} was submitted successfully. We’ll notify you when its review status changes. You can check progress or submit a corrected document in Settings.`,
      actionLabel: "View seller verification",
      actionUrl: workSyncUrl("/home/settings#seller-verification"),
    });
  } catch {
    console.error("WorkSync email recipient lookup failed", { kind });
  }
}

export async function notifySellerDocumentReviewed(
  userId: string,
  submissionId: string,
  status: "verified" | "rejected" | "not_applicable",
  documentLabel: string,
  reviewReason: string,
) {
  const kind = "seller_verification_reviewed" as const;
  try {
    const recipient = await getTrustedUserEmail(userId);
    if (!recipient) return;
    const verified = status === "verified";
    const notApplicable = status === "not_applicable";
    await sendWorkSyncEmailSafely({
      kind,
      eventId: `seller-verification-reviewed:${submissionId}:${status}`,
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      subject: verified
        ? "Seller document verified"
        : notApplicable
          ? "Seller document requirement updated"
          : "Seller document needs correction",
      heading: verified
        ? "Your seller document was verified"
        : notApplicable
          ? "A seller document is no longer required"
          : "Please correct your seller document",
      message: verified
        ? `${documentLabel} was verified. Check Seller verification in Settings for your current publishing eligibility.`
        : notApplicable
          ? `${documentLabel} was marked not applicable. Check Seller verification in Settings for your current publishing eligibility.`
          : `${documentLabel} was rejected: ${reviewReason} Submit a corrected document from Seller verification in Settings.`,
      actionLabel: "View seller verification",
      actionUrl: workSyncUrl("/home/settings#seller-verification"),
    });
  } catch {
    console.error("WorkSync email recipient lookup failed", { kind });
  }
}
