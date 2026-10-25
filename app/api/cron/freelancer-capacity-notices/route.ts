import { timingSafeEqual } from "node:crypto";
import { workSyncUrl } from "@/lib/email/emailLinks";
import {
  emailAdminClient,
  getTrustedUserEmail,
  sendWorkSyncEmail,
} from "@/services/email/brevoEmailService";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = emailAdminClient();
  const { data: rows, error } = await db
    .from("freelancer_capacity_eligibility_notices")
    .select("freelancer_id,user_id,email_attempts")
    .is("email_sent_at", null)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) return Response.json({ error: "Capacity notices unavailable." }, { status: 503 });

  let sent = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    try {
      const recipient = await getTrustedUserEmail(row.user_id);
      if (!recipient) throw new Error("recipient_unavailable");
      await sendWorkSyncEmail({
        kind: "freelancer_capacity_eligible",
        eventId: `freelancer-capacity-eligible:${row.freelancer_id}`,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        subject: "You can request more project capacity",
        heading: "You are eligible to request more capacity",
        message: "You have completed at least 10 projects, have an average client rating of 4 or higher, and have no open disputes. Submit a Capacity increase support ticket and an administrator will review your request.",
        actionLabel: "Open WorkSync",
        actionUrl: workSyncUrl("/home", request.url),
      });
      const saved = await db
        .from("freelancer_capacity_eligibility_notices")
        .update({ email_sent_at: new Date().toISOString(), email_attempts: row.email_attempts + 1, last_email_error: null })
        .eq("freelancer_id", row.freelancer_id)
        .is("email_sent_at", null);
      if (saved.error) throw new Error("delivery_state_update_failed");
      sent++;
    } catch {
      failed++;
      await db
        .from("freelancer_capacity_eligibility_notices")
        .update({ email_attempts: row.email_attempts + 1, last_email_error: "delivery_failed" })
        .eq("freelancer_id", row.freelancer_id)
        .is("email_sent_at", null);
    }
  }
  return Response.json({ processed: (rows ?? []).length, sent, failed }, {
    headers: { "Cache-Control": "no-store" },
  });
}
