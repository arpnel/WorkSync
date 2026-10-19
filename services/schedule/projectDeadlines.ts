import { readProjectCache } from "@/lib/projectReadCache";
import { getProjects } from "@/services/project/projectService";
import { buildProjectDeadlines } from "@/lib/projectSchedule";
export type { LinkedDeadline } from "@/lib/projectSchedule";
export async function getProjectDeadlines() {
  const orders = await readProjectCache("projects", getProjects);
  return { deadlines: buildProjectDeadlines(orders), warning: "" };
}
