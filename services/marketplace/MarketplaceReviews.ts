import { supabase } from "@/lib/supabaseClient";

/* ==========================================================
   TYPES
========================================================== */

export interface MarketplaceReview {
  review_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  project_id: string;
  client_id: string;
  freelancer_id: string;
  reviewer_role: string;

  client: {
    display_name: string;
    avatar_url: string | null;
  };
}

interface ClientProfileRow {
  client_id: string;
  user_id: string;
}

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

/* ==========================================================
   GET MARKETPLACE REVIEWS
========================================================== */

export async function getMarketplaceReviews(
  freelancerId: string,
): Promise<MarketplaceReview[]> {
  if (!freelancerId) {
    return [];
  }

  /* ========================================================
     1. GET REVIEWS

     reviews:
     PK review_id

     FK:
     project_id -> projects.project_id
     client_id -> client_profiles.client_id
     freelancer_id -> freelancer_profiles.freelancer_id
  ======================================================== */

  const {
    data: reviews,
    error: reviewsError,
  } = await supabase
    .from("reviews")
    .select(`
      review_id,
      rating,
      comment,
      created_at,
      project_id,
      client_id,
      freelancer_id,
      reviewer_role
    `)
    .eq("freelancer_id", freelancerId)
    .eq("reviewer_role", "client")
    .order("created_at", {
      ascending: false,
    });

  if (reviewsError) {
    console.error(
      "Failed to fetch marketplace reviews:",
      reviewsError,
    );

    throw reviewsError;
  }

  if (!reviews || reviews.length === 0) {
    return [];
  }

  /* ========================================================
     2. GET CLIENT PROFILE IDs

     client_profiles:
     PK client_id
     FK user_id -> Users.user_id
  ======================================================== */

  const clientIds = [
    ...new Set(
      reviews.map((review) => review.client_id),
    ),
  ];

  const {
    data: clientProfiles,
    error: clientsError,
  } = await supabase
    .from("client_profiles")
    .select(`
      client_id,
      user_id
    `)
    .in("client_id", clientIds);

  if (clientsError) {
    console.error(
      "Failed to fetch client profiles:",
      clientsError,
    );

    throw clientsError;
  }

  const clients =
    (clientProfiles as ClientProfileRow[] | null) ?? [];

  if (clients.length === 0) {
    return reviews.map((review) => ({
      ...review,
      rating: Number(review.rating),
      client: {
        display_name: "Client",
        avatar_url: null,
      },
    }));
  }

  /* ========================================================
     3. GET ACTUAL PROFILES

     profiles:
     PK user_id
     FK user_id -> Users.user_id
  ======================================================== */

  const userIds = [
    ...new Set(
      clients.map((client) => client.user_id),
    ),
  ];

  const {
    data: profiles,
    error: profilesError,
  } = await supabase
    .from("profiles")
    .select(`
      user_id,
      display_name,
      avatar_url
    `)
    .in("user_id", userIds);

  if (profilesError) {
    console.error(
      "Failed to fetch reviewer profiles:",
      profilesError,
    );

    throw profilesError;
  }

  const profileRows =
    (profiles as ProfileRow[] | null) ?? [];

  /* ========================================================
     4. COMBINE REVIEW + CLIENT + PROFILE
  ======================================================== */

  return reviews.map((review) => {
    const client = clients.find(
      (item) =>
        item.client_id === review.client_id,
    );

    const profile = client
      ? profileRows.find(
          (item) =>
            item.user_id === client.user_id,
        )
      : undefined;

    return {
      ...review,

      rating: Number(review.rating),

      client: {
        display_name:
          profile?.display_name?.trim() || "Client",

        avatar_url:
          profile?.avatar_url ?? null,
      },
    };
  });
}

