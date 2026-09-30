import { ADMIN_RECORD_MODULES, type AdminModule } from "./adminModules";
export type { AdminModule } from "./adminModules";
import { platformAction } from "@/services/platform/platformService";
import { supabase } from "@/lib/supabaseClient";
import {
  parseAdminAnalytics,
  parseAdminRecords,
  parseAdminDisputeContext,
} from "./adminResponses";

async function adminRead(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error)
    throw new Error(
      `Unable to load admin data (${name}, ${error.code || "unknown"}): ${error.message}`,
    );
  return data;
}
export async function getAdminDisputeContext(id: string) {
  return parseAdminDisputeContext(
    await adminRead("worksync_dispute_context", { p_id: id }),
  );
}
export async function getAdminAnalytics(
  from: string,
  to: string,
  status: string,
) {
  return parseAdminAnalytics(
    await adminRead("worksync_admin_analytics", {
      p_from: from,
      p_to: to,
      p_status: status,
    }),
  );
}
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
  limit: number;
  offset: number;
  hasNext: boolean;
  stats?: Record<string, number>;
}
export async function getAdminRecords(
  module: AdminModule,
  search: string,
  offset: number,
): Promise<AdminResult> {
  const rpc =
    module === "disputes" ? "worksync_list_disputes" : "worksync_admin_records";
  return parseAdminRecords(
    await adminRead(rpc, {
      ...(module === "disputes"
        ? {}
        : { p_module: ADMIN_RECORD_MODULES[module] }),
      p_search: search.trim(),
      p_offset: offset,
    }),
    rpc,
    offset,
  );
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
