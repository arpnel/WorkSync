import { supabase } from "@/lib/supabaseClient";

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

export async function getCurrentProfile(): Promise<Profile | null> {
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

  const { data: userData, error: userError } = await supabase
    .from(USERS_TABLE)
    .select(
      `
      user_id,
      email,
      role,
      created_at
    `,
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (userError) {
    throw userError;
  }

  if (!userData) {
    throw new Error("User record not found.");
  }

  /* ---------------- Profiles ---------------- */

  const { data: profileData, error: profileError } = await supabase
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
    .maybeSingle();

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
    location: profileData.location,

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
    }
  }

  return profile;
}

/* ==========================================================
   UPDATE PROFILE
========================================================== */

export async function updateProfile(
  userId: string,
  updates: UpdateProfilePayload,
): Promise<Profile> {
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

  const profile = await getCurrentProfile();

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

    return [];
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

export async function deletePortfolioProject(
  portfolioId: string,
): Promise<boolean> {
  if (!portfolioId) {
    console.error("Failed to delete portfolio: portfolioId is undefined.");

    return false;
  }

  const { error } = await supabase
    .from(PORTFOLIO_TABLE)
    .delete()
    .eq("portfolio_id", portfolioId);

  if (error) {
    console.error(
      "Failed to delete portfolio:",
      JSON.stringify(error, null, 2),
    );

    return false;
  }

  return true;
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

export async function getReviews(freelancerId: string): Promise<Review[]> {
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
    .eq("freelancer_id", freelancerId)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error("Failed to get reviews:", JSON.stringify(error, null, 2));

    return [];
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
