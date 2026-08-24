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
const SERVICES_TABLE = "marketplace_listings";
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

  if (authError || !user) {
    throw new Error("User not authenticated.");
  }

  /* ---------------- Users ---------------- */

  const { data: userData, error: userError } = await supabase
    .from(USERS_TABLE)
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (userError) {
    throw userError;
  }

  if (!userData) {
    throw new Error("User record not found.");
  }

  /* ---------------- Profile ---------------- */

  const { data: profileData, error: profileError } = await supabase
    .from(PROFILES_TABLE)
    .select("*")
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
    user_id: userData.user_id,

    // Names belong to profiles, not Users
    first_name: profileData.first_name,
    last_name: profileData.last_name,

    email: userData.email,
    role: userData.role,

    avatar_url: profileData.avatar_url,
    bio: profileData.bio,
    location: profileData.location,

    display_name: profileData.display_name,
    headline: null,
    banner_url: profileData.banner_url,
    hourly_rate: null,
    verification_status: null,

    rating: null,
    reviews_count: 0,
    projects_completed: 0,
    total_earnings: null,

    created_at: profileData.created_at,
    updated_at: profileData.updated_at,
  };

  /* ---------------- Freelancer Profile ---------------- */

  if (userData.role === "freelancer") {
    const { data: freelancerData, error: freelancerError } =
      await supabase
        .from(FREELANCER_TABLE)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

    if (freelancerError) {
      throw freelancerError;
    }

    if (freelancerData) {
      profile.headline = freelancerData.headline;
      profile.hourly_rate = freelancerData.hourly_rate;
      profile.verification_status =
        freelancerData.verification_status;
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
  /* ---------------- Update common profile ---------------- */

  const profileUpdates: Record<string, unknown> = {};

  if ("first_name" in updates) {
    profileUpdates.first_name = updates.first_name;
  }

  if ("last_name" in updates) {
    profileUpdates.last_name = updates.last_name;
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

  if (Object.keys(profileUpdates).length > 0) {
    const { error } = await supabase
      .from(PROFILES_TABLE)
      .update(profileUpdates)
      .eq("user_id", userId);

    if (error) {
      throw error;
    }
  }

  /* ---------------- Update freelancer profile ---------------- */

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

  const extension = file.name.split(".").pop();

  const filePath = `${userId}/avatar-${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(filePath, file, {
      upsert: true,
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage
    .from(AVATARS_BUCKET)
    .getPublicUrl(filePath);

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
    const oldPath = decodeURIComponent(
      profile.avatar_url.split(
        `/storage/v1/object/public/${AVATARS_BUCKET}/`,
      )[1] ?? "",
    );

    if (oldPath) {
      await supabase.storage
        .from(AVATARS_BUCKET)
        .remove([oldPath]);
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

  const extension = file.name.split(".").pop();

  const filePath = `${userId}/banner-${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(BANNERS_BUCKET)
    .upload(filePath, file);

  if (error) {
    throw error;
  }

  const { data } = supabase.storage
    .from(BANNERS_BUCKET)
    .getPublicUrl(filePath);

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
    const oldPath = decodeURIComponent(
      profile.banner_url.split(
        `/storage/v1/object/public/${BANNERS_BUCKET}/`,
      )[1] ?? "",
    );

    if (oldPath) {
      await supabase.storage
        .from(BANNERS_BUCKET)
        .remove([oldPath]);
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
  const { data: freelancer, error: freelancerError } =
    await supabase
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
    .select("*")
    .eq("freelancer_id", freelancer.freelancer_id)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error("Failed to get portfolio:", error);
    return [];
  }

  return data as PortfolioProject[];
}

export async function addPortfolioProject(
  project: Omit<
    PortfolioProject,
    "id" | "freelancer_id" | "created_at"
  >,
): Promise<PortfolioProject> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  const { data: freelancer, error: freelancerError } =
    await supabase
      .from(FREELANCER_TABLE)
      .select("freelancer_id")
      .eq("user_id", user.id)
      .single();

  if (freelancerError) {
    throw freelancerError;
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
  projectId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from(PORTFOLIO_TABLE)
    .delete()
    .eq("portfolio_id", projectId);

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
  const extension = file.name.split(".").pop();

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

export async function getServices(
  userId: string,
): Promise<Service[]> {
  const { data: freelancer, error: freelancerError } =
    await supabase
      .from(FREELANCER_TABLE)
      .select("freelancer_id")
      .eq("user_id", userId)
      .maybeSingle();

  if (freelancerError) {
    console.error("Failed to get freelancer:", freelancerError);
    return [];
  }

  if (!freelancer) {
    return [];
  }

  const { data, error } = await supabase
    .from(SERVICES_TABLE)
    .select(`
      *,
      job_categories (
        name
      )
    `)
    .eq("listing_type", "service")
    .eq("freelancer_id", freelancer.freelancer_id)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error("Failed to get services:", error);
    return [];
  }

  const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("display_name, avatar_url")
  .eq("user_id", userId)
  .maybeSingle();

  console.log("========== RAW SERVICES ==========");
  console.log(data);

  return data.map((service: any) => {
    console.log("========== SERVICE ==========");
    console.log("Full service:", service);
    console.log("service_id:", service.service_id);
    console.log("listing_id:", service.listing_id);

    return {
      id: service.service_id,
      title: service.title,
      description: service.description,
      price: service.price,
      deliveryTimeDays: service.delivery_time_days,
      revisionCount: service.revisions_count,
      service_type: service.service_type,
      cover_image_url: service.cover_image_url,
      category: service.job_categories?.name ?? "Category",
      display_name: profile?.display_name ?? "Freelancer",
      avatar_url: profile?.avatar_url ?? null,
      created_at: service.created_at,
    };
  }) as Service[];
}
/* ==========================================================
   DELETE SERVICE
========================================================== */

export async function deleteService(
  serviceId: string,
): Promise<boolean> {
  if (!serviceId) {
    console.error("Failed to delete service: serviceId is undefined.");
    return false;
  }

  const { error } = await supabase
    .from(SERVICES_TABLE)
    .delete()
    .eq("service_id", serviceId)
    .eq("listing_type", "service");

  if (error) {
    console.error(
      "Failed to delete service:",
      JSON.stringify(error, null, 2),
    );

    return false;
  }

  return true;
}

/* ==========================================================
   REVIEWS
========================================================== */

export async function getReviews(
  freelancerId: string,
): Promise<Review[]> {
  const { data, error } = await supabase
    .from(REVIEWS_TABLE)
    .select("*")
    .eq("freelancer_id", freelancerId)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error(
      "Failed to get reviews:",
      JSON.stringify(error, null, 2),
    );

    return [];
  }

  return data as Review[];
}