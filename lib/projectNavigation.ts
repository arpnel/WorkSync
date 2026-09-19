import type { FilterType } from "@/components/project/ProjectTabs";

export function projectFilter(value: string | null): FilterType {
  switch (value?.toLowerCase()) {
    case "active":
    case "in_progress":
    case "in progress":
    case "revision":
      return "Active";
    case "completed":
      return "Completed";
    case "pending":
    case "requested":
    case "request":
      return "Request";
    case "accepted":
    case "converted":
    case "agreement":
    case "in discussion":
      return "In Discussion";
    case "cancelled":
    case "rejected":
      return "Cancelled";
    default:
      return "All";
  }
}
export function projectHref(status: string) {
  const filter = projectFilter(status);
  return filter === "All"
    ? "/home/projects"
    : `/home/projects?status=${encodeURIComponent(filter)}`;
}
