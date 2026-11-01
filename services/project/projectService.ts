import { getPublicIdentities } from "@/services/profile/publicIdentityService";
import { platformAction } from "@/services/platform/platformService";
import { supabase } from "@/lib/supabaseClient";
import { assertFreelancerAvailable } from "@/services/marketplace/freelancerAvailability";
import { getActiveAccountContext } from "@/services/marketplace/AccountServices";

export interface ProjectRecord {
  current_user_id: string;
  order_id: string;
  application_id?: string | null;
  job_id?: string | null;
  service_id: string;
  freelancer_id: string;
  client_id: string;
  status: string;
  created_at: string;
  updated_at: string;

  service: unknown;
  freelancer_profile: unknown;
  client_profile: unknown;
  project: unknown;
  contract: unknown;
  milestones: unknown;
}

interface ProjectOrderRow {
  order_id: string;
  application_id: string | null;
  job_id: string | null;
  service_id: string;
  freelancer_id: string;
  client_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  services: unknown;
  freelancer_profiles: unknown;
  client_profiles: unknown;
  projects: unknown;
  contracts: unknown;
}

const PROJECT_ORDERS_SELECT = `
  order_id, application_id, job_id, service_id, freelancer_id, client_id,
  status, created_at, updated_at,
  services (
    service_id, freelancer_id, category_id, title, description, price,
    pricing_mode, delivery_time_days, revisions_count, service_type, status,
    slug, cover_image_url, created_at, updated_at
  ),
  freelancer_profiles (
    freelancer_id, user_id, headline, created_at, verification_status,
    years_of_experience, employment_preference, portfolio_website,
    linkedin_url, github_url, resume_url
  ),
  client_profiles (client_id, user_id, created_at, updated_at),
  projects (
    project_id, freelancer_id, client_id, order_id, title, description,
    budget, status, start_date, due_date, project_type, completed_at,
    created_at, updated_at,
    project_submissions (kind, attachment_path),
    milestones (
      milestone_id, project_id, title, description, amount, due_date,
      status, created_at, display_order
    )
  ),
  contracts (
    contract_id, order_id, final_price, delivery_time_days, revisions_count,
    terms, status, client_signed_at, freelancer_signed_at, created_at, updated_at
  )
`;

function isMissingProjectTypeColumn(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "42703" || error.code === "PGRST204" ||
        /project_type.*(does not exist|schema cache)|column .*project_type/i.test(error.message ?? "")),
  );
}

/* ==========================================================
   GET PROJECTS
========================================================== */

export async function getProjects(): Promise<ProjectRecord[]> {
  const account = await getActiveAccountContext();
  if (!account.profileId) return [];
  const readOrders = (withProjectType: boolean) => {
    let query = supabase
      .from("service_orders")
      .select(
        withProjectType
          ? PROJECT_ORDERS_SELECT
          : PROJECT_ORDERS_SELECT.replace(/\s+project_type,/, ""),
      )
      .order("created_at", { ascending: false });
    query = account.role === "client"
      ? query.eq("client_id", account.profileId)
      : query.eq("freelancer_id", account.profileId);
    return query;
  };
  const firstResult = await readOrders(true);
  const { data, error } = isMissingProjectTypeColumn(firstResult.error)
    ? await readOrders(false)
    : firstResult;

  if (error) {
    console.error("Failed to fetch projects:", {
      code: error.code || "UNKNOWN_DATABASE_ERROR",
      message: error.message.slice(0, 300),
    });

    throw new Error(error.message || "Failed to load projects.");
  }

  if (!data) {
    return [];
  }

  const rows = data as unknown as ProjectOrderRow[];
  const related = (value: unknown): Record<string, unknown> => {
    const row = Array.isArray(value) ? value[0] : value;
    return row && typeof row === "object"
      ? (row as Record<string, unknown>)
      : {};
  };
  const identities = await getPublicIdentities({
    clientIds: [...new Set(rows.map((row) => row.client_id))],
    freelancerIds: [...new Set(rows.map((row) => row.freelancer_id))],
  });
  const clients = new Map(
    identities.clients.map((row) => [row.client_id, row]),
  );
  const freelancers = new Map(
    identities.freelancers.map((row) => [row.freelancer_id, row]),
  );
  const profiles = new Map(
    identities.profiles.map((row) => [row.user_id, row]),
  );
  const owned = rows.filter((order) =>
    account.role === "client"
      ? order.client_id === account.profileId
      : order.freelancer_id === account.profileId,
  );
  return owned.map((order) => {
    /*
     * Supabase may return a nested project as either
     * an object or an array depending on the detected
     * relationship.
     */
    const projectData = order.projects;

    let milestones: unknown = [];

    if (Array.isArray(projectData)) {
      milestones = projectData.flatMap(
        (project) =>
          (
            project as {
              milestones?: unknown;
            }
          )?.milestones ?? [],
      );
    } else if (projectData) {
      milestones =
        (
          projectData as {
            milestones?: unknown;
          }
        ).milestones ?? [];
    }

    return {
      current_user_id: account.userId,
      order_id: order.order_id,
      application_id: order.application_id,
      job_id: order.job_id,
      service_id: order.service_id,
      freelancer_id: order.freelancer_id,
      client_id: order.client_id,
      status: order.status,
      created_at: order.created_at,
      updated_at: order.updated_at,

      service: order.services ?? null,

      freelancer_profile: {
        ...related(order.freelancer_profiles),
        ...freelancers.get(order.freelancer_id),
        profile:
          profiles.get(freelancers.get(order.freelancer_id)?.user_id ?? "") ??
          null,
      },

      client_profile: {
        ...related(order.client_profiles),
        ...clients.get(order.client_id),
        profile:
          profiles.get(clients.get(order.client_id)?.user_id ?? "") ?? null,
      },

      project: order.projects ?? null,

      contract: order.contracts ?? null,

      milestones,
    };
  });
}

export async function respondToServiceRequest(
  orderId: string,
  accepted: boolean,
): Promise<void> {
  if (accepted) {
    const { data, error } = await supabase.from("service_orders").select("freelancer_id,status").eq("order_id", orderId).single();
    if (error) throw error;
    if (data.status === "pending") await assertFreelancerAvailable(data.freelancer_id);
  }
  await platformAction("worksync_respond_service", {
    p_order: orderId,
    p_accept: accepted,
  });
}
