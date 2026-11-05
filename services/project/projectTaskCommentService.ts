import { supabase } from "@/lib/supabaseClient";
import { databaseError, requireUser } from "@/services/platform/platformService";

export interface ProjectTaskComment {
  comment_id: string;
  project_id: string;
  task_key: string;
  author_id: string;
  body: string;
  created_at: string;
}

const COMMENT_SELECT = "comment_id,project_id,task_key,author_id,body,created_at";

export async function loadProjectTaskComments(
  projectId: string,
  taskKey: string,
): Promise<ProjectTaskComment[]> {
  const { data, error } = await supabase
    .from("project_task_comments")
    .select(COMMENT_SELECT)
    .eq("project_id", projectId)
    .eq("task_key", taskKey)
    .order("created_at", { ascending: true });
  if (error) throw databaseError(error);
  return (data ?? []) as ProjectTaskComment[];
}

export async function addProjectTaskComment(
  projectId: string,
  taskKey: string,
  body: string,
): Promise<ProjectTaskComment> {
  const user = await requireUser();
  const content = body.trim();
  if (!content || content.length > 2000)
    throw new Error("Comments must be between 1 and 2,000 characters.");
  const { data, error } = await supabase
    .from("project_task_comments")
    .insert({ project_id: projectId, task_key: taskKey, author_id: user.id, body: content })
    .select(COMMENT_SELECT)
    .single();
  if (error) throw databaseError(error);
  return data as ProjectTaskComment;
}

export function subscribeToProjectTaskComments(
  projectId: string,
  channelKey: string,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel(`project-task-comments:${projectId}:${channelKey}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "project_task_comments", filter: `project_id=eq.${projectId}` },
      onChange,
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
