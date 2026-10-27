export type NotificationKind =
  | "message"
  | "community"
  | "project"
  | "agreement"
  | "listing"
  | "system";

export function getNotificationKind(type: string | null): NotificationKind {
  if (type?.includes("message")) return "message";
  if (type?.includes("community")) return "community";
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
  if (type?.includes("community"))
    return relatedId ? `/home/community/${encodeURIComponent(relatedId)}` : "/home/community";
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
