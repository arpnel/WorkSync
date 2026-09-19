import { platformAction } from "@/services/platform/platformService";
export type AdminModule =
  | "transactions"
  | "disputes"
  | "overview"
  | "users"
  | "jobs"
  | "services"
  | "projects"
  | "reports"
  | "verification"
  | "audit";
export type AdminRow = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  detail: string;
  owner_id?: string;
  document_paths?: string[];
};
export interface AdminResult {
  rows: AdminRow[];
  total: number;
  stats?: Record<string, number>;
}
export async function getAdminRecords(
  module: AdminModule,
  search: string,
  page: number,
): Promise<AdminResult> {
  if (module === "disputes")
    return platformAction("worksync_list_disputes", {
      p_search: search.trim(),
      p_offset: page * 25,
    });
  return platformAction("worksync_admin_records", {
    p_module: module,
    p_search: search.trim(),
    p_offset: page * 25,
  }) as Promise<AdminResult>;
}
export async function reviewAdminRecord(
  module: AdminModule,
  id: string,
  action: string,
  notes: string,
  expires?: string,
) {
  if (!notes.trim()) throw new Error("Record the reason for this action.");
  if (module === "users")
    return platformAction("worksync_moderate_account", {
      p_user: id,
      p_status: action === "suspend" ? "suspended" : "active",
      p_reason: notes.trim(),
      p_expires:
        action === "suspend" && expires
          ? new Date(expires).toISOString()
          : null,
    });
  if (module === "disputes")
    return platformAction("worksync_resolve_dispute", {
      p_id: id,
      p_action: action,
      p_notes: notes.trim(),
    });
  return platformAction("worksync_admin_action", {
    p_module: module,
    p_id: id,
    p_action: action,
    p_notes: notes.trim(),
  });
}
