import { supabase } from "@/lib/supabaseClient";

/* ==========================================================
   TABLES
========================================================== */

const SERVICES_TABLE = "services";
const JOBS_TABLE = "jobs";

const FREELANCER_TABLE = "freelancer_profiles";
const CLIENT_TABLE = "client_profiles";
const PROFILES_TABLE = "profiles";
const CATEGORY_TABLE = "job_categories";
const USERS_TABLE = "Users";

/* ==========================================================
   TYPES
========================================================== */

export type MarketplaceSort =
  | "relevance"
  | "latest"
  | "lowestPrice"
  | "highestPrice";

export type MarketplaceListingType = "service" | "job";

export type MarketplaceRole = "freelancer" | "client";

export interface MarketplaceQuery {
  search?: string;

  categoryId?: string | null;

  minPrice?: number | null;
  maxPrice?: number | null;

  sort?: MarketplaceSort;

  listingType?: MarketplaceListingType | null;

  freelancerId?: string | null;

  clientId?: string | null;
}

/* ==========================================================
   PROFILE TYPES
========================================================== */

export interface MarketplaceProfile {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  location: string | null;
}

/* ==========================================================
   FREELANCER
========================================================== */

export interface MarketplaceFreelancer {
  freelancer_id: string;
  user_id: string;

  headline: string | null;
  hourly_rate: number | null;
  verification_status: string | null;

  profile: MarketplaceProfile | null;
}

/* ==========================================================
   CLIENT
========================================================== */

export interface MarketplaceClient {
  client_id: string;
  user_id: string;

  profile: MarketplaceProfile | null;
}

/* ==========================================================
   CATEGORY
========================================================== */

export interface MarketplaceCategory {
  category_id: string;
  name: string;
}

/* ==========================================================
   SERVICE
========================================================== */

export interface MarketplaceService {
  listing_type: "service";

  service_id: string;

  freelancer_id: string | null;
  client_id: null;

  title: string;
  description: string;

  price: number;

  pricing_mode: string;

  delivery_time_days: number;
  revisions_count: number;

  service_type: string;

  status: string;

  slug: string | null;
  cover_image_url: string | null;

  category_id: string;

  created_at: string;
  updated_at: string;

  freelancer: MarketplaceFreelancer | null;
  client: null;

  category: MarketplaceCategory | null;
}

/* ==========================================================
   JOB
========================================================== */

export interface MarketplaceJob {
  listing_type: "job";

  job_id: string;

  freelancer_id: null;
  client_id: string | null;

  title: string;
  description: string;

  budget_min: number;
  budget_max: number;

  pricing_type: string;

  deadline: string | null;

  status: string;

  category_id: string;

  created_at: string;
  updated_at: string;

  freelancer: null;
  client: MarketplaceClient | null;

  category: MarketplaceCategory | null;
}

/* ==========================================================
   UNIFIED MARKETPLACE ITEM
========================================================== */

export type MarketplaceItem = MarketplaceService | MarketplaceJob;

/*
 * Backwards-compatible name.
 *
 * Components that still import MarketplaceService
 * can continue working while the actual database
 * remains separated into services and jobs.
 */
export type MarketplaceListing = MarketplaceItem;

/* ==========================================================
   DATABASE ROWS
========================================================== */

interface ServiceRow {
  service_id: string;
  freelancer_id: string | null;
  category_id: string;

  title: string;
  description: string;

  price: number;
  pricing_mode: string;

  delivery_time_days: number;
  revisions_count: number;

  service_type: string;
  status: string;

  slug: string | null;
  cover_image_url: string | null;

  created_at: string;
  updated_at: string;
}

interface JobRow {
  job_id: string;
  client_id: string | null;
  category_id: string;

  title: string;
  description: string;

  budget_min: number;
  budget_max: number;

  pricing_type: string;

  deadline: string | null;

  status: string;

  created_at: string;
  updated_at: string;
}

/* ==========================================================
   LOAD FREELANCER
========================================================== */

async function getFreelancerData(
  freelancerId: string | null,
): Promise<MarketplaceFreelancer | null> {
  if (!freelancerId) {
    return null;
  }

  const { data: freelancer, error: freelancerError } = await supabase
    .from(FREELANCER_TABLE)
    .select(
      `
      freelancer_id,
      user_id,
      headline,
      hourly_rate,
      verification_status
    `,
    )
    .eq("freelancer_id", freelancerId)
    .maybeSingle();

  if (freelancerError) {
    console.error("Failed to load freelancer:", freelancerError);

    return null;
  }

  if (!freelancer) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from(PROFILES_TABLE)
    .select(
      `
      display_name,
      first_name,
      last_name,
      avatar_url,
      location
    `,
    )
    .eq("user_id", freelancer.user_id)
    .maybeSingle();

  if (profileError) {
    console.error("Failed to load freelancer profile:", profileError);
  }

  return {
    freelancer_id: freelancer.freelancer_id,
    user_id: freelancer.user_id,

    headline: freelancer.headline,
    hourly_rate: freelancer.hourly_rate,
    verification_status: freelancer.verification_status,

    profile: profile ?? null,
  };
}

/* ==========================================================
   LOAD CLIENT
========================================================== */

async function getClientData(
  clientId: string | null,
): Promise<MarketplaceClient | null> {
  if (!clientId) {
    return null;
  }

  const { data: client, error: clientError } = await supabase
    .from(CLIENT_TABLE)
    .select(
      `
      client_id,
      user_id
    `,
    )
    .eq("client_id", clientId)
    .maybeSingle();

  if (clientError) {
    console.error("Failed to load client:", clientError);

    return null;
  }

  if (!client) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from(PROFILES_TABLE)
    .select(
      `
      display_name,
      first_name,
      last_name,
      avatar_url,
      location
    `,
    )
    .eq("user_id", client.user_id)
    .maybeSingle();

  if (profileError) {
    console.error("Failed to load client profile:", profileError);
  }

  return {
    client_id: client.client_id,
    user_id: client.user_id,

    profile: profile ?? null,
  };
}

/* ==========================================================
   LOAD CATEGORY
========================================================== */

async function getCategoryData(
  categoryId: string | null,
): Promise<MarketplaceCategory | null> {
  if (!categoryId) {
    return null;
  }

  const { data: category, error } = await supabase
    .from(CATEGORY_TABLE)
    .select(
      `
      id,
      name
    `,
    )
    .eq("id", categoryId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load category:", error);

    return null;
  }

  if (!category) {
    return null;
  }

  return {
    category_id: category.id,
    name: category.name,
  };
}

/* ==========================================================
   BUILD SERVICE
========================================================== */

async function buildMarketplaceService(
  service: ServiceRow,
): Promise<MarketplaceService> {
  const [freelancer, category] = await Promise.all([
    getFreelancerData(service.freelancer_id),
    getCategoryData(service.category_id),
  ]);

  return {
    listing_type: "service",

    service_id: service.service_id,

    freelancer_id: service.freelancer_id,
    client_id: null,

    title: service.title,
    description: service.description,

    price: Number(service.price),

    pricing_mode: service.pricing_mode,

    delivery_time_days: Number(service.delivery_time_days),

    revisions_count: Number(service.revisions_count),

    service_type: service.service_type,

    status: service.status,

    slug: service.slug,
    cover_image_url: service.cover_image_url,

    category_id: service.category_id,

    created_at: service.created_at,
    updated_at: service.updated_at,

    freelancer,
    client: null,

    category,
  };
}

/* ==========================================================
   BUILD JOB
========================================================== */

async function buildMarketplaceJob(job: JobRow): Promise<MarketplaceJob> {
  const [client, category] = await Promise.all([
    getClientData(job.client_id),
    getCategoryData(job.category_id),
  ]);

  return {
    listing_type: "job",

    job_id: job.job_id,

    freelancer_id: null,
    client_id: job.client_id,

    title: job.title,
    description: job.description,

    budget_min: Number(job.budget_min),
    budget_max: Number(job.budget_max),

    pricing_type: job.pricing_type,

    deadline: job.deadline,

    status: job.status,

    category_id: job.category_id,

    created_at: job.created_at,
    updated_at: job.updated_at,

    freelancer: null,
    client,

    category,
  };
}

/* ==========================================================
   GET SERVICES
========================================================== */

async function getServices(
  query: MarketplaceQuery,
): Promise<MarketplaceService[]> {
  let request = supabase
    .from(SERVICES_TABLE)
    .select(
      `
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
    `,
    )
    .eq("status", "Active")
    .eq("is_archived", false);

  const searchValue = query.search?.trim() ?? "";

  if (searchValue) {
    request = request.or(
      [
        `title.ilike.%${searchValue}%`,
        `description.ilike.%${searchValue}%`,
      ].join(","),
    );
  }

  if (query.categoryId) {
    request = request.eq("category_id", query.categoryId);
  }

  if (query.freelancerId) {
    request = request.eq("freelancer_id", query.freelancerId);
  }

  if (
    query.minPrice !== null &&
    query.minPrice !== undefined &&
    Number.isFinite(query.minPrice)
  ) {
    request = request.gte("price", query.minPrice);
  }

  if (
    query.maxPrice !== null &&
    query.maxPrice !== undefined &&
    Number.isFinite(query.maxPrice)
  ) {
    request = request.lte("price", query.maxPrice);
  }

  switch (query.sort) {
    case "lowestPrice":
      request = request.order("price", { ascending: true });
      break;

    case "highestPrice":
      request = request.order("price", { ascending: false });
      break;

    case "latest":
    case "relevance":
    default:
      request = request.order("created_at", { ascending: false });
      break;
  }

  const { data, error } = await request;

  if (error) {
    console.error("Failed to load services:", error);

    throw error;
  }

  if (!data) {
    return [];
  }

  return Promise.all((data as ServiceRow[]).map(buildMarketplaceService));
}

