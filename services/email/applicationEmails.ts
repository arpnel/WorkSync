import "server-only";
import { emailAdminClient, getTrustedUserEmail, sendWorkSyncEmailSafely } from "@/services/email/brevoEmailService";
import { workSyncUrl } from "@/lib/email/emailLinks";

export async function notifyJobApplicationReceived(applicationId: string, applicantUserId: string, requestUrl: string) {
  const admin = emailAdminClient();
  const { data: application, error } = await admin.from("job_applications")
    .select("application_id,job_id,freelancer_id").eq("application_id", applicationId).maybeSingle();
  if (error || !application) return;
  const [jobResult, freelancerResult] = await Promise.all([
    admin.from("jobs").select("title,client_id").eq("job_id", application.job_id).maybeSingle(),
    admin.from("freelancer_profiles").select("user_id").eq("freelancer_id", application.freelancer_id).maybeSingle(),
  ]);
  if (jobResult.error || !jobResult.data || freelancerResult.error || !freelancerResult.data) return;
  const { data: client, error: clientError } = await admin.from("client_profiles")
    .select("user_id").eq("client_id", jobResult.data.client_id).maybeSingle();
  if (clientError || !client?.user_id || client.user_id === applicantUserId) return;
  const [recipient, applicant] = await Promise.all([
    getTrustedUserEmail(client.user_id), getTrustedUserEmail(freelancerResult.data.user_id),
  ]);
  if (!recipient) return;
  await sendWorkSyncEmailSafely({
    kind: "job_application_received",
    eventId: `job-application-received:${application.application_id}`,
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    subject: "New application for your WorkSync job",
    heading: "You received a job application",
    message: `${applicant?.name || "A freelancer"} applied for ${jobResult.data.title || "your job"}. Open WorkSync to review the application.`,
    actionLabel: "Review application",
    actionUrl: workSyncUrl("/home/projects", requestUrl),
  });
}

export async function notifyJobApplicationDecision(applicationId: string, accepted: boolean, conversationId: string | null, requestUrl: string) {
  const admin = emailAdminClient();
  const { data: application, error } = await admin.from("job_applications")
    .select("job_id,freelancer_id").eq("application_id", applicationId).maybeSingle();
  if (error || !application) return;
  const [jobResult, freelancerResult] = await Promise.all([
    admin.from("jobs").select("title").eq("job_id", application.job_id).maybeSingle(),
    admin.from("freelancer_profiles").select("user_id").eq("freelancer_id", application.freelancer_id).maybeSingle(),
  ]);
  if (jobResult.error || !jobResult.data || freelancerResult.error || !freelancerResult.data) return;
  const recipient = await getTrustedUserEmail(freelancerResult.data.user_id);
  if (!recipient) return;
  await sendWorkSyncEmailSafely({
    kind: "job_application_decision",
    eventId: `job-application-${accepted ? "accepted" : "declined"}:${applicationId}`,
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    subject: accepted ? "Your WorkSync application was accepted" : "Your WorkSync application was declined",
    heading: accepted ? "The client wants to discuss your application" : "Application update",
    message: accepted
      ? `Your application for ${jobResult.data.title || "a WorkSync job"} was accepted. WorkSync opened a conversation so you can discuss the project.`
      : `The client declined your application for ${jobResult.data.title || "a WorkSync job"}. You can explore other opportunities on WorkSync.`,
    actionLabel: accepted ? "Open conversation" : "Explore jobs",
    actionUrl: workSyncUrl(accepted && conversationId ? `/home/messages?conversation=${encodeURIComponent(conversationId)}` : "/home/marketplace", requestUrl),
  });
}
