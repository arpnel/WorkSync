import { ADMIN_RECORD_MODULES, type AdminModule } from "./adminModules";
import { z } from "zod";
export type { AdminModule } from "./adminModules";
import { platformAction } from "@/services/platform/platformService";
import { clearProjectReadCache } from "@/lib/projectReadCache";
import { invalidatePageReads } from "@/lib/pageReadCache";
import { supabase } from "@/lib/supabaseClient";
import {
  getPublicIdentities,
  identityName,
} from "@/services/profile/publicIdentityService";
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
  const context = parseAdminDisputeContext(
    await adminRead("worksync_dispute_context", { p_id: id }),
  );
  const identitiesNeeded = context.parties.filter(
    (party) => !party.display_name?.trim(),
  );
  const userIds = identitiesNeeded.flatMap((party) =>
    party.user_id ? [party.user_id] : [],
  );
  const clientIds = identitiesNeeded.flatMap((party) =>
    party.role === "client" && party.profile_id ? [party.profile_id] : [],
  );
  const freelancerIds = identitiesNeeded.flatMap((party) =>
    party.role === "freelancer" && party.profile_id
      ? [party.profile_id]
      : [],
  );
  if (!userIds.length && !clientIds.length && !freelancerIds.length) {
    return context;
  }

  try {
    const identities = await getPublicIdentities({
      userIds,
      clientIds,
      freelancerIds,
    });
    const clients = new Map(
      identities.clients.map((client) => [client.client_id, client.user_id]),
    );
    const freelancers = new Map(
      identities.freelancers.map((freelancer) => [
        freelancer.freelancer_id,
        freelancer.user_id,
      ]),
    );
    const profiles = new Map(
      identities.profiles.map((profile) => [profile.user_id, profile]),
    );

    return {
      ...context,
      parties: context.parties.map((party) => {
        const roleUserId = party.profile_id
          ? party.role === "client"
            ? clients.get(party.profile_id)
            : party.role === "freelancer"
              ? freelancers.get(party.profile_id)
              : undefined
          : undefined;
        const userId = party.user_id ?? roleUserId ?? null;
        const profile = userId ? profiles.get(userId) : undefined;
        const displayName =
          party.display_name?.trim() || identityName(profile, "").trim();
        return {
          ...party,
          user_id: userId,
          display_name: displayName || null,
        };
      }),
    };
  } catch {
    return context;
  }
}
export async function getAdminAnalytics(
  from: string,
  through: string,
  environment: "all" | "live" | "test",
) {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session) throw new Error("Sign in to view platform analytics.");
  const query = new URLSearchParams({ from, through, environment });
  const response = await fetch(`/api/admin/analytics?${query.toString()}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "Platform analytics could not be loaded.",
    );
  return parseAdminAnalytics(body);
}
export type AdminRow = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  detail: string;
  owner_id?: string;
  document_paths?: string[];
  disputeMilestoneId?: string | null;
  disputeCompletionActionsAvailable?: boolean;
};
export interface AdminResult {
  rows: AdminRow[];
  limit: number;
  offset: number;
  hasNext: boolean;
  stats?: Record<string, number>;
  total?: number;
}

const adminDiditIdentitySchema = z.object({
  identity: z
    .object({
      fullName: z.string().nullable(),
      documentType: z.string().nullable(),
      issuingCountry: z.string().nullable(),
      documentStatus: z.string(),
      livenessStatuses: z.array(z.string()),
      faceMatchStatuses: z.array(z.string()),
      environment: z.enum(["sandbox", "live"]),
    })
    .nullable(),
  simulated: z.boolean(),
});
export type AdminDiditIdentity = z.infer<typeof adminDiditIdentitySchema>;

export async function getAdminDiditIdentity(
  requestId: string,
): Promise<AdminDiditIdentity> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session) throw new Error("Sign in to view verification evidence.");
  const response = await fetch(
    `/api/admin/verifications/${encodeURIComponent(requestId)}`,
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
        : "Didit identity evidence could not be loaded.",
    );
  return adminDiditIdentitySchema.parse(body);
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
  if (module === "disputes") {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) throw error;
    if (!session) throw new Error("Sign in to review this dispute.");
    const response = await fetch("/api/admin/disputes", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, action, notes: notes.trim() }),
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        typeof body?.error === "string"
          ? body.error
          : "Dispute action could not be saved.",
      );
    invalidatePageReads();
    clearProjectReadCache();
    return body;
  }
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
