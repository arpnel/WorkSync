import type { ProjectRecord } from "@/services/project/projectService";
import type { ScheduleCard, SchedulePriority } from "@/types/schedule/schedule";
export interface LinkedDeadline extends ScheduleCard {
  href: string;
  projectTitle: string;
  projectKey: string;
  stage: "To do" | "In progress" | "In review" | "Done";
  kind: "milestone" | "project" | "meeting";
}
const record = (value: unknown): Record<string, unknown> => {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? (row as Record<string, unknown>) : {};
};
export function deadlinePriority(
  dueDate: string,
  now = new Date(),
): SchedulePriority {
  if (!dueDate) return "low";
  const day = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const due = Date.parse(dueDate + "T00:00:00Z");
  const days = (due - day) / 86400000;
  return days <= 2 ? "high" : days <= 7 ? "medium" : "low";
}
type Meeting = {
  meeting_id: string;
  project_id: string;
  title: string;
  starts_at: string;
};
export function buildProjectDeadlines(
  orders: ProjectRecord[],
  meetings: Meeting[] = [],
  now = new Date(),
): LinkedDeadline[] {
  const result: LinkedDeadline[] = [];
  for (const order of orders) {
    if (
      record(order.client_profile).user_id !== order.current_user_id &&
      record(order.freelancer_profile).user_id !== order.current_user_id
    )
      continue;
    const project = record(order.project),
      contract = record(order.contract),
      service = record(order.service);
    if (
      !contract.client_signed_at ||
      !contract.freelancer_signed_at ||
      [order.status, project.status, contract.status].some((s) =>
        ["cancelled", "rejected"].includes(String(s)),
      )
    )
      continue;
    const milestone = service.service_type === "milestone";
    const href = `/home/projects/${milestone ? "milestone" : "standard"}/${order.order_id}`;
    const projectTitle = String(
      project.title ?? service.title ?? "Agreed project",
    );
    const completed =
      project.status === "completed" || order.status === "completed";
    const add = (
      id: string,
      title: string,
      description: string,
      due: unknown,
      stage: LinkedDeadline["stage"],
      kind: LinkedDeadline["kind"],
    ) => {
      const raw = String(due ?? "");
      const date = raw
        ? new Date(raw.includes("T") ? raw : raw + "T00:00:00")
        : null;
      const valid = date && Number.isFinite(date.getTime());
      const dueDate = valid
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
        : "";
      result.push({
        id,
        listId: stage,
        title,
        description,
        dueDate,
        dueTime:
          valid && kind === "meeting"
            ? `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
            : "",
        priority: stage === "Done" ? "low" : deadlinePriority(dueDate, now),
        href,
        projectTitle,
        projectKey: order.order_id,
        stage,
        kind,
      });
    };
    const milestones = Array.isArray(order.milestones)
      ? order.milestones.map(record)
      : [];
    if (milestone && milestones.length) {
      for (const item of milestones.sort(
        (a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0),
      )) {
        const stage =
          completed || ["approved", "completed"].includes(String(item.status))
            ? "Done"
            : item.status === "submitted"
              ? "In review"
              : ["in_progress", "revision_requested"].includes(
                    String(item.status),
                  )
                ? "In progress"
                : "To do";
        add(
          `milestone:${item.milestone_id}`,
          String(item.title ?? "Milestone"),
          String(item.description ?? ""),
          item.due_date,
          stage,
          "milestone",
        );
      }
    } else {
      add(
        `project:${project.project_id ?? order.order_id}`,
        projectTitle,
        String(project.description ?? service.description ?? ""),
        project.due_date,
        completed
          ? "Done"
          : ["active", "in_progress", "revision"].includes(String(project.status))
            ? "In progress"
            : "To do",
        "project",
      );
    }
    if (!completed)
      for (const meeting of meetings.filter(
        (m) => m.project_id === project.project_id,
      ))
        add(
          `meeting:${meeting.meeting_id}`,
          `Meeting: ${meeting.title}`,
          "Project meeting",
          meeting.starts_at,
          "To do",
          "meeting",
        );
  }
  return [...new Map(result.map((item) => [item.id, item])).values()];
}
