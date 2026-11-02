import { ADMIN_RECORD_MODULES, type AdminModule } from "./adminModules";
export type { AdminModule } from "./adminModules";
import { platformAction } from "@/services/platform/platformService";
import { supabase } from "@/lib/supabaseClient";
import {
  parseAdminAnalytics,
  parseAdminJobMonitoringDetails,
  parseAdminProjectDetails,
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
      p_status: status === "all" ? null : status,
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
  total?: number;
}

export type AdminQuickActionCounts = {
  transactions: number | null;
  verification: number | null;
  reports: number | null;
  disputes: number | null;
  listingModeration: number | null;
  sellerTaxReview: number | null;
};

export async function getAdminQuickActionCounts(): Promise<AdminQuickActionCounts> {
  const pendingStatuses = [
    "pending",
    "open",
    "under_review",
    "pending_review",
    "awaiting_review",
    "submitted",
    "escalated",
  ];
  const [
    transactions,
    verification,
    reports,
    disputes,
    moderation,
    taxDocuments,
    taxDeclarations,
    sellerRequirements,
  ] = await Promise.all([
    supabase.from("payments").select("payment_id", { count: "exact", head: true }).in("status", ["pending", "needs_review"]),
    supabase.from("verification_requests").select("request_id", { count: "exact", head: true }).in("status", pendingStatuses),
    supabase.from("listing_reports").select("report_id", { count: "exact", head: true }).in("status", pendingStatuses),
    supabase.from("project_disputes").select("dispute_id", { count: "exact", head: true }).in("status", pendingStatuses),
    supabase.from("listing_submissions").select("submission_id", { count: "exact", head: true }).in("status", ["pending_review", "manual_review"]),
    supabase.from("tax_documents").select("document_id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("freelancer_tax_declarations").select("declaration_id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("freelancer_seller_verification_requirements").select("requirement_id", { count: "exact", head: true }).eq("status", "pending").neq("document_type", "bir_cor").not("current_submission_id", "is", null),
  ]);

  const count = (result: { count: number | null; error: unknown }) =>
    result.error ? null : result.count ?? 0;
  const sellerTaxParts = [taxDocuments, taxDeclarations, sellerRequirements];
  const sellerTaxReview = sellerTaxParts.some((result) => result.error)
    ? null
    : sellerTaxParts.reduce((total, result) => total + (result.count ?? 0), 0);

  return {
    transactions: count(transactions),
    verification: count(verification),
    reports: count(reports),
    disputes: count(disputes),
    listingModeration: count(moderation),
    sellerTaxReview,
  };
}

export async function getAdminRecords(
  module: AdminModule,
  search: string,
  offset: number,
): Promise<AdminResult> {
  const rpc =
    module === "disputes" ? "worksync_admin_disputes_page" : "worksync_admin_records";
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
export async function getAdminJobMonitoringDetails(jobId: string) {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session) throw new Error("Sign in to inspect job participants.");
  const response = await fetch(
    `/api/admin/jobs/${encodeURIComponent(jobId)}`,
    {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "Job participant details could not be loaded.",
    );
  return parseAdminJobMonitoringDetails(body);
}
export async function getAdminProjectDetails(projectId: string) {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session) throw new Error("Sign in to inspect project details.");
  const response = await fetch(
    `/api/admin/projects/${encodeURIComponent(projectId)}`,
    {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "Project and contract details could not be loaded.",
    );
  return parseAdminProjectDetails(body);
}
export async function getAdminReportDetails(reportId: string) {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session) throw new Error("Sign in to inspect report details.");
  const response = await fetch(
    `/api/admin/reports/${encodeURIComponent(reportId)}`,
    {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "Reporter account details could not be loaded.",
    );
  if (typeof body?.reporterId !== "string" || typeof body?.reporterName !== "string")
    throw new Error("Reporter account details are unavailable.");
  return { reporterId: body.reporterId, reporterName: body.reporterName };
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
  if (module === "verification") {
    if (action !== "revoke")
      throw new Error("Unsupported verification action.");
    return platformAction("worksync_admin_revoke_verification", {
      p_request_id: id,
      p_reason: notes.trim(),
    });
  }
  if (module === "disputes")
    return platformAction("worksync_resolve_dispute", {
      p_id: id,
      p_action: action,
      p_notes: notes.trim(),
    });
  if (module === "reports") {
    const reportAction =
      action === "under_review"
        ? { rpcAction: "review_report", status: "under_review" }
        : action === "resolved"
          ? { rpcAction: "resolve_report", status: "resolved" }
          : action === "dismissed"
            ? { rpcAction: "dismiss_report", status: "dismissed" }
            : null;
    if (!reportAction) throw new Error("Unsupported report action.");
    return platformAction("worksync_admin_action", {
      p_action: reportAction.rpcAction,
      p_target_id: id,
      p_details: {
        status: reportAction.status,
        admin_notes: notes.trim(),
      },
    });
  }
  if (module === "projects") {
    if (action !== "cancel_project")
      throw new Error("Unsupported project action.");
    return platformAction("worksync_admin_cancel_project", {
      p_project: id,
      p_notes: notes.trim(),
    });
  }
  if (module === "jobs" || module === "services") {
    const rpc =
      action === "hide"
        ? "worksync_admin_hide_listing"
        : action === "restore"
          ? "worksync_admin_restore_listing"
          : null;
    if (!rpc) throw new Error("Unsupported listing action.");
    return platformAction(rpc, {
      p_listing_type: module === "jobs" ? "job" : "service",
      p_listing_id: id,
      p_notes: notes.trim(),
    });
  }
  return platformAction("worksync_admin_action", {
    p_module: module,
    p_id: id,
    p_action: action,
    p_notes: notes.trim(),
  });
}
