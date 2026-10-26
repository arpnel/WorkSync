import { timingSafeEqual } from "node:crypto";
import { workSyncUrl } from "@/lib/email/emailLinks";
import { emailAdminClient, getTrustedUserEmail, sendWorkSyncEmail } from "@/services/email/brevoEmailService";

export const runtime = "nodejs";
export const maxDuration = 60;

type Reminder = {
  event_id: string;
  meeting_id: string;
  user_id: string;
  starts_at: string;
  meeting_title: string;
  order_id: string;
  project_title: string;
};

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  return Boolean(secret && actual.length === expected.length && timingSafeEqual(actual, expected));
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = emailAdminClient();
    const claimed = await db.rpc("worksync_claim_project_meeting_reminders", { p_window_minutes: 30 });
    if (claimed.error) throw new Error("meeting_reminder_claim_failed");
    const reminders = (claimed.data ?? []) as Reminder[];
    let sent = 0;
    let skipped = 0;

    for (const reminder of reminders) {
      const current = await db.from("project_meetings").select("meeting_id,starts_at,status").eq("meeting_id", reminder.meeting_id).maybeSingle();
      if (current.error || !current.data || current.data.status !== "scheduled" || Date.parse(current.data.starts_at) !== Date.parse(reminder.starts_at)) {
        await db.rpc("worksync_finish_project_meeting_reminder", { p_event_id: reminder.event_id, p_sent: true, p_error: "" });
        skipped++;
        continue;
      }
      const recipient = await getTrustedUserEmail(reminder.user_id);
      if (!recipient) {
        await db.rpc("worksync_finish_project_meeting_reminder", { p_event_id: reminder.event_id, p_sent: false, p_error: "recipient_email_unavailable" });
        skipped++;
        continue;
      }
      try {
        await sendWorkSyncEmail({
          kind: "project_meeting_reminder",
          eventId: `project-meeting-reminder:${reminder.event_id}`,
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          subject: `Reminder: ${reminder.meeting_title} starts soon`,
          heading: "Your project meeting starts within 30 minutes",
          message: `${reminder.meeting_title} for ${reminder.project_title || "your project"} is about to start. Open the project conversation in WorkSync to start a video call.`,
          actionLabel: "Open projects",
          actionUrl: workSyncUrl("/home/projects", request.url),
        });
        const finished = await db.rpc("worksync_finish_project_meeting_reminder", { p_event_id: reminder.event_id, p_sent: true, p_error: "" });
        if (finished.error) throw new Error("meeting_reminder_completion_failed");
        sent++;
      } catch {
        await db.rpc("worksync_finish_project_meeting_reminder", { p_event_id: reminder.event_id, p_sent: false, p_error: "email_delivery_failed" });
        skipped++;
      }
    }
    return Response.json({ processed: reminders.length, emailsAccepted: sent, skipped }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Meeting reminders are unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
