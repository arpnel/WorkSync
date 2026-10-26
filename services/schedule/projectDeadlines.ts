import { readProjectCache } from "@/lib/projectReadCache";
import { getProjects } from "@/services/project/projectService";
import { buildProjectDeadlines } from "@/lib/projectSchedule";
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
  if (projectIds.length) {
    const result = await supabase.from("project_meetings").select("meeting_id,project_id,title,starts_at").in("project_id", projectIds).eq("status", "scheduled");
    if (result.error) throw databaseError(result.error);
    meetings = result.data ?? [];
  }
  return { deadlines: buildProjectDeadlines(orders, meetings), warning: "" };
}