/* ==========================================================
   GET JOBS
========================================================== */

async function getJobs(query: MarketplaceQuery): Promise<MarketplaceJob[]> {
  let request = supabase
    .from(JOBS_TABLE)
    .select(
      `
      job_id,
      client_id,
      category_id,
      title,
      description,
      budget_min,
      budget_max,
      pricing_type,
      deadline,
      status,
      created_at,
      updated_at
    `,
    )
    .eq("status", "open")
    .eq("is_archived", false);

  const searchValue = query.search?.trim() ?? "";

  if (searchValue) {
    request = request.or(
      [
        `title.ilike.%${searchValue}%`,
        `description.ilike.%${searchValue}%`,
      ].join(","),
    );
  }

  if (query.categoryId) {
    request = request.eq("category_id", query.categoryId);
  }

  if (query.clientId) {
    request = request.eq("client_id", query.clientId);
  }

  if (
    query.minPrice !== null &&
    query.minPrice !== undefined &&
    Number.isFinite(query.minPrice)
  ) {
    request = request.gte("budget_min", query.minPrice);
  }

  if (
    query.maxPrice !== null &&
    query.maxPrice !== undefined &&
    Number.isFinite(query.maxPrice)
  ) {
    request = request.lte("budget_max", query.maxPrice);
  }

  switch (query.sort) {
    case "lowestPrice":
      request = request.order("budget_min", { ascending: true });
      break;

    case "highestPrice":
      request = request.order("budget_max", { ascending: false });
      break;

    case "latest":
    case "relevance":
    default:
      request = request.order("created_at", { ascending: false });
      break;
  }

  const { data, error } = await request;

  if (error) {
    console.error("Failed to load jobs:", error);

    throw error;
  }

  if (!data) {
    return [];
  }

  return Promise.all((data as JobRow[]).map(buildMarketplaceJob));
}

/* ==========================================================
   GET MARKETPLACE
========================================================== */

export async function getMarketplaceServices(
  query: MarketplaceQuery = {},
): Promise<MarketplaceItem[]> {
  const listingType = query.listingType ?? null;

  if (listingType === "service") {
    return getServices(query);
  }

  if (listingType === "job") {
    return getJobs(query);
  }

  const [services, jobs] = await Promise.all([
    getServices(query),
    getJobs(query),
  ]);

  return [...services, ...jobs].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/* ==========================================================
   GET MY MARKETPLACE LISTINGS
========================================================== */

export async function getMyMarketplaceListings(): Promise<MarketplaceItem[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw authError;
  }

  if (!user) {
    return [];
  }

  const { data: userData, error: userError } = await supabase
    .from(USERS_TABLE)
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (userError) {
    throw userError;
  }

  if (!userData) {
    return [];
  }

  if (userData.role === "freelancer") {
    const { data: freelancer, error } = await supabase
      .from(FREELANCER_TABLE)
      .select("freelancer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!freelancer) {
      return [];
    }

    return getMarketplaceServices({
      freelancerId: freelancer.freelancer_id,

      listingType: "service",

      sort: "latest",
    });
  }

  if (userData.role === "client") {
    const { data: client, error } = await supabase
      .from(CLIENT_TABLE)
      .select("client_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!client) {
      return [];
    }

    return getMarketplaceServices({
      clientId: client.client_id,

      listingType: "job",

      sort: "latest",
    });
  }

  return [];
}

/* ==========================================================
   SEARCH SERVICES
========================================================== */

export async function searchMarketplaceServices(
  search: string,
): Promise<MarketplaceService[]> {
  return getMarketplaceServices({
    search,

    sort: "relevance",

    listingType: "service",
  }) as Promise<MarketplaceService[]>;
}

/* ==========================================================
   SERVICES BY CATEGORY
========================================================== */

