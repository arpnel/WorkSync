import { readPageCache } from "@/lib/pageReadCache";
import { getPublicIdentities } from "@/services/profile/publicIdentityService";
import { platformAction } from "@/services/platform/platformService";
import { supabase } from "@/lib/supabaseClient";
import { assertFreelancerAvailable } from "./freelancerAvailability";

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
  /** Public browsing omits authenticated member identity enrichment. */
  guest?: boolean;
  search?: string;

  categoryId?: string | null;
  skillId?: string | null;

  minPrice?: number | null;
  maxPrice?: number | null;

  sort?: MarketplaceSort;

  listingType?: MarketplaceListingType | null;

  freelancerId?: string | null;

  clientId?: string | null;

  /** Optional bounded page for marketplace feeds. */
  page?: number;
  pageSize?: number;
  matchedServiceIds?: string[];
  matchedJobIds?: string[];
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
  verification_status: string | null;
  skills?: string[];
  has_portfolio?: boolean;

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
  project_type: "standard" | "milestone";

  experience_level?: string;

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

export type ListingModerationStatus =
  | "editing"
  | "pending_review"
  | "manual_review"
  | "approved"
  | "rejected";

export type MarketplaceItem = (MarketplaceService | MarketplaceJob) & {
  moderationStatus?: ListingModerationStatus;
  moderationDecision?: string | null;
  moderationReason?: string | null;
  moderationCategory?: string | null;
};

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
  project_type?: "standard" | "milestone";

  experience_level?: string;

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
  if (!freelancerId) return null;
  const data = await getPublicIdentities({ freelancerIds: [freelancerId] });
  const freelancer = data.freelancers.find(
    (row) => row.freelancer_id === freelancerId,
  );
  return freelancer
    ? {
        ...freelancer,
        profile:
          data.profiles.find((row) => row.user_id === freelancer.user_id) ??
          null,
      }
    : null;
}
async function getClientData(
  clientId: string | null,
): Promise<MarketplaceClient | null> {
  if (!clientId) return null;
  const data = await getPublicIdentities({ clientIds: [clientId] });
  const client = data.clients.find((row) => row.client_id === clientId);
  return client
    ? {
        ...client,
        profile:
          data.profiles.find((row) => row.user_id === client.user_id) ?? null,
      }
    : null;
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
  related?: RelatedListings,
): Promise<MarketplaceService> {
  const [freelancer, category] = await Promise.all([
    related
      ? (related.freelancers.get(service.freelancer_id ?? "") ?? null)
      : getFreelancerData(service.freelancer_id),
    related
      ? (related.categories.get(service.category_id) ?? null)
      : getCategoryData(service.category_id),
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

async function buildMarketplaceJob(
  job: JobRow,
  related?: RelatedListings,
): Promise<MarketplaceJob> {
  const [client, category] = await Promise.all([
    related
      ? (related.clients.get(job.client_id ?? "") ?? null)
      : getClientData(job.client_id),
    related
      ? (related.categories.get(job.category_id) ?? null)
      : getCategoryData(job.category_id),
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
    project_type: job.project_type === "milestone" ? "milestone" : "standard",

    experience_level: job.experience_level,

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
  const columns = `service_id,freelancer_id,category_id,title,description,price,pricing_mode,delivery_time_days,revisions_count,service_type,status,slug,cover_image_url,created_at,updated_at${query.skillId ? ",listing_skills!inner(skill_id,listing_type)" : ""}`;
  let request = supabase
    .from(SERVICES_TABLE)
    .select(columns)
    .eq("status", "Active")
    .eq("is_archived", false);

  const searchValue = query.search?.trim() ?? "";

  if (query.matchedServiceIds) {
    if (!query.matchedServiceIds.length) return [];
    request = request.in("service_id", query.matchedServiceIds);
  } else if (searchValue) {
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
  if (query.skillId)
    request = request
      .eq("listing_skills.listing_type", "service")
      .eq("listing_skills.skill_id", query.skillId);

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

  if (query.pageSize && query.pageSize > 0) {
    const page = Math.max(0, Math.floor(query.page ?? 0));
    const pageSize = Math.min(48, Math.floor(query.pageSize));
    request = request.range(page * pageSize, page * pageSize + pageSize - 1);
  }

  const { data, error } = await request;

  if (error) {
    console.error("Failed to load services:", error);

    throw error;
  }

  if (!data) {
    return [];
  }

  const rows = data as unknown as ServiceRow[];
  const related = await loadRelatedListings(rows, [], query.guest);
  const services = await Promise.all(rows.map((row) => buildMarketplaceService(row, related)));
  return services;
}

/* ==========================================================
   GET JOBS
========================================================== */

async function hideUnavailableJobsForCurrentFreelancer(
  rows: JobRow[],
  guest: boolean | undefined,
): Promise<JobRow[]> {
  if (guest) return rows;
  const { data: auth, error: authError } = await supabase.auth.getSession();
  if (authError) throw authError;
  const user = auth.session?.user;
  if (!user) return rows;
  const [
    { data: account, error: accountError },
    { data: profile, error: profileError },
  ] = await Promise.all([
    supabase
      .from(USERS_TABLE)
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from(FREELANCER_TABLE)
      .select("freelancer_id")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (accountError) throw accountError;
  if (profileError) throw profileError;
  if (account?.role !== "freelancer" || !profile) return rows;
  const { data: applications, error } = await supabase
    .from("job_applications")
    .select("job_id,status")
    .eq("freelancer_id", profile.freelancer_id)
    .in(
      "job_id",
      rows.map((row) => row.job_id),
    );
  if (error) throw error;
  const unavailable = new Set(
    (applications ?? [])
      .filter((application) => application.status === "rejected")
      .map((application) => application.job_id),
  );
  return rows.filter((row) => !unavailable.has(row.job_id));
}
async function getJobs(query: MarketplaceQuery): Promise<MarketplaceJob[]> {
  const columns = `job_id,client_id,category_id,title,description,budget_min,budget_max,pricing_type,project_type,experience_level,deadline,status,created_at,updated_at${query.skillId ? ",listing_skills!inner(skill_id,listing_type)" : ""}`;
  let request = supabase
    .from(JOBS_TABLE)
    .select(columns)
    .eq("status", "open")
    .eq("is_archived", false);

  const searchValue = query.search?.trim() ?? "";

  if (query.matchedJobIds) {
    if (!query.matchedJobIds.length) return [];
    request = request.in("job_id", query.matchedJobIds);
  } else if (searchValue) {
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
  if (query.skillId)
    request = request
      .eq("listing_skills.listing_type", "job")
      .eq("listing_skills.skill_id", query.skillId);

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

  if (query.pageSize && query.pageSize > 0) {
    const page = Math.max(0, Math.floor(query.page ?? 0));
    const pageSize = Math.min(48, Math.floor(query.pageSize));
    request = request.range(page * pageSize, page * pageSize + pageSize - 1);
  }

  const { data, error } = await request;

  if (error) {
    console.error("Failed to load jobs:", error);

    throw error;
  }

  if (!data) {
    return [];
  }

  const rows = await hideUnavailableJobsForCurrentFreelancer(
    data as unknown as JobRow[],
    query.guest,
  );
  if (!rows.length) return [];
  const related = await loadRelatedListings([], rows, query.guest);
  return Promise.all(rows.map((row) => buildMarketplaceJob(row, related)));
}

/* ==========================================================
   GET MARKETPLACE
========================================================== */

export function getMarketplaceServices(
  query: MarketplaceQuery = {},
): Promise<MarketplaceItem[]> {
  return readPageCache("marketplace:" + JSON.stringify(query), () =>
    fetchMarketplaceServices(query),
  );
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function quotedOrLike(value: string) {
  const escaped = escapeLikePattern(value).replace(/"/g, '\\"');
  return `"%${escaped}%"`;
}

async function findMarketplaceSearchIds(
  search: string,
  query: MarketplaceQuery,
): Promise<{ serviceIds?: string[]; jobIds?: string[] }> {
  const term = search.trim();
  const pattern = `%${escapeLikePattern(term)}%`;
  const nameTerms = [...new Set(term.split(/\s+/).filter(Boolean))].slice(0, 8);
  const profileFilters = nameTerms.flatMap((word) =>
    ["display_name", "first_name", "last_name"].map(
      (field) => `${field}.ilike.${quotedOrLike(word)}`,
    ),
  );
  const [categoriesResult, skillsResult, profilesResult] = await Promise.all([
    supabase.from(CATEGORY_TABLE).select("id").ilike("name", pattern).limit(1000),
    supabase.from("skills").select("id").ilike("name", pattern).limit(1000),
    supabase
      .from(PROFILES_TABLE)
      .select("user_id,display_name,first_name,last_name")
      .or(profileFilters.join(","))
      .limit(1000),
  ]);
  if (categoriesResult.error) throw categoriesResult.error;
  if (skillsResult.error) throw skillsResult.error;
  if (profilesResult.error && !query.guest) throw profilesResult.error;

  const categoryIds = (categoriesResult.data ?? []).map((row) => row.id);
  const skillIds = (skillsResult.data ?? []).map((row) => row.id);
  const normalizedTerms = nameTerms.map((word) => word.toLowerCase());
  const matchingUserIds = (profilesResult.data ?? [])
    .filter((profile) => {
      const fullName = [profile.display_name, profile.first_name, profile.last_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return normalizedTerms.every((word) => fullName.includes(word));
    })
    .map((profile) => profile.user_id);
  const uniqueUserIds = [...new Set(matchingUserIds)];

  const [freelancersResult, clientsResult] = await Promise.all([
    uniqueUserIds.length
      ? supabase
          .from(FREELANCER_TABLE)
          .select("freelancer_id")
          .in("user_id", uniqueUserIds)
          .limit(1000)
      : Promise.resolve({ data: [], error: null }),
    uniqueUserIds.length
      ? supabase
          .from(CLIENT_TABLE)
          .select("client_id")
          .in("user_id", uniqueUserIds)
          .limit(1000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (freelancersResult.error) throw freelancersResult.error;
  if (clientsResult.error) throw clientsResult.error;

  const freelancerIds = (freelancersResult.data ?? []).map(
    (row) => row.freelancer_id,
  );
  const clientIds = (clientsResult.data ?? []).map((row) => row.client_id);
  const wantsServices = !query.listingType || query.listingType === "service";
  const wantsJobs = !query.listingType || query.listingType === "job";
  const [serviceSkillsResult, jobSkillsResult] = await Promise.all([
    wantsServices && skillIds.length
      ? supabase
          .from("listing_skills")
          .select("service_id")
          .eq("listing_type", "service")
          .in("skill_id", skillIds)
          .limit(5000)
      : Promise.resolve({ data: [], error: null }),
    wantsJobs && skillIds.length
      ? supabase
          .from("listing_skills")
          .select("job_id")
          .eq("listing_type", "job")
          .in("skill_id", skillIds)
          .limit(5000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (serviceSkillsResult.error) throw serviceSkillsResult.error;
  if (jobSkillsResult.error) throw jobSkillsResult.error;

  const serviceFilters = [
    `title.ilike.${quotedOrLike(term)}`,
    `description.ilike.${quotedOrLike(term)}`,
  ];
  if (categoryIds.length)
    serviceFilters.push(`category_id.in.(${categoryIds.join(",")})`);
  if (freelancerIds.length)
    serviceFilters.push(`freelancer_id.in.(${freelancerIds.join(",")})`);
  const serviceSkillListingIds = [...new Set(
    (serviceSkillsResult.data ?? []).map((row) => row.service_id),
  )];
  if (serviceSkillListingIds.length)
    serviceFilters.push(`service_id.in.(${serviceSkillListingIds.join(",")})`);

  const jobFilters = [
    `title.ilike.${quotedOrLike(term)}`,
    `description.ilike.${quotedOrLike(term)}`,
  ];
  if (categoryIds.length)
    jobFilters.push(`category_id.in.(${categoryIds.join(",")})`);
  if (clientIds.length) jobFilters.push(`client_id.in.(${clientIds.join(",")})`);
  const jobSkillListingIds = [...new Set(
    (jobSkillsResult.data ?? []).map((row) => row.job_id),
  )];
  if (jobSkillListingIds.length)
    jobFilters.push(`job_id.in.(${jobSkillListingIds.join(",")})`);

  const [serviceRows, jobRows] = await Promise.all([
    wantsServices
      ? supabase
          .from(SERVICES_TABLE)
          .select("service_id")
          .eq("status", "Active")
          .eq("is_archived", false)
          .or(serviceFilters.join(","))
          .limit(5000)
      : Promise.resolve({ data: [], error: null }),
    wantsJobs
      ? supabase
          .from(JOBS_TABLE)
          .select("job_id")
          .eq("status", "open")
          .eq("is_archived", false)
          .or(jobFilters.join(","))
          .limit(5000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (serviceRows.error) throw serviceRows.error;
  if (jobRows.error) throw jobRows.error;
  return {
    ...(wantsServices
      ? { serviceIds: (serviceRows.data ?? []).map((row) => row.service_id) }
      : {}),
    ...(wantsJobs
      ? { jobIds: (jobRows.data ?? []).map((row) => row.job_id) }
      : {}),
  };
}

async function fetchMarketplaceServices(
  query: MarketplaceQuery,
): Promise<MarketplaceItem[]> {
  if (query.search?.trim()) {
    const matches = await findMarketplaceSearchIds(query.search, query);
    query = {
      ...query,
      search: "",
      matchedServiceIds: matches.serviceIds,
      matchedJobIds: matches.jobIds,
    };
  }
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

export function getMyMarketplaceListings(): Promise<MarketplaceItem[]> {
  return readPageCache("my-listings", fetchMyMarketplaceListings);
}
async function fetchMyMarketplaceListings(): Promise<MarketplaceItem[]> {
  const {
    data: { session },
    error: authError,
  } = await supabase.auth.getSession();
  const user = session?.user;

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

    const listings = await getMarketplaceServices({
      freelancerId: freelancer.freelancer_id,

      listingType: "service",

      sort: "latest",
    });
    return addListingModerationState(listings);
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

    const listings = await getMarketplaceServices({
      clientId: client.client_id,

      listingType: "job",

      sort: "latest",
    });
    return addListingModerationState(listings);
  }

  return [];
}

async function addListingModerationState(
  listings: MarketplaceItem[],
): Promise<MarketplaceItem[]> {
  if (listings.length === 0) return listings;
  const { data, error } = await supabase
    .from("listing_submissions")
    .select("listing_type,listing_id,status,decision,decision_category,decision_reason,failure_reason,ai_explanation")
    .in(
      "listing_id",
      listings.map((listing) =>
        listing.listing_type === "job" ? listing.job_id : listing.service_id,
      ),
    );
  if (error) throw error;
  const moderation = new Map(
    (data ?? []).map((row) => [
      `${row.listing_type}:${row.listing_id}`,
      row,
    ]),
  );
  return listings.map((listing) => {
    const id = listing.listing_type === "job" ? listing.job_id : listing.service_id;
    const row = moderation.get(`${listing.listing_type}:${id}`);
    return {
      ...listing,
      moderationStatus: row?.status as ListingModerationStatus | undefined,
      moderationDecision: row?.decision ?? null,
      moderationCategory: row?.decision_category ?? null,
      moderationReason:
        row?.decision_reason ?? row?.failure_reason ?? row?.ai_explanation ?? null,
    };
  });
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
  guest = false,
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

  return buildMarketplaceService(
    data as ServiceRow,
    guest
      ? await loadRelatedListings([data as ServiceRow], [], true)
      : undefined,
  );
}

/* ==========================================================
   SINGLE JOB
========================================================== */

export async function getMarketplaceJob(
  jobId: string,
  guest = false,
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
      project_type,
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

  return buildMarketplaceJob(
    data as JobRow,
    guest ? await loadRelatedListings([], [data as JobRow], true) : undefined,
  );
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
  details: {
    projectTitle: string;
    description: string;
    budget: number;
    deliveryTimeDays: number;
    revisionsCount: number;
    categoryId: string;
    categoryName: string;
  },
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

  if (!details.projectTitle.trim() || !details.description.trim()) {
    throw new Error("Project title and description are required.");
  }
  if (
    !Number.isFinite(details.budget) ||
    details.budget <= 0 ||
    details.budget > 100_000
  ) {
    throw new Error(
      "Budget must be greater than 0 and no more than PHP 100,000.",
    );
  }
  if (!details.categoryId) {
    throw new Error("Job category is required.");
  }

  const {
    data: { session },
    error: authError,
  } = await supabase.auth.getSession();
  const user = session?.user;

  if (authError) {
    throw new Error(authError.message);
  }

  if (!user) {
    throw new Error("You must be logged in to purchase a service.");
  }

  const identities = await getPublicIdentities({
    freelancerIds: [freelancerId],
  });
  const freelancer = identities.freelancers.find(
    (row) => row.freelancer_id === freelancerId,
  );

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

  await assertFreelancerAvailable(freelancerId);
  return platformAction("worksync_request_service", {
    p_service: serviceId,
    p_details: details,
  });
}

/* ==========================================================
   CURRENT CLIENT PROFILE
========================================================== */

export async function getCurrentClientProfileId(): Promise<string> {
  const {
    data: { session },
    error: authError,
  } = await supabase.auth.getSession();
  const user = session?.user;

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

type RelatedListings = {
  freelancers: Map<string, MarketplaceFreelancer>;
  clients: Map<string, MarketplaceClient>;
  categories: Map<string, MarketplaceCategory>;
};
async function loadRelatedListings(
  services: ServiceRow[],
  jobs: JobRow[],
  guest = false,
): Promise<RelatedListings> {
  const freelancerIds = [
    ...new Set(
      services.flatMap((row) => (row.freelancer_id ? [row.freelancer_id] : [])),
    ),
  ];
  const clientIds = [
    ...new Set(jobs.flatMap((row) => (row.client_id ? [row.client_id] : []))),
  ];
  const categoryIds = [
    ...new Set(
      [...services, ...jobs].map((row) => row.category_id).filter(Boolean),
    ),
  ];
  const [identities, categories, freelancerSkills, portfolioRows] =
    await Promise.all([
      guest
        ? Promise.resolve({ profiles: [], freelancers: [], clients: [] })
        : getPublicIdentities({ freelancerIds, clientIds }),
      categoryIds.length
        ? supabase.from(CATEGORY_TABLE).select("id,name").in("id", categoryIds)
        : Promise.resolve({ data: [], error: null }),
      !guest && freelancerIds.length
        ? supabase
            .from("freelancer_skills")
            .select("freelancer_id,skills(name)")
            .in("freelancer_id", freelancerIds)
        : Promise.resolve({ data: [], error: null }),
      !guest && freelancerIds.length
        ? supabase
            .from("portfolio")
            .select("freelancer_id")
            .in("freelancer_id", freelancerIds)
            .limit(500)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (categories.error) throw categories.error;
  const profiles = new Map(
    identities.profiles.map((row) => [row.user_id, row]),
  );
  const skillsByFreelancer = new Map<string, string[]>();
  for (const row of freelancerSkills.data ?? []) {
    const skill = Array.isArray(row.skills) ? row.skills[0] : row.skills;
    if (typeof skill?.name !== "string") continue;
    const names = skillsByFreelancer.get(row.freelancer_id) ?? [];
    names.push(skill.name);
    skillsByFreelancer.set(row.freelancer_id, names);
  }
  const freelancersWithPortfolio = new Set(
    (portfolioRows.data ?? []).map((row) => row.freelancer_id),
  );
  return {
    freelancers: new Map(
      identities.freelancers.map((row) => [
        row.freelancer_id,
        {
          ...row,
          profile: profiles.get(row.user_id) ?? null,
          skills: skillsByFreelancer.get(row.freelancer_id) ?? [],
          has_portfolio: freelancersWithPortfolio.has(row.freelancer_id),
        },
      ]),
    ),
    clients: new Map(
      identities.clients.map((row) => [
        row.client_id,
        { ...row, profile: profiles.get(row.user_id) ?? null },
      ]),
    ),
    categories: new Map(
      (categories.data ?? []).map((row) => [
        row.id,
        { category_id: row.id, name: row.name },
      ]),
    ),
  };
}
