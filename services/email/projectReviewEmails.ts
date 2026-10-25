import "server-only";
import { workSyncUrl } from "@/lib/email/emailLinks";
import {
  emailAdminClient,
  getTrustedUserEmail,
  sendWorkSyncEmail,
} from "@/services/email/brevoEmailService";

type ReviewEmailEvent = {
  event_id: string;
  submission_id: string;
  project_id: string;
  milestone_id: string | null;
  event_type:
    | "submission_initial"
    | "standard_overdue_start"
    | "reminder_24h"
    | "reminder_48h";
  recipient_user_id: string;
  project_title: string;
  milestone_title: string | null;
  order_id: string | null;
  scheduled_at: string;
  response_deadline: string | null;
  auto_accept_at: string | null;
};

function when(value: string | null) {
  if (!value) return "the agreed deadline";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value)) + " Philippine time";
}

function content(event: ReviewEmailEvent, requestUrl: string) {
  const item = event.milestone_title
    ? `${event.milestone_title} in ${event.project_title || "your project"}`
    : event.project_title || "your project";
  const milestone = Boolean(event.milestone_id);
  let subject = "Project work is ready for your review";
  let heading = "Your freelancer submitted work";
  let message = milestone
    ? `Review ${item} by ${when(event.auto_accept_at)}. If you do not respond by then, the submitted milestone will be automatically accepted.`
    : `Review ${item} by ${when(event.response_deadline)}. If you have not responded by that deadline, a 72-hour grace period begins. The submitted work may be automatically accepted at ${when(event.auto_accept_at)}.`;

  if (event.event_type === "standard_overdue_start") {
    subject = "Project review grace period has started";
    heading = "Project work is awaiting your review";
    message = `${item} is still awaiting your review after its original deadline. The 72-hour grace period ends at ${when(event.auto_accept_at)}. It will be automatically accepted then if it remains eligible.`;
  } else if (event.event_type === "reminder_24h") {
    subject = "Reminder: project work is waiting for review";
    heading = milestone ? "A milestone needs your review" : "Project work needs your review";
    message = `Please review ${item}. ${milestone ? `Automatic acceptance is scheduled for ${when(event.auto_accept_at)}.` : `The overdue grace period ends at ${when(event.auto_accept_at)}.`}`;
  } else if (event.event_type === "reminder_48h") {
    subject = "Final reminder: review deadline is approaching";
    heading = "Final reminder to review submitted work";
    message = `${item} is still awaiting review. Automatic acceptance is scheduled for ${when(event.auto_accept_at)} if you do not respond first.`;
  }

  const path = event.order_id
    ? `/home/projects/milestone/${event.order_id}`
    : "/home/projects";
  return {
    kind: "project_submission_review" as const,
    eventId: `project-review-email:${event.event_id}`,
    subject,
    heading,
    message,
    actionLabel: "Review project work",
    actionUrl: workSyncUrl(path, requestUrl),
  };
}

async function sendClaimedEvent(
  db: ReturnType<typeof emailAdminClient>,
  event: ReviewEmailEvent,
  requestUrl: string,
) {
  try {
    const recipient = await getTrustedUserEmail(event.recipient_user_id);
    if (!recipient) throw new Error("recipient_unavailable");
    await sendWorkSyncEmail({
      ...content(event, requestUrl),
      recipientEmail: recipient.email,
      recipientName: recipient.name,
    });
    const finished = await db.rpc("worksync_finish_project_review_email", {
      p_event: event.event_id,
      p_sent: true,
    });
    if (finished.error) throw new Error("email_delivery_state_update_failed");
    return true;
  } catch {
    await db.rpc("worksync_finish_project_review_email", {
      p_event: event.event_id,
      p_sent: false,
    });
    console.error("Project review email delivery failed", {
      eventId: event.event_id,
      eventType: event.event_type,
    });
    return false;
  }
}

export async function notifyProjectWorkSubmitted(
  _projectId: string,
  _submissionId: string,
  _milestoneId: string | null,
  requestUrl: string,
) {
  try {
    await processDueProjectReviewEmails(requestUrl);
  } catch {
    console.error("Project review email queue could not be processed.");
  }
}

export async function processDueProjectReviewEmails(requestUrl: string) {
  const db = emailAdminClient();
  const { data, error } = await db.rpc("worksync_claim_project_review_emails", {
    // Keep worst-case provider retries inside the cron's remaining function time.
    p_limit: 8,
  });
  if (error) throw new Error("Project review email queue is unavailable.");
  const events = (data ?? []) as ReviewEmailEvent[];
  let sent = 0;
  let failed = 0;
  for (const event of events) {
    if (await sendClaimedEvent(db, event, requestUrl)) sent++;
    else failed++;
  }
  return { processed: events.length, sent, failed };
}
