import { supabase } from "@/lib/supabaseClient";
import {
  databaseError,
  platformAction,
  requireUser,
} from "@/services/platform/platformService";
export interface Dispute {
  dispute_id: string;
  project_id: string;
  milestone_id: string | null;
  opened_by: string;
  category: string;
  description: string;
  status: "open" | "under_review" | "resolved";
  evidence_path: string | null;
  evidence_name: string | null;
  admin_notes: string;
  resolution: string | null;
  resolution_action: string | null;
  created_at: string;
}
export interface Cancellation {
  cancellation_id: string;
  order_id: string;
  requested_by: string;
  reason: string;
  status: "requested" | "accepted" | "rejected";
  response: string | null;
  created_at: string;
}
export function canRequestCancellation(
  orderStatus: string,
  projectStatus?: string | null,
) {
  const project = projectStatus?.toLowerCase();
  if (
    project === "completed" ||
    project === "cancelled" ||
    project === "rejected"
  )
    return false;
  const order = orderStatus.toLowerCase();
  return (
    ["pending", "accepted"].includes(order) ||
    (order === "converted" && (project === "active" || project === "revision"))
  );
}
export function canOpenDispute(status: string) {
  return ["active"].includes(status.toLowerCase());
}
export function validateReason(value: string) {
  if (!value.trim() || value.length > 5000)
    throw new Error("Enter a reason of up to 5,000 characters.");
  return value.trim();
}
export async function getResolutionHistory(
  orderId: string,
  projectId: string | null,
) {
  const [c, d] = await Promise.all([
    supabase
      .from("project_cancellations")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
    projectId
      ? supabase
          .from("project_disputes")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (c.error) throw databaseError(c.error);
  if (d.error) throw databaseError(d.error);
  return {
    cancellations: (c.data ?? []) as Cancellation[],
    disputes: (d.data ?? []) as Dispute[],
  };
}
export async function requestCancellation(orderId: string, reason: string) {
  return platformAction("worksync_request_cancellation", {
    p_order: orderId,
    p_reason: validateReason(reason),
  });
}
export async function respondCancellation(
  id: string,
  accept: boolean,
  response: string,
) {
  return platformAction("worksync_respond_cancellation", {
    p_id: id,
    p_accept: accept,
    p_response: validateReason(response),
  });
}
export async function openDispute(
  projectId: string,
  milestoneId: string | null,
  category: string,
  description: string,
  file?: File,
) {
  const user = await requireUser();
  const reason = validateReason(description);
  if (
    !["scope", "delivery", "communication", "quality", "other"].includes(
      category,
    )
  )
    throw new Error("Choose a dispute category.");
  const id = crypto.randomUUID();
  let path: string | null = null;
  try {
    if (file) {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Evidence must be 10 MB or smaller.");
      path = `${projectId}/${user.id}/${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await supabase.storage
        .from("project-attachments")
        .upload(path, file, { upsert: false });
      if (error) throw databaseError(error);
    }
    await platformAction("worksync_open_dispute", {
      p_id: id,
      p_project: projectId,
      p_milestone: milestoneId,
      p_category: category,
      p_description: reason,
      p_path: path,
      p_name: file?.name ?? null,
    });
  } catch (error) {
    if (path) await supabase.storage.from("project-attachments").remove([path]);
    throw error;
  }
}
