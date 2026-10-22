import "server-only";
import { emailAdminClient, getTrustedUserEmail, sendWorkSyncEmailSafely } from "@/services/email/brevoEmailService";
import { workSyncUrl } from "@/lib/email/emailLinks";

export async function notifyProjectWorkSubmitted(projectId: string, submissionId: string, milestoneId: string | null, requestUrl: string) {
  const db = emailAdminClient();
  const { data: project, error } = await db.from("projects").select("title,order_id,client_id").eq("project_id", projectId).maybeSingle();
  if (error || !project) {
    console.warn("WorkSync project email skipped", {
      kind: "project_work_submitted",
      reason: error ? "project_lookup_failed" : "project_missing",
      code: error?.code,
    });
    return;
  }
  const [client, milestone] = await Promise.all([
    db.from("client_profiles").select("user_id").eq("client_id", project.client_id).maybeSingle(),
    milestoneId ? db.from("milestones").select("title").eq("milestone_id", milestoneId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (client.error || !client.data?.user_id || milestone.error) {
    console.warn("WorkSync project email skipped", {
      kind: "project_work_submitted",
      reason: client.error ? "client_lookup_failed" : milestone.error ? "milestone_lookup_failed" : "client_user_missing",
      code: client.error?.code ?? milestone.error?.code,
    });
    return;
  }
  const recipient = await getTrustedUserEmail(client.data.user_id);
  if (!recipient) {
    console.warn("WorkSync project email skipped", {
      kind: "project_work_submitted",
      reason: "client_auth_email_missing",
    });
    return;
  }
  const path = project.order_id ? `/home/projects/milestone/${project.order_id}` : "/home/projects";
  await sendWorkSyncEmailSafely({
    kind: "project_work_submitted",
    eventId: `project-work-submitted:${submissionId}`,
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    subject: "Project work is ready for review",
    heading: "Your freelancer submitted project work",
    message: `${project.title || "Your project"}${milestone.data?.title ? ` · ${milestone.data.title}` : ""} has a new work submission in WorkSync.`,
    actionLabel: "Review project",
    actionUrl: workSyncUrl(path, requestUrl),
  });
}

export async function notifyProjectWorkReviewed(projectId: string, submissionId: string, action: "approve" | "revision", requestUrl: string) {
  const db = emailAdminClient();
  const { data: project, error } = await db.from("projects").select("title,order_id,freelancer_id").eq("project_id", projectId).maybeSingle();
  if (error || !project) return;
  const { data: freelancer, error: freelancerError } = await db.from("freelancer_profiles").select("user_id").eq("freelancer_id", project.freelancer_id).maybeSingle();
  if (freelancerError || !freelancer?.user_id) return;
  const recipient = await getTrustedUserEmail(freelancer.user_id);
  if (!recipient) return;
  const approved = action === "approve";
  const path = project.order_id ? `/home/projects/milestone/${project.order_id}` : "/home/projects";
  await sendWorkSyncEmailSafely({
    kind: "project_work_reviewed",
    eventId: `project-work-${action}:${submissionId}`,
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    subject: approved ? "Your WorkSync submission was approved" : "Your WorkSync submission needs revision",
    heading: approved ? "Your work was approved" : "Revision requested",
    message: approved ? `${project.title || "Your project"} submission was approved by the client.` : `The client requested a revision to your submission for ${project.title || "your project"}. Open WorkSync to review the feedback.`,
    actionLabel: "Open project",
    actionUrl: workSyncUrl(path, requestUrl),
  });
}