export async function getMarketplaceServicesByCategory(
  categoryId: string,
): Promise<MarketplaceService[]> {
  if (!categoryId) {
    return [];
  }

  return getMarketplaceServices({
    categoryId,

    sort: "latest",

    listingType: "service",
  }) as Promise<MarketplaceService[]>;
}

/* ==========================================================
   SERVICES BY PRICE
========================================================== */

export async function getMarketplaceServicesByPriceRange(
  minPrice?: number | null,
  maxPrice?: number | null,
): Promise<MarketplaceService[]> {
  return getMarketplaceServices({
    minPrice: minPrice ?? null,

    maxPrice: maxPrice ?? null,

    sort: "lowestPrice",

    listingType: "service",
  }) as Promise<MarketplaceService[]>;
}

/* ==========================================================
   LOWEST PRICE
========================================================== */

export async function getLowestPriceMarketplaceServices(): Promise<
  MarketplaceService[]
> {
  return getMarketplaceServices({
    sort: "lowestPrice",

    listingType: "service",
  }) as Promise<MarketplaceService[]>;
}

/* ==========================================================
   HIGHEST PRICE
========================================================== */

export async function getHighestPriceMarketplaceServices(): Promise<
  MarketplaceService[]
> {
  return getMarketplaceServices({
    sort: "highestPrice",

    listingType: "service",
  }) as Promise<MarketplaceService[]>;
}

/* ==========================================================
   LATEST SERVICES
========================================================== */

export async function getLatestMarketplaceServices(): Promise<
  MarketplaceService[]
> {
  return getMarketplaceServices({
    sort: "latest",

    listingType: "service",
  }) as Promise<MarketplaceService[]>;
}

/* ==========================================================
   SERVICES BY FREELANCER
========================================================== */

export async function getMarketplaceServicesByFreelancer(
  freelancerId: string,
): Promise<MarketplaceService[]> {
  if (!freelancerId) {
    return [];
  }

  return getMarketplaceServices({
    freelancerId,

    sort: "latest",

    listingType: "service",
  }) as Promise<MarketplaceService[]>;
}

/* ==========================================================
   JOBS BY CLIENT
========================================================== */

export async function getMarketplaceListingsByClient(
  clientId: string,
): Promise<MarketplaceJob[]> {
  if (!clientId) {
    return [];
  }

  return getMarketplaceServices({
    clientId,

    sort: "latest",

    listingType: "job",
  }) as Promise<MarketplaceJob[]>;
}

/* ==========================================================
   SINGLE SERVICE
========================================================== */

export async function getMarketplaceService(
  serviceId: string,
): Promise<MarketplaceService | null> {
  if (!serviceId) {
    return null;
  }

  const { data, error } = await supabase
    .from(SERVICES_TABLE)
    .select(
      `
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
    `,
    )
    .eq("service_id", serviceId)
    .eq("status", "Active")
    .eq("is_archived", false)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return buildMarketplaceService(data as ServiceRow);
}

/* ==========================================================
   SINGLE JOB
========================================================== */

export async function getMarketplaceJob(
  jobId: string,
): Promise<MarketplaceJob | null> {
  if (!jobId) {
    return null;
  }

  const { data, error } = await supabase
    .from(JOBS_TABLE)
    .select(
      `
      job_id,
      client_id,
      category_id,
      title,
      description,
      budget_min,
      budget_max,
      pricing_type,
      deadline,
      status,
      created_at,
      updated_at
    `,
    )
    .eq("job_id", jobId)
    .eq("status", "open")
    .eq("is_archived", false)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return buildMarketplaceJob(data as JobRow);
}

/* ==========================================================
   ARCHIVE LISTING
========================================================== */

export async function archiveMarketplaceService(
  serviceId: string,
): Promise<boolean> {
  if (!serviceId) {
    return false;
  }

  const { data, error } = await supabase
    .from(SERVICES_TABLE)
    .update({ is_archived: true })
    .eq("service_id", serviceId)
    .select("service_id")
    .maybeSingle();

  if (error) {
    console.error("Failed to archive service:", error);
    return false;
  }

  return Boolean(data);
}

export async function archiveMarketplaceJob(jobId: string): Promise<boolean> {
  if (!jobId) {
    return false;
  }

  const { data, error } = await supabase
    .from(JOBS_TABLE)
    .update({ is_archived: true })
    .eq("job_id", jobId)
    .select("job_id")
    .maybeSingle();

  if (error) {
    console.error("Failed to archive job:", error);
    return false;
  }

  return Boolean(data);
}

/* ==========================================================
   REVIEWS
========================================================== */

export interface MarketplaceServiceReview {
  review_id: string;

  rating: number;

  comment: string | null;

