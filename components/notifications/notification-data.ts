import { supabase } from "@/lib/supabaseClient";

export type NotificationKind =
  | "message"
  | "project"
  | "agreement"
  | "listing"
  | "system";

export function getNotificationKind(type: string | null): NotificationKind {
  if (type?.includes("message")) return "message";
  if (type?.includes("contract") || type?.includes("agreement"))
    return "agreement";
  if (
    type?.includes("service") ||
    type?.includes("application") ||
    type?.includes("listing")
  )
    return "listing";
  if (type?.includes("project") || type?.includes("milestone"))
    return "project";
  return "system";
}

export function getNotificationHref(
  type: string | null,
  relatedId: string | null,
) {
  if (type === "subscription_expiry") return "/home/subscription";
  if (type === "skill_assessment")
    return relatedId
      ? `/home/assessments?opening=${encodeURIComponent(relatedId)}`
      : "/home/assessments";
  if (type?.includes("message")) return "/home/messages";
  if (
    type?.includes("service_request") ||
    type?.includes("project") ||
    type?.includes("contract") ||
    type?.includes("agreement") ||
    type?.includes("application")
  )
    return "/home/projects";
  return relatedId ? `/home/notifications#${relatedId}` : "/home/notifications";
}

export async function getApprovedApplicationHref(jobId: string) {
  const auth = await supabase.auth.getSession();
  if (auth.error) throw auth.error;
  if (!auth.data.session?.user) throw new Error("Sign in to open this application.");
  const freelancer = await supabase
    .from("freelancer_profiles")
    .select("freelancer_id")
    .eq("user_id", auth.data.session.user.id)
    .maybeSingle();
  if (freelancer.error) throw freelancer.error;
  if (!freelancer.data) return null;

  const applications = await supabase
    .from("job_applications")
    .select("application_id")
    .eq("job_id", jobId)
    .eq("freelancer_id", freelancer.data.freelancer_id)
    .eq("status", "accepted")
    .maybeSingle();
  if (applications.error) throw applications.error;
  if (!applications.data) return null;

  const conversations = await supabase
    .from("conversations")
    .select("conversation_id")
    .eq("job_id", jobId)
    .limit(1)
    .maybeSingle();
  if (conversations.error) throw conversations.error;
  return conversations.data?.conversation_id
    ? "/home/messages?conversation=" +
        encodeURIComponent(conversations.data.conversation_id)
    : null;
}

export async function getProjectNotificationHref(
  type: string | null,
  relatedId: string,
) {
  const normalizedType = type?.toLowerCase() ?? "";
  if (!/project|contract|agreement|milestone/.test(normalizedType)) return null;

  const order = await supabase
    .from("service_orders")
    .select("order_id,application_id,job_id,status,services(service_type)")
    .eq("order_id", relatedId)
    .maybeSingle();
  if (order.error) throw order.error;
  let orderId = order.data?.order_id ?? null;
  let applicationId = order.data?.application_id ?? null;
  let jobId = order.data?.job_id ?? null;
  let orderStatus = order.data?.status ?? null;
  const service = Array.isArray(order.data?.services)
    ? order.data.services[0]
    : order.data?.services;
  let serviceType = service?.service_type;
  let projectType: string | null = null;
  let hasMilestones = false;

  if (!orderId) {
    const project = await supabase
      .from("projects")
      .select("order_id,status,project_type,milestones!milestones_project_id_fkey(milestone_id)")
      .eq("project_id", relatedId)
      .maybeSingle();
    if (project.error) throw project.error;
    orderId = project.data?.order_id ?? null;
    projectType = project.data?.project_type ?? null;
    hasMilestones = Array.isArray(project.data?.milestones) && project.data.milestones.length > 0;
  }
  if (!orderId) return null;

  const project = await supabase
    .from("projects")
    .select("status,project_type,milestones!milestones_project_id_fkey(milestone_id)")
    .eq("order_id", orderId)
    .maybeSingle();
  if (project.error) throw project.error;
  const projectStatus = String(project.data?.status ?? "").toLowerCase();
  projectType = project.data?.project_type ?? projectType;
  hasMilestones ||= Array.isArray(project.data?.milestones) && project.data.milestones.length > 0;

  if (!order.data) {
    const linkedOrder = await supabase
      .from("service_orders")
      .select("application_id,job_id,status,services(service_type)")
      .eq("order_id", orderId)
      .maybeSingle();
    if (linkedOrder.error) throw linkedOrder.error;
    applicationId = linkedOrder.data?.application_id ?? null;
    jobId = linkedOrder.data?.job_id ?? null;
    orderStatus = linkedOrder.data?.status ?? orderStatus;
    const linkedService = Array.isArray(linkedOrder.data?.services)
      ? linkedOrder.data.services[0]
      : linkedOrder.data?.services;
    serviceType = linkedService?.service_type;
  }

  if (applicationId) {
    const application = await supabase
      .from("job_applications")
      .select("status")
      .eq("application_id", applicationId)
      .maybeSingle();
    const currentOrderStatus = String(orderStatus ?? "").toLowerCase();
    const activeOrClosed = ["active", "in_progress", "revision", "converted", "completed", "cancelled", "canceled", "rejected"];
    const discussionStatus = ["accepted", "negotiating", "in_discussion"];
    const isApplicationDiscussion =
      discussionStatus.includes(currentOrderStatus) ||
      discussionStatus.includes(String(application.data?.status ?? "").toLowerCase());
    const projectHasMovedOn =
      activeOrClosed.includes(currentOrderStatus) ||
      activeOrClosed.includes(projectStatus);
    if (!application.error && isApplicationDiscussion && !projectHasMovedOn) {
      return `/home/projects/create-contract/${encodeURIComponent(applicationId)}`;
    }
  }

  let jobType: string | null = null;
  if (projectType !== "milestone" && applicationId && jobId) {
    const job = await supabase
      .from("jobs")
      .select("project_type")
      .eq("job_id", jobId)
      .maybeSingle();
    if (job.error) throw job.error;
    jobType = job.data?.project_type ?? null;
  }

  const isMilestoneProject =
    hasMilestones ||
    projectType === "milestone" ||
    serviceType === "milestone" ||
    jobType === "milestone";
  const href =
    "/home/projects/" +
    (isMilestoneProject ? "milestone" : "standard") +
    "/" +
    encodeURIComponent(orderId);
  return /contract|agreement/.test(normalizedType)
    ? href + "?view=agreement#contract"
    : href;
}

export type NotificationTone = "declined" | "deadline" | "default";

export function getNotificationTone(
  type: string | null,
  title: string,
): NotificationTone {
  const normalizedTitle = title.toLowerCase();
  const normalizedType = type?.toLowerCase() ?? "";
  if (
    /declin|reject|not selected/.test(normalizedTitle) ||
    /application_declined|application_rejected/.test(normalizedType)
  )
    return "declined";
  if (
    /deadline|due soon|due date|approaching/.test(normalizedTitle) ||
    /deadline|subscription_expiry/.test(normalizedType)
  )
    return "deadline";
  return "default";
}
