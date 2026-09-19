import { getPublicIdentities } from "@/services/profile/publicIdentityService";
import { platformAction } from "@/services/platform/platformService";
import { supabase } from "@/lib/supabaseClient";

export interface ProjectRecord {
  current_user_id: string;
  order_id: string;
  application_id?: string | null;
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

/* ==========================================================
   GET PROJECTS
========================================================== */

export async function getProjects(): Promise<ProjectRecord[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw new Error(`Authentication failed: ${authError.message}`);
  if (!user) throw new Error("User not authenticated.");
  const { data, error } = await supabase
    .from("service_orders")
    .select(
      `
      order_id,
      application_id,
      service_id,
      freelancer_id,
      client_id,
      status,
      created_at,
      updated_at,

      services (
        service_id,
        freelancer_id,
        category_id,
        title,
        description,
        price,
        pricing_mode,
        delivery_time_days,
        revisions_count,
        service_type,
        status,
        slug,
        cover_image_url,
        created_at,
        updated_at
      ),

      freelancer_profiles (
        freelancer_id,
        user_id,
        headline,
        hourly_rate,
        created_at,
        verification_status,
        years_of_experience,
        employment_preference,
        portfolio_website,
        linkedin_url,
        github_url,
        resume_url
      ),

      client_profiles (
        client_id,
        user_id,
        created_at,
        updated_at
      ),

      projects (
        project_id,
        freelancer_id,
        client_id,
        order_id,
        title,
        description,
        budget,
        status,
        start_date,
        due_date,
        completed_at,
        created_at,
        updated_at,

        project_submissions (kind, attachment_path),
        milestones (
          milestone_id,
          project_id,
          title,
          description,
          amount,
          due_date,
          status,
          created_at,
          display_order
        )
      ),

      contracts (
        contract_id,
        order_id,
        final_price,
        delivery_time_days,
        revisions_count,
        terms,
        status,
        client_signed_at,
        freelancer_signed_at,
        created_at,
        updated_at
      )
    `,
    )
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error("Failed to fetch projects:", error);

    throw new Error(error.message || "Failed to load projects.");
  }

  if (!data) {
    return [];
  }

  const related = (value: unknown): Record<string, unknown> => {
    const row = Array.isArray(value) ? value[0] : value;
    return row && typeof row === "object"
      ? (row as Record<string, unknown>)
      : {};
  };
  const identities = await getPublicIdentities({
    clientIds: [...new Set(data.map((row) => row.client_id))],
    freelancerIds: [...new Set(data.map((row) => row.freelancer_id))],
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
  const owned = data.filter(
    (order) =>
      clients.get(order.client_id)?.user_id === user.id ||
      freelancers.get(order.freelancer_id)?.user_id === user.id,
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
      current_user_id: user.id,
      order_id: order.order_id,
      application_id: order.application_id,
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
  await platformAction("worksync_respond_service", {
    p_order: orderId,
    p_accept: accepted,
  });
}
