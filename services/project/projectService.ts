import { supabase } from "@/lib/supabaseClient";

export interface ProjectRecord {
  order_id: string;
  service_id: string;
  freelancer_id: string;
  client_id: string;
  status: string;
  created_at: string;
  updated_at: string;

  marketplace_listing: unknown;
  freelancer_profile: unknown;
  client_profile: unknown;
  project: unknown;
  contract: unknown;
}

export async function getProjects(): Promise<ProjectRecord[]> {
  const { data, error } = await supabase
    .from("service_orders")
    .select(`
      order_id,
      service_id,
      freelancer_id,
      client_id,
      status,
      created_at,
      updated_at,

      marketplace_listings (
        *
      ),

      freelancer_profiles (
        *
      ),

      client_profiles (
        *
      ),

      projects (
        *
      ),

      contracts (
        *
      )
    `)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error(
      "Failed to fetch projects:",
      error
    );

    throw new Error(
      error.message ||
        "Failed to load projects."
    );
  }

  return (data ?? []).map((order) => ({
    order_id: order.order_id,
    service_id: order.service_id,
    freelancer_id: order.freelancer_id,
    client_id: order.client_id,
    status: order.status,
    created_at: order.created_at,
    updated_at: order.updated_at,

    marketplace_listing:
      order.marketplace_listings ?? null,

    freelancer_profile:
      order.freelancer_profiles ?? null,

    client_profile:
      order.client_profiles ?? null,

    project:
      order.projects ?? null,

    contract:
      order.contracts ?? null,
  }));
}