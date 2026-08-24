import { supabase } from "@/lib/supabaseClient";

/* ==========================================================
   TABLES
========================================================== */

const MARKETPLACE_TABLE = "marketplace_listings";
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
   MARKETPLACE LISTING
========================================================== */

export interface MarketplaceService {
  service_id: string;

  freelancer_id: string | null;
  client_id: string | null;

  title: string;
  description: string;

  price: number;

  delivery_time_days: number;
  status: string;

  revisions_count: number;

  cover_image_url: string | null;

  category_id: string;
  service_type: string;

  slug: string | null;

  listing_type: string;

  created_at: string;
  updated_at: string;

  freelancer: {
    freelancer_id: string;
    user_id: string;

    headline: string | null;
    hourly_rate: number | null;
    verification_status: string | null;

    profile: {
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      avatar_url: string | null;
      location: string | null;
    } | null;
  } | null;

  client: {
    client_id: string;
    user_id: string;

    profile: {
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      avatar_url: string | null;
      location: string | null;
    } | null;
  } | null;

  category: {
    category_id: string;
    name: string;
  } | null;
}

/* ==========================================================
   DATABASE ROW
========================================================== */

interface MarketplaceListingRow {
  service_id: string;

  freelancer_id: string | null;
  client_id: string | null;

  title: string;
  description: string;

  price: number;

  delivery_time_days: number;
  status: string;

  revisions_count: number;

  cover_image_url: string | null;

  category_id: string;
  service_type: string;

  slug: string | null;

  listing_type: string;

  created_at: string;
  updated_at: string;
}

/* ==========================================================
   SELECT COLUMNS
========================================================== */

const MARKETPLACE_SELECT = `
  service_id,
  freelancer_id,
  client_id,
  title,
  description,
  price,
  delivery_time_days,
  status,
  revisions_count,
  cover_image_url,
  category_id,
  service_type,
  slug,
  listing_type,
  created_at,
  updated_at
`;

/* ==========================================================
   LOAD FREELANCER
========================================================== */

async function getFreelancerData(
  freelancerId: string | null,
): Promise<MarketplaceService["freelancer"]> {
  if (!freelancerId) {
    return null;
  }

  const { data: freelancer, error: freelancerError } = await supabase
    .from(FREELANCER_TABLE)
    .select(`
      freelancer_id,
      user_id,
      headline,
      hourly_rate,
      verification_status
    `)
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
    .select(`
      display_name,
      first_name,
      last_name,
      avatar_url,
      location
    `)
    .eq("user_id", freelancer.user_id)
    .maybeSingle();

  if (profileError) {
    console.error(
      "Failed to load freelancer profile:",
      profileError,
    );
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
): Promise<MarketplaceService["client"]> {
  if (!clientId) {
    return null;
  }

  const { data: client, error: clientError } = await supabase
    .from(CLIENT_TABLE)
    .select(`
      client_id,
      user_id
    `)
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
    .select(`
      display_name,
      first_name,
      last_name,
      avatar_url,
      location
    `)
    .eq("user_id", client.user_id)
    .maybeSingle();

  if (profileError) {
    console.error(
      "Failed to load client profile:",
      profileError,
    );
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
): Promise<MarketplaceService["category"]> {
  if (!categoryId) {
    return null;
  }

  const { data: category, error } = await supabase
    .from(CATEGORY_TABLE)
    .select(`
      id,
      name
    `)
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
   BUILD MARKETPLACE LISTING
========================================================== */

async function buildMarketplaceService(
  service: MarketplaceListingRow,
): Promise<MarketplaceService> {
  const [freelancer, client, category] = await Promise.all([
    getFreelancerData(service.freelancer_id),
    getClientData(service.client_id),
    getCategoryData(service.category_id),
  ]);

  return {
    service_id: service.service_id,

    freelancer_id: service.freelancer_id,
    client_id: service.client_id,

    title: service.title,
    description: service.description,

    price: Number(service.price),

    delivery_time_days: Number(service.delivery_time_days),

    status: service.status,

    revisions_count: Number(service.revisions_count),

    cover_image_url: service.cover_image_url,

    category_id: service.category_id,

    service_type: service.service_type,

    slug: service.slug,

    listing_type: service.listing_type,

    created_at: service.created_at,
    updated_at: service.updated_at,

    freelancer,
    client,
    category,
  };
}

/* ==========================================================
   GET MARKETPLACE SERVICES / LISTINGS
========================================================== */

export async function getMarketplaceServices(
  query: MarketplaceQuery = {},
): Promise<MarketplaceService[]> {
  const {
    search = "",
    categoryId = null,
    minPrice = null,
    maxPrice = null,
    sort = "latest",
    listingType = null,
    freelancerId = null,
    clientId = null,
  } = query;

  let request = supabase
    .from(MARKETPLACE_TABLE)
    .select(MARKETPLACE_SELECT)
    .eq("status", "Active");

  if (listingType) {
    request = request.eq("listing_type", listingType);
  }

  const searchValue = search.trim();

  if (searchValue) {
    request = request.or(
      [
        `title.ilike.%${searchValue}%`,
        `description.ilike.%${searchValue}%`,
      ].join(","),
    );
  }

  if (categoryId) {
    request = request.eq("category_id", categoryId);
  }

  if (freelancerId) {
    request = request.eq("freelancer_id", freelancerId);
  }

  if (clientId) {
    request = request.eq("client_id", clientId);
  }

  if (minPrice !== null && Number.isFinite(minPrice)) {
    request = request.gte("price", minPrice);
  }

  if (maxPrice !== null && Number.isFinite(maxPrice)) {
    request = request.lte("price", maxPrice);
  }

  switch (sort) {
    case "lowestPrice":
      request = request.order("price", {
        ascending: true,
      });
      break;

    case "highestPrice":
      request = request.order("price", {
        ascending: false,
      });
      break;

    case "latest":
    case "relevance":
    default:
      request = request.order("created_at", {
        ascending: false,
      });
      break;
  }

  const { data, error } = await request;

  if (error) {
    console.error(
      "Failed to load marketplace listings:",
      error,
    );

    throw error;
  }

  if (!data || data.length === 0) {
    return [];
  }

  return Promise.all(
    (data as MarketplaceListingRow[]).map(
      buildMarketplaceService,
    ),
  );
}

/* ==========================================================
   GET MY MARKETPLACE LISTINGS
========================================================== */

export async function getMyMarketplaceListings(): Promise<MarketplaceService[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error(
      "getMyMarketplaceListings: Failed to get authenticated user:",
      authError,
    );

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
    const { data: freelancer, error: freelancerError } =
      await supabase
        .from(FREELANCER_TABLE)
        .select("freelancer_id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (freelancerError) {
      throw freelancerError;
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
    const { data: client, error: clientError } = await supabase
      .from(CLIENT_TABLE)
      .select("client_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (clientError) {
      throw clientError;
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
   SEARCH MARKETPLACE SERVICES
========================================================== */

export async function searchMarketplaceServices(
  search: string,
): Promise<MarketplaceService[]> {
  return getMarketplaceServices({
    search,
    sort: "relevance",
    listingType: "service",
  });
}

/* ==========================================================
   GET SERVICES BY CATEGORY
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
  });
}

/* ==========================================================
   GET SERVICES BY PRICE RANGE
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
  });
}

/* ==========================================================
   GET LOWEST PRICE SERVICES
========================================================== */

export async function getLowestPriceMarketplaceServices(): Promise<MarketplaceService[]> {
  return getMarketplaceServices({
    sort: "lowestPrice",
    listingType: "service",
  });
}

/* ==========================================================
   GET HIGHEST PRICE SERVICES
========================================================== */

export async function getHighestPriceMarketplaceServices(): Promise<MarketplaceService[]> {
  return getMarketplaceServices({
    sort: "highestPrice",
    listingType: "service",
  });
}

/* ==========================================================
   GET LATEST SERVICES
========================================================== */

export async function getLatestMarketplaceServices(): Promise< MarketplaceService[] > {
  return getMarketplaceServices({
    sort: "latest",
    listingType: "service",
  });
}

/* ==========================================================
   GET SERVICES BY FREELANCER
========================================================== */

export async function getMarketplaceServicesByFreelancer(
  freelancerId: string,
): Promise<MarketplaceService[]> {
  if (!freelancerId) {
    console.error(
      "getMarketplaceServicesByFreelancer: freelancerId is undefined.",
    );

    return [];
  }

  return getMarketplaceServices({
    freelancerId,
    sort: "latest",
    listingType: "service",
  });
}

/* ==========================================================
   GET LISTINGS BY CLIENT
   JOB ONLY
========================================================== */

export async function getMarketplaceListingsByClient(
  clientId: string,
): Promise<MarketplaceService[]> {
  if (!clientId) {
    console.error(
      "getMarketplaceListingsByClient: clientId is undefined.",
    );

    return [];
  }

  return getMarketplaceServices({
    clientId,
    sort: "latest",
    listingType: "job",
  });
}

/* ==========================================================
   GET SINGLE MARKETPLACE LISTING
==========================================================

   IMPORTANT:
   This is intentionally NOT restricted to listing_type = service.

   It can now load:

   - service
   - job

   The component decides what UI to display based on:
   service.listing_type
========================================================== */

export async function getMarketplaceService(
  serviceId: string,
): Promise<MarketplaceService | null> {
  if (!serviceId) {
    console.error(
      "getMarketplaceService: serviceId is undefined.",
    );

    return null;
  }

  const { data, error } = await supabase
    .from(MARKETPLACE_TABLE)
    .select(MARKETPLACE_SELECT)
    .eq("service_id", serviceId)
    .eq("status", "Active")
    .maybeSingle();

  if (error) {
    console.error(
      "Failed to load marketplace listing:",
      error,
    );

    throw error;
  }

  if (!data) {
    return null;
  }

  return buildMarketplaceService(
    data as MarketplaceListingRow,
  );
}

/* ==========================================================
   GET MARKETPLACE LISTINGS
========================================================== */

export async function getMarketplaceListings(
  query: MarketplaceQuery = {},
): Promise<MarketplaceService[]> {
  return getMarketplaceServices(query);
}

/* ==========================================================
   DELETE MARKETPLACE SERVICE
========================================================== */

export async function deleteMarketplaceService(
  serviceId: string,
): Promise<boolean> {
  if (!serviceId) {
    console.error(
      "deleteMarketplaceService: serviceId is undefined.",
    );

    return false;
  }

  const { error } = await supabase
    .from(MARKETPLACE_TABLE)
    .delete()
    .eq("service_id", serviceId)
    .eq("listing_type", "service");

  if (error) {
    console.error(
      "Failed to delete marketplace service:",
      error,
    );

    return false;
  }

  return true;
}

/* ==========================================================
   MARKETPLACE REVIEWS
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
==========================================================

   Reviews are only used for services.

   Jobs do not call this function.
========================================================== */

export async function getMarketplaceServiceReviews(
  freelancerId: string,
): Promise<MarketplaceServiceReview[]> {
  if (!freelancerId) {
    console.error(
      "getMarketplaceServiceReviews: freelancerId is undefined.",
    );

    return [];
  }

  const { data: reviews, error } = await supabase
    .from("reviews")
    .select(`
      review_id,
      rating,
      comment,
      created_at,
      client_id,
      freelancer_id,
      project_id,
      reviewer_role
    `)
    .eq("freelancer_id", freelancerId)
    .eq("reviewer_role", "client")
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error(
      "Failed to load service reviews:",
      error,
    );

    throw error;
  }

  if (!reviews || reviews.length === 0) {
    return [];
  }

  const clientIds = [
    ...new Set(
      reviews.map((review) => review.client_id),
    ),
  ];

  const { data: clients, error: clientError } =
    await supabase
      .from("client_profiles")
      .select(`
        client_id,
        user_id
      `)
      .in("client_id", clientIds);

  if (clientError) {
    console.error(
      "Failed to load review clients:",
      clientError,
    );
  }

  const userIds =
    clients
      ?.map((client) => client.user_id)
      .filter(Boolean) ?? [];

  let profiles: {
    user_id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  }[] = [];

  if (userIds.length > 0) {
    const {
      data: profileData,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select(`
        user_id,
        display_name,
        first_name,
        last_name,
        avatar_url
      `)
      .in("user_id", userIds);

    if (profileError) {
      console.error(
        "Failed to load review profiles:",
        profileError,
      );
    }

    profiles = profileData ?? [];
  }

  return reviews.map((review) => {
    const client = clients?.find(
      (item) =>
        item.client_id === review.client_id,
    );

    const profile = profiles.find(
      (item) =>
        item.user_id === client?.user_id,
    );

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
   CREATE MARKETPLACE ORDER
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

  /* ========================================================
     GET CURRENT AUTHENTICATED USER
  ======================================================== */

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error(
      "Failed to get authenticated user:",
      authError,
    );

    throw new Error(authError.message);
  }

  if (!user) {
    throw new Error(
      "You must be logged in to purchase a service.",
    );
  }

  /* ========================================================
     GET FREELANCER OWNER
  ======================================================== */

  const { data: freelancer, error: freelancerError } =
    await supabase
      .from(FREELANCER_TABLE)
      .select("freelancer_id, user_id")
      .eq("freelancer_id", freelancerId)
      .maybeSingle();

  if (freelancerError) {
    console.error(
      "Failed to verify service freelancer:",
      freelancerError,
    );

    throw new Error(
      "Unable to verify the service owner.",
    );
  }

  if (!freelancer) {
    throw new Error(
      "Freelancer profile not found.",
    );
  }

  /* ========================================================
     PREVENT BUYING YOUR OWN SERVICE
  ======================================================== */

  if (freelancer.user_id === user.id) {
    throw new Error(
      "You cannot purchase your own service.",
    );
  }

  /* ========================================================
     VERIFY SERVICE BELONGS TO FREELANCER
  ======================================================== */

  const { data: service, error: serviceError } =
    await supabase
      .from(MARKETPLACE_TABLE)
      .select(
        "service_id, freelancer_id, listing_type, status",
      )
      .eq("service_id", serviceId)
      .maybeSingle();

  if (serviceError) {
    console.error(
      "Failed to verify marketplace service:",
      serviceError,
    );

    throw new Error(
      "Unable to verify the service.",
    );
  }

  if (!service) {
    throw new Error(
      "Service not found.",
    );
  }

  if (service.listing_type !== "service") {
    throw new Error(
      "This listing is not a service.",
    );
  }

  if (service.status !== "Active") {
    throw new Error(
      "This service is no longer available.",
    );
  }

  if (service.freelancer_id !== freelancerId) {
    throw new Error(
      "Service owner information does not match.",
    );
  }

  /* ========================================================
     CREATE ORDER
  ======================================================== */

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
    console.error(
      "Failed to create marketplace order:",
      error,
    );

    throw new Error(
      error.message ||
        "Failed to create marketplace order.",
    );
  }

  return data;
}

export async function getCurrentClientProfileId() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw new Error(authError.message);
  }

  if (!user) {
    throw new Error(
      "You must be logged in to continue.",
    );
  }

  const { data, error } = await supabase
    .from("client_profiles")
    .select("client_id")
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error(
      "Failed to load client profile:",
      error,
    );

    throw new Error(
      "Client profile not found.",
    );
  }

  return data.client_id;
}