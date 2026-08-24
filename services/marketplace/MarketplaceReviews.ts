import { supabase } from "@/lib/supabaseClient";

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
  profiles:
    | {
        display_name: string | null;
        avatar_url: string | null;
      }
    | {
        display_name: string | null;
        avatar_url: string | null;
      }[]
    | null;
}

export async function getMarketplaceReviews(
  freelancerId: string,
): Promise<MarketplaceReview[]> {
  if (!freelancerId) {
    return [];
  }

  try {
    /*
     * Get reviews belonging to projects
     * handled by this freelancer.
     */
    const { data: reviews, error: reviewsError } =
      await supabase
        .from("reviews")
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
        .eq("reviewer_role", "client")
        .order("created_at", {
          ascending: false,
        });

    if (reviewsError) {
      

      throw reviewsError;
    }

    if (!reviews || reviews.length === 0) {
      return [];
    }

    /*
     * Get the client profiles belonging
     * to the reviewers.
     */
    const clientIds = [
      ...new Set(
        reviews.map((review) => review.client_id),
      ),
    ];

    const { data: clientProfiles, error: clientsError } =
      await supabase
        .from("client_profiles")
        .select(
          `
            client_id,
            user_id,
            profiles (
              display_name,
              avatar_url
            )
          `,
        )
        .in("client_id", clientIds);

    if (clientsError) {
      

      throw clientsError;
    }

    const clients =
      (clientProfiles as ClientProfileRow[] | null) ?? [];

    return reviews.map((review) => {
      const client = clients.find(
        (profile) =>
          profile.client_id === review.client_id,
      );

      let displayName = "Client";
      let avatarUrl: string | null = null;

      if (client?.profiles) {
        const profile = Array.isArray(client.profiles)
          ? client.profiles[0]
          : client.profiles;

        if (profile) {
          displayName =
            profile.display_name?.trim() || "Client";

          avatarUrl = profile.avatar_url ?? null;
        }
      }

      return {
        ...review,
        rating: Number(review.rating),
        client: {
          display_name: displayName,
          avatar_url: avatarUrl,
        },
      };
    });
  } catch (error) {
   

    throw error;
  }
}