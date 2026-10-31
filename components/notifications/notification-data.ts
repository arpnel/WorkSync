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
  const auth = await supabase.auth.getUser();
  if (auth.error) throw auth.error;
  const freelancer = await supabase
    .from("freelancer_profiles")
    .select("freelancer_id")
    .eq("user_id", auth.data.user?.id ?? "")
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
    .select("order_id,services(service_type)")
    .eq("order_id", relatedId)
    .maybeSingle();
  if (order.error) throw order.error;
  let orderId = order.data?.order_id ?? null;
  const service = Array.isArray(order.data?.services)
    ? order.data.services[0]
    : order.data?.services;
  let projectType = service?.service_type;

  if (!orderId) {
    const project = await supabase
      .from("projects")
      .select("order_id")
      .eq("project_id", relatedId)
      .maybeSingle();
    if (project.error) throw project.error;
    orderId = project.data?.order_id ?? null;
  }
  if (!orderId) return null;
  if (!projectType) {
    const linkedOrder = await supabase
      .from("service_orders")
      .select("services(service_type)")
      .eq("order_id", orderId)
      .maybeSingle();
    if (linkedOrder.error) throw linkedOrder.error;
    const linkedService = Array.isArray(linkedOrder.data?.services)
      ? linkedOrder.data.services[0]
      : linkedOrder.data?.services;
    projectType = linkedService?.service_type;
  }
  const href =
    "/home/projects/" +
    (projectType === "milestone" ? "milestone" : "standard") +
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
