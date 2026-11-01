import { readProjectCache } from "@/lib/projectReadCache";
import { getProjects } from "@/services/project/projectService";
import { buildProjectDeadlines } from "@/lib/projectSchedule";
import type { ProjectTaskDeadline } from "@/lib/projectSchedule";
import { supabase } from "@/lib/supabaseClient";
import { databaseError } from "@/services/platform/platformService";

const record = (value: unknown): Record<string, unknown> => {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? row as Record<string, unknown> : {};
};

export type { LinkedDeadline } from "@/lib/projectSchedule";
export async function getProjectDeadlines() {
  const orders = await readProjectCache("projects", getProjects);
  const projectIds = [...new Set(orders.map(order => record(order.project).project_id).filter((id): id is string => typeof id === "string"))];
  let meetings: { meeting_id: string; project_id: string; title: string; starts_at: string }[] = [];
  let tasks: ProjectTaskDeadline[] = [];
  if (projectIds.length) {
    const [meetingResult, taskResult] = await Promise.all([
      supabase.from("project_meetings").select("meeting_id,project_id,title,starts_at").in("project_id", projectIds).eq("status", "scheduled"),
      supabase.from("project_tasks").select("task_id,project_id,title,description,priority,deadline_at,status")
        .in("project_id", projectIds)
        .in("status", ["in_progress", "in_review", "revision_requested", "auto_approved"])
        .not("deadline_at", "is", null),
    ]);
    if (meetingResult.error) throw databaseError(meetingResult.error);
    if (taskResult.error) throw databaseError(taskResult.error);
    meetings = meetingResult.data ?? [];
    tasks = (taskResult.data ?? []) as ProjectTaskDeadline[];
  }
  return { deadlines: buildProjectDeadlines(orders, meetings, new Date(), tasks), warning: "", projectIds };
}
