import { supabase } from "@/lib/supabaseClient";
import { databaseError, requireUser } from "@/services/platform/platformService";

const TASK_ATTACHMENT_BUCKET = "project-attachments";
export const PROJECT_TASK_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export interface ProjectTaskAttachment {
  attachment_id: string;
  project_id: string;
  task_key: string;
  author_id: string;
  storage_path: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

const ATTACHMENT_SELECT = "attachment_id,project_id,task_key,author_id,storage_path,file_name,content_type,size_bytes,created_at";

export async function loadProjectTaskAttachments(
  projectId: string,
  taskKey: string,
): Promise<ProjectTaskAttachment[]> {
  const { data, error } = await supabase
    .from("project_task_attachments")
    .select(ATTACHMENT_SELECT)
    .eq("project_id", projectId)
    .eq("task_key", taskKey)
    .order("created_at", { ascending: true });
  if (error) throw databaseError(error);
  return (data ?? []) as ProjectTaskAttachment[];
}

export async function uploadProjectTaskAttachment(
  projectId: string,
  taskKey: string,
  file: File,
): Promise<ProjectTaskAttachment> {
  const user = await requireUser();
  if (file.size < 1 || file.size > PROJECT_TASK_ATTACHMENT_MAX_BYTES)
    throw new Error("Choose a file that is 10 MB or smaller.");
  if (!taskKey.trim() || taskKey.length > 120)
    throw new Error("This task is not linked to a saved project plan.");

  const fileName = file.name.trim().slice(0, 255) || "attachment";
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "attachment";
  const storagePath = `${projectId}/${user.id}/task-files/${crypto.randomUUID()}/${safeFileName}`;
  const { error: uploadError } = await supabase.storage
    .from(TASK_ATTACHMENT_BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type || "application/octet-stream" });
  if (uploadError) throw databaseError(uploadError);

  try {
    const { data, error } = await supabase
      .from("project_task_attachments")
      .insert({
        project_id: projectId,
        task_key: taskKey,
        author_id: user.id,
        storage_path: storagePath,
        file_name: fileName,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
      })
      .select(ATTACHMENT_SELECT)
      .single();
    if (error) throw databaseError(error);
    return data as ProjectTaskAttachment;
  } catch (cause) {
    await supabase.storage.from(TASK_ATTACHMENT_BUCKET).remove([storagePath]);
    throw cause;
  }
}

export function subscribeToProjectTaskAttachments(
  projectId: string,
  taskKey: string,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel(`project-task-attachments:${projectId}:${taskKey}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "project_task_attachments", filter: `project_id=eq.${projectId}` },
      onChange,
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

export async function openProjectTaskAttachment(storagePath: string): Promise<void> {
  const viewer = window.open("about:blank", "_blank");
  if (!viewer) throw new Error("Allow pop-ups to open this project attachment.");
  viewer.opener = null;
  try {
    const { data, error } = await supabase.storage
      .from(TASK_ATTACHMENT_BUCKET)
      .createSignedUrl(storagePath, 60);
    if (error) throw databaseError(error);
    viewer.location.replace(data.signedUrl);
  } catch (cause) {
    viewer.close();
    throw cause;
  }
}
