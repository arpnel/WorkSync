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