  created_at: string;

  client_id: string;

  freelancer_id: string;

  project_id: string;

  reviewer_role: string;

  client: {
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
}

/* ==========================================================
   GET SERVICE REVIEWS
========================================================== */

export async function getMarketplaceServiceReviews(
  freelancerId: string,
): Promise<MarketplaceServiceReview[]> {
  if (!freelancerId) {
    return [];
  }

  const { data: reviews, error } = await supabase
    .from("reviews")
    .select(
      `
      review_id,
      rating,
      comment,
      created_at,
      client_id,
      freelancer_id,
      project_id,
      reviewer_role
    `,
    )
    .eq("freelancer_id", freelancerId)
    .eq("reviewer_role", "client")
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    throw error;
  }

  if (!reviews?.length) {
    return [];
  }

  const clientIds = [...new Set(reviews.map((review) => review.client_id))];

  const { data: clients } = await supabase
    .from(CLIENT_TABLE)
    .select(
      `
      client_id,
      user_id
    `,
    )
    .in("client_id", clientIds);

  const userIds =
    clients?.map((client) => client.user_id).filter(Boolean) ?? [];

  let profiles: {
    user_id: string;

    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  }[] = [];

  if (userIds.length) {
    const { data } = await supabase
      .from(PROFILES_TABLE)
      .select(
        `
        user_id,
        display_name,
        first_name,
        last_name,
        avatar_url
      `,
      )
      .in("user_id", userIds);

    profiles = data ?? [];
  }

  return reviews.map((review) => {
    const client = clients?.find((item) => item.client_id === review.client_id);

    const profile = profiles.find((item) => item.user_id === client?.user_id);

    return {
      review_id: review.review_id,

      rating: Number(review.rating),

      comment: review.comment,

      created_at: review.created_at,

      client_id: review.client_id,

      freelancer_id: review.freelancer_id,

      project_id: review.project_id,

      reviewer_role: review.reviewer_role,

      client: profile
        ? {
            display_name: profile.display_name,

            first_name: profile.first_name,

            last_name: profile.last_name,

            avatar_url: profile.avatar_url,
          }
        : null,
    };
  });
}

/* ==========================================================
   CREATE SERVICE ORDER
========================================================== */

export async function createMarketplaceOrder(
  serviceId: string,
  clientId: string,
  freelancerId: string,
) {
  if (!serviceId) {
    throw new Error("Service ID is required.");
  }

  if (!clientId) {
    throw new Error("Client ID is required.");
  }

  if (!freelancerId) {
    throw new Error("Freelancer ID is required.");
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw new Error(authError.message);
  }

  if (!user) {
    throw new Error("You must be logged in to purchase a service.");
  }

  const { data: freelancer, error: freelancerError } = await supabase
    .from(FREELANCER_TABLE)
    .select(
      `
      freelancer_id,
      user_id
    `,
    )
    .eq("freelancer_id", freelancerId)
    .maybeSingle();

  if (freelancerError) {
    throw new Error("Unable to verify the service owner.");
  }

  if (!freelancer) {
    throw new Error("Freelancer profile not found.");
  }

  if (freelancer.user_id === user.id) {
    throw new Error("You cannot purchase your own service.");
  }

  const { data: service, error: serviceError } = await supabase
    .from(SERVICES_TABLE)
    .select(
      `
      service_id,
      freelancer_id,
      status,
      is_archived
    `,
    )
    .eq("service_id", serviceId)
    .maybeSingle();

  if (serviceError) {
    throw new Error("Unable to verify the service.");
  }

  if (!service) {
    throw new Error("Service not found.");
  }

  if (service.status !== "Active" || service.is_archived) {
    throw new Error("This service is no longer available.");
  }

  if (service.freelancer_id !== freelancerId) {
    throw new Error("Service owner information does not match.");
  }

  const { data, error } = await supabase
    .from("service_orders")
    .insert({
      service_id: serviceId,

      client_id: clientId,

      freelancer_id: freelancerId,

      status: "pending",
    })
    .select("order_id")
    .single();

  if (error) {
    throw new Error(error.message || "Failed to create service order.");
  }

  return data;
}

/* ==========================================================
   CURRENT CLIENT PROFILE
========================================================== */

export async function getCurrentClientProfileId(): Promise<string> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw new Error(authError.message);
  }

  if (!user) {
    throw new Error("You must be logged in to continue.");
  }

  const { data, error } = await supabase
    .from(CLIENT_TABLE)
    .select("client_id")
    .eq("user_id", user.id)
    .single();

  if (error) {
    throw new Error("Client profile not found.");
  }

  return data.client_id;
}
