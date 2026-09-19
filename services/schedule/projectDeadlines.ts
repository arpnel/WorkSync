import { supabase } from "@/lib/supabaseClient";
import { getProjects } from "@/services/project/projectService";
import { buildProjectDeadlines } from "@/lib/projectSchedule";
export type { LinkedDeadline } from "@/lib/projectSchedule";
export async function getProjectDeadlines() {
  const orders = await getProjects();
  const { data: meetings, error } = await supabase
    .from("project_meetings")
    .select("meeting_id,project_id,title,starts_at,ends_at")
    .eq("status", "scheduled")
    .gte("ends_at", new Date().toISOString());
  return {
    deadlines: buildProjectDeadlines(orders, meetings ?? []),
    warning: error
      ? "Meeting dates could not load. Project tasks are still available."
      : "",
  };
}
