import { getPublicIdentities } from "@/services/profile/publicIdentityService";
import { supabase } from "@/lib/supabaseClient";
import { getFreelancerDetails } from "./profileDetails";

import type {
  Profile,
  UpdateProfilePayload,
  PortfolioProject,
  Service,
  Review,
} from "../../types/profile/profile";

/* ==========================================================
   TABLES
========================================================== */

const USERS_TABLE = "Users";
const PROFILES_TABLE = "profiles";
const FREELANCER_TABLE = "freelancer_profiles";

const PORTFOLIO_TABLE = "portfolio";
const SERVICES_TABLE = "services";
const REVIEWS_TABLE = "reviews";

/* ==========================================================
   STORAGE
========================================================== */

const AVATARS_BUCKET = "avatars";
const BANNERS_BUCKET = "banners";
const PORTFOLIO_BUCKET = "portfolio_images";

/* ==========================================================
   PROFILE
========================================================== */

export async function getCurrentProfile(
  includeDetails = false,
): Promise<Profile | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw authError;
  }

  if (!user) {
    throw new Error("User not authenticated.");
  }

  /* ---------------- Users ---------------- */

  const [userResult, profileResult] = await Promise.all([
    supabase
      .from(USERS_TABLE)
      .select("user_id, email, role, created_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from(PROFILES_TABLE)
      .select(
        `
          user_id,
          avatar_url,
          bio,
          location,
          created_at,
          updated_at,
          display_name,
          banner_url,
          account_setup_completed,
          first_name,
          last_name,
          province,
          city,
          english_proficiency
        `,
      )
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const { data: userData, error: userError } = userResult;

  if (userError) {
    throw userError;
  }

  if (!userData) {
    throw new Error("User record not found.");
  }

  /* ---------------- Profiles ---------------- */

  const { data: profileData, error: profileError } = profileResult;

  if (profileError) {
    throw profileError;
  }

  if (!profileData) {
    throw new Error("Profile record not found.");
  }

  /* ---------------- Base Profile ---------------- */

  const profile: Profile = {
    /* ---------------- Users ---------------- */

    user_id: userData.user_id,
    email: userData.email,

    /*
     * WorkSync application role comes from
     * the Users table, NOT auth.users.role.
     */
    role: userData.role,

    /* ---------------- profiles ---------------- */

    first_name: profileData.first_name,
    last_name: profileData.last_name,

    avatar_url: profileData.avatar_url,
    bio: profileData.bio,
    location:
      [profileData.city, profileData.province].filter(Boolean).join(", ") ||
      profileData.location,

    display_name: profileData.display_name,
    banner_url: profileData.banner_url,

    account_setup_completed: profileData.account_setup_completed,

    province: profileData.province,
    city: profileData.city,
    english_proficiency: profileData.english_proficiency,

    /* ---------------- freelancer_profiles ---------------- */

    headline: null,
    hourly_rate: null,
    verification_status: null,

    /* ---------------- Computed data ---------------- */

    rating: null,
    reviews_count: 0,
    projects_completed: 0,
    total_earnings: null,

    /* ---------------- Timestamps ---------------- */

    created_at: profileData.created_at,
    updated_at: profileData.updated_at,
  };

  /* ========================================================
     FREELANCER PROFILE
  ======================================================== */

  if (userData.role === "freelancer") {
    const { data: freelancerData, error: freelancerError } = await supabase
      .from(FREELANCER_TABLE)
      .select(
        `
        freelancer_id,
        user_id,
        headline,
        hourly_rate,
        verification_status,
        years_of_experience,
        employment_preference,
        portfolio_website,
        linkedin_url,
        github_url,
        resume_url
      `,
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (freelancerError) {
      throw freelancerError;
    }

    if (freelancerData) {
      profile.headline = freelancerData.headline;
      profile.hourly_rate = freelancerData.hourly_rate;
      profile.verification_status = freelancerData.verification_status;
      profile.years_of_experience = freelancerData.years_of_experience;
      profile.employment_preference = freelancerData.employment_preference;
      profile.portfolio_website = freelancerData.portfolio_website;
      profile.linkedin_url = freelancerData.linkedin_url;
      profile.github_url = freelancerData.github_url;
      if (includeDetails)
        Object.assign(
          profile,
          await getFreelancerDetails(freelancerData.freelancer_id),
        );
    }
  }

  return profile;
}

export async function getPublicProfile(
  userId: string,
): Promise<Profile | null> {
  const identities = await getPublicIdentities({ userIds: [userId] });
  const identity = identities.profiles.find((row) => row.user_id === userId);
  if (!identity) return null;
  const freelancerResult = {
    data: identities.freelancers.find((row) => row.user_id === userId) ?? null,
  };
  const profileResult = await supabase
    .from(PROFILES_TABLE)
    .select(
      "user_id, avatar_url, bio, location, created_at, updated_at, display_name, banner_url, account_setup_completed, first_name, last_name, province, city, english_proficiency",
    )
    .eq("user_id", userId)
    .maybeSingle();

  const details = freelancerResult.data
    ? await getFreelancerDetails(freelancerResult.data.freelancer_id)
    : {};

  const base = profileResult.data ?? {
    ...identity,
    bio: identity.bio,
    banner_url: identity.banner_url,
    account_setup_completed: false,
    province: null,
    city: null,
    english_proficiency: null,
    created_at: identity.created_at,
    updated_at: identity.updated_at,
  };
  return {
    user_id: userId,
    email: "",
    role: freelancerResult.data ? "freelancer" : "client",
    first_name: base.first_name,
    last_name: base.last_name,
    avatar_url: base.avatar_url,
    bio: base.bio,
    location:
      [base.city, base.province].filter(Boolean).join(", ") || base.location,
    display_name: base.display_name,
    banner_url: base.banner_url,
    account_setup_completed: base.account_setup_completed,
    province: base.province,
    city: base.city,
    english_proficiency: base.english_proficiency,
    headline: freelancerResult.data?.headline ?? null,
    hourly_rate: freelancerResult.data?.hourly_rate ?? null,
    verification_status: freelancerResult.data?.verification_status ?? null,
    rating: null,
    reviews_count: 0,
    projects_completed: 0,
    total_earnings: null,
    created_at: base.created_at,
    updated_at: base.updated_at,
    ...details,
  } as Profile;
}

/* ==========================================================
   UPDATE PROFILE
========================================================== */

export async function updateProfile(
  userId: string,
  updates: UpdateProfilePayload,
): Promise<Profile> {
  if (updates.headline && updates.headline.trim().length > 120)
    throw new Error("Keep your headline within 120 characters.");
  if (
    updates.hourly_rate != null &&
    (!Number.isFinite(updates.hourly_rate) || updates.hourly_rate <= 0)
  )
    throw new Error("Enter an hourly rate greater than zero.");
  /* ---------------- profiles ---------------- */

  const profileUpdates: Record<string, unknown> = {};

  if ("first_name" in updates) {
    profileUpdates.first_name = updates.first_name;
  }

  if ("last_name" in updates) {
    profileUpdates.last_name = updates.last_name;
  }

  if ("avatar_url" in updates) {
    profileUpdates.avatar_url = updates.avatar_url;
  }

  if ("banner_url" in updates) {
    profileUpdates.banner_url = updates.banner_url;
  }

  if ("bio" in updates) {
    profileUpdates.bio = updates.bio;
  }

  if ("location" in updates) {
    profileUpdates.location = updates.location;
  }

  if ("display_name" in updates) {
    profileUpdates.display_name = updates.display_name;
  }

  if ("province" in updates) {
    profileUpdates.province = updates.province;
  }

  if ("city" in updates) {
    profileUpdates.city = updates.city;
  }

  if ("english_proficiency" in updates) {
    profileUpdates.english_proficiency = updates.english_proficiency;
  }

  if (Object.keys(profileUpdates).length > 0) {
    const { error } = await supabase
      .from(PROFILES_TABLE)
      .update(profileUpdates)
      .eq("user_id", userId);

    if (error) {
      throw error;
    }
  }

  /* ---------------- freelancer_profiles ---------------- */

  const freelancerUpdates: Record<string, unknown> = {};

  if ("headline" in updates) {
    freelancerUpdates.headline = updates.headline;
  }

  if ("hourly_rate" in updates) {
    freelancerUpdates.hourly_rate = updates.hourly_rate;
  }

  if (Object.keys(freelancerUpdates).length > 0) {
    const { error } = await supabase
      .from(FREELANCER_TABLE)
      .update(freelancerUpdates)
      .eq("user_id", userId);

    if (error) {
      throw error;
    }
  }

  /* ---------------- Reload Profile ---------------- */

  const profile = await getCurrentProfile(true);

  if (!profile) {
    throw new Error("Failed to reload profile.");
  }

  return profile;
}

/* ==========================================================
   AVATAR
========================================================== */

export async function uploadAvatar(
  userId: string,
  file: File,
): Promise<string> {
  const { data: profile, error: profileError } = await supabase
    .from(PROFILES_TABLE)
    .select("avatar_url")
    .eq("user_id", userId)
    .single();

  if (profileError) {
    throw profileError;
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";

  const filePath = `${userId}/avatar-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(filePath, file, {
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(filePath);

  const { error: updateError } = await supabase
    .from(PROFILES_TABLE)
    .update({
      avatar_url: data.publicUrl,
    })
    .eq("user_id", userId);

  if (updateError) {
    throw updateError;
  }

  /* ---------------- Delete Previous Avatar ---------------- */

  if (profile?.avatar_url) {
    const marker = `/storage/v1/object/public/${AVATARS_BUCKET}/`;

    const oldPath = decodeURIComponent(
      profile.avatar_url.split(marker)[1] ?? "",
    );

    if (oldPath) {
      await supabase.storage.from(AVATARS_BUCKET).remove([oldPath]);
    }
  }

  return data.publicUrl;
}

/* ==========================================================
   BANNER
========================================================== */

export async function uploadBanner(
  userId: string,
  file: File,
): Promise<string> {
  const { data: profile, error: profileError } = await supabase
    .from(PROFILES_TABLE)
    .select("banner_url")
    .eq("user_id", userId)
    .single();

  if (profileError) {
    throw profileError;
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";

  const filePath = `${userId}/banner-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(BANNERS_BUCKET)
    .upload(filePath, file);

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(BANNERS_BUCKET).getPublicUrl(filePath);

  const { error: updateError } = await supabase
    .from(PROFILES_TABLE)
    .update({
      banner_url: data.publicUrl,
    })
    .eq("user_id", userId);

  if (updateError) {
    throw updateError;
  }

  /* ---------------- Delete Previous Banner ---------------- */

  if (profile?.banner_url) {
    const marker = `/storage/v1/object/public/${BANNERS_BUCKET}/`;

    const oldPath = decodeURIComponent(
      profile.banner_url.split(marker)[1] ?? "",
    );

    if (oldPath) {
      await supabase.storage.from(BANNERS_BUCKET).remove([oldPath]);
    }
  }

  return data.publicUrl;
}

/* ==========================================================
   PORTFOLIO
========================================================== */

export async function getPortfolioProjects(
  userId: string,
): Promise<PortfolioProject[]> {
  const { data: freelancer, error: freelancerError } = await supabase
    .from(FREELANCER_TABLE)
    .select("freelancer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (freelancerError) {
    throw freelancerError;
  }

  if (!freelancer) {
    return [];
  }

  const { data, error } = await supabase
    .from(PORTFOLIO_TABLE)
    .select(
      `
      portfolio_id,
      freelancer_id,
      title,
      description,
      project_url,
      thumbnail_image_id,
      created_at
    `,
    )
    .eq("freelancer_id", freelancer.freelancer_id)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error("Failed to get portfolio:", JSON.stringify(error, null, 2));
    throw error;
  }

  return (data ?? []) as PortfolioProject[];
}

export async function addPortfolioProject(
  project: Omit<
    PortfolioProject,
    "portfolio_id" | "freelancer_id" | "created_at"
  >,
): Promise<PortfolioProject> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw authError;
  }

  if (!user) {
    throw new Error("User not authenticated.");
  }

  const { data: freelancer, error: freelancerError } = await supabase
    .from(FREELANCER_TABLE)
    .select("freelancer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (freelancerError) {
    throw freelancerError;
  }

  if (!freelancer) {
    throw new Error("Freelancer profile not found.");
  }

  const { data, error } = await supabase
    .from(PORTFOLIO_TABLE)
    .insert({
      ...project,
      freelancer_id: freelancer.freelancer_id,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as PortfolioProject;
}

export async function updatePortfolioProject(
  portfolioId: string,
  project: Pick<PortfolioProject, "title" | "description" | "project_url">,
): Promise<PortfolioProject> {
  const { data, error } = await supabase
    .from(PORTFOLIO_TABLE)
    .update(project)
    .eq("portfolio_id", portfolioId)
    .select()
    .single();
  if (error) throw error;
  return data as PortfolioProject;
}

export async function deletePortfolioProject(
  portfolioId: string,
): Promise<boolean> {
  if (!portfolioId) {
    console.error("Failed to delete portfolio: portfolioId is undefined.");

    return false;
  }

  const { data, error } = await supabase
    .from(PORTFOLIO_TABLE)
    .delete()
    .eq("portfolio_id", portfolioId)
    .select("portfolio_id");

  if (error) {
    console.error(
      "Failed to delete portfolio:",
      JSON.stringify(error, null, 2),
    );

    return false;
  }

  return data?.length === 1;
}

export async function uploadPortfolioImage(
  userId: string,
  file: File,
): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";

  const filePath = `${userId}/${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(PORTFOLIO_BUCKET)
    .upload(filePath, file);

  if (error) {
    throw error;
  }

  const { data } = supabase.storage
    .from(PORTFOLIO_BUCKET)
    .getPublicUrl(filePath);

  return data.publicUrl;
}

/* ==========================================================
   SERVICES
========================================================== */

export async function getServices(userId: string): Promise<Service[]> {
  const { data: freelancer, error: freelancerError } = await supabase
    .from(FREELANCER_TABLE)
    .select("freelancer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (freelancerError) {
    throw freelancerError;
  }

  if (!freelancer) {
    return [];
  }

  const { data: serviceRows, error: servicesError } = await supabase
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
    .eq("freelancer_id", freelancer.freelancer_id)
    .order("created_at", { ascending: false });

  if (servicesError) {
    throw servicesError;
  }

  if (!serviceRows?.length) {
    return [];
  }

  const categoryIds = [
    ...new Set(
      serviceRows
        .map((service) => service.category_id)
        .filter((categoryId): categoryId is string => Boolean(categoryId)),
    ),
  ];

  const [profileResult, categoriesResult] = await Promise.all([
    supabase
      .from(PROFILES_TABLE)
      .select("display_name, avatar_url")
      .eq("user_id", userId)
      .maybeSingle(),
    categoryIds.length
      ? supabase.from("job_categories").select("id, name").in("id", categoryIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profileResult.error) {
    throw profileResult.error;
  }

  if (categoriesResult.error) {
    throw categoriesResult.error;
  }

  const categoryNames = new Map(
    (categoriesResult.data ?? []).map((category) => [
      category.id,
      category.name,
    ]),
  );

  return serviceRows.map(
    (service): Service => ({
      id: service.service_id,
      freelancer_id: service.freelancer_id,
      category_id: service.category_id,
      title: service.title,
      description: service.description,
      price: Number(service.price),
      pricing_mode: service.pricing_mode,
      deliveryTimeDays: service.delivery_time_days,
      revisionCount: service.revisions_count,
      service_type: service.service_type,
      status: service.status,
      slug: service.slug,
      cover_image_url: service.cover_image_url,
      category: categoryNames.get(service.category_id) ?? "Category",
      display_name: profileResult.data?.display_name ?? "Freelancer",
      avatar_url: profileResult.data?.avatar_url ?? null,
      created_at: service.created_at,
      updated_at: service.updated_at,
    }),
  );
}

/* ==========================================================
   DELETE SERVICE
========================================================== */

export async function deleteService(serviceId: string): Promise<boolean> {
  if (!serviceId) {
    console.error("Failed to delete service: serviceId is undefined.");

    return false;
  }

  const { error } = await supabase
    .from(SERVICES_TABLE)
    .delete()
    .eq("service_id", serviceId);

  if (error) {
    console.error("Failed to delete service:", JSON.stringify(error, null, 2));

    return false;
  }

  return true;
}

/* ==========================================================
   REVIEWS
========================================================== */

export async function getReviews(
  userId: string,
  role?: Profile["role"],
): Promise<Review[]> {
  const [freelancer, client] = await Promise.all([
    supabase
      .from("freelancer_profiles")
      .select("freelancer_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("client_profiles")
      .select("client_id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (freelancer.error) throw new Error(freelancer.error.message);
  if (client.error) throw new Error(client.error.message);
  const asFreelancer = role ? role === "freelancer" : !!freelancer.data;
  const id = asFreelancer
    ? freelancer.data?.freelancer_id
    : client.data?.client_id;
  if (!id) return [];
  const { data, error } = await supabase
    .from(REVIEWS_TABLE)
    .select(
      `
      review_id,
      rating,
      comment,
      created_at,
      project_id,
      client_id,
      freelancer_id,
      reviewer_role
    `,
    )
    .eq(asFreelancer ? "freelancer_id" : "client_id", id)
    .eq("reviewer_role", asFreelancer ? "client" : "freelancer")
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error("Failed to get reviews:", JSON.stringify(error, null, 2));

    throw new Error(error.message);
  }

  return (data ?? []).map(
    (review): Review => ({
      review_id: review.review_id,
      rating: review.rating,
      comment: review.comment,
      created_at: review.created_at,
      project_id: review.project_id,
      client_id: review.client_id,
      freelancer_id: review.freelancer_id,
      reviewer_role: review.reviewer_role,
    }),
  );
}
