import { supabase } from "@/lib/supabaseClient";
import type { CreateServicePayload } from "./service.types";

function generateSlug(title: string) {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-") +
    "-" +
    crypto.randomUUID().slice(0, 8)
  );
}

export async function createService(payload: CreateServicePayload) {
  try {
    // ==========================================================
    // 1. Get Authenticated User
    // ==========================================================

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error("User not authenticated.");
    }

    // ==========================================================
    // 2. Get Current Account Role
    // ==========================================================

    const { data: userData, error: userError } = await supabase
      .from("Users")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (userError) {
      console.error("User role fetch error:", userError);
      throw userError;
    }

    if (!userData) {
      throw new Error("User account not found.");
    }

    // ==========================================================
    // 3. Get Profile ID Based On Current Role
    // ==========================================================

    let freelancerId: string | null = null;
    let clientId: string | null = null;

    if (userData.role === "freelancer") {
      const { data: freelancer, error: freelancerError } =
        await supabase
          .from("freelancer_profiles")
          .select("freelancer_id")
          .eq("user_id", user.id)
          .single();

      if (freelancerError) {
        console.error(
          "Freelancer profile fetch error:",
          freelancerError,
        );
        throw freelancerError;
      }

      if (!freelancer) {
        throw new Error("Freelancer profile not found.");
      }

      freelancerId = freelancer.freelancer_id;
    } else if (userData.role === "client") {
      const { data: client, error: clientError } = await supabase
        .from("client_profiles")
        .select("client_id")
        .eq("user_id", user.id)
        .single();

      if (clientError) {
        console.error("Client profile fetch error:", clientError);
        throw clientError;
      }

      if (!client) {
        throw new Error("Client profile not found.");
      }

      clientId = client.client_id;
    } else {
      throw new Error("Invalid user role.");
    }

    // ==========================================================
    // 4. Determine Listing Type
    // ==========================================================

    const listingType =
      userData.role === "freelancer"
        ? "service"
        : "job";

    // ==========================================================
    // 5. Create Marketplace Listing
    // ==========================================================

    const slug = generateSlug(payload.title);

    const { data: service, error: serviceError } = await supabase
      .from("marketplace_listings")
      .insert({
        freelancer_id: freelancerId,
        client_id: clientId,

        title: payload.title,
        description: payload.description,

        price: payload.price,
        delivery_time_days: payload.delivery_time_days,
        revisions_count: payload.revisions_count,

        category_id: payload.category_id,
        service_type: payload.service_type,

        listing_type: listingType,

        cover_image_url: null,

        slug,
      })
      .select("service_id")
      .single();

    if (serviceError) {
      console.log("Auth user ID:", user.id);
      console.log("Current role:", userData.role);
      console.log("Freelancer ID:", freelancerId);
      console.log("Client ID:", clientId);
      console.log("Listing type:", listingType);

      console.error(
        "Marketplace listing creation error:",
        JSON.stringify(serviceError, null, 2),
      );

      throw serviceError;
    }

    if (!service) {
      throw new Error("Failed to create marketplace listing.");
    }

    const serviceId = service.service_id;

    // ==========================================================
    // 6. Upload Media
    // ==========================================================

    const mediaUrls: string[] = [];

    for (const file of payload.media_files) {
      const fileName = `${crypto.randomUUID()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("service-media")
        .upload(fileName, file);

      if (uploadError) {
        console.error(
          "Service media upload error:",
          uploadError,
        );
        throw uploadError;
      }

      const { data } = supabase.storage
        .from("service-media")
        .getPublicUrl(fileName);

      mediaUrls.push(data.publicUrl);
    }

    // ==========================================================
    // 7. Update Cover Image
    // ==========================================================

    if (mediaUrls.length > 0) {
      const { error: coverError } = await supabase
        .from("marketplace_listings")
        .update({
          cover_image_url: mediaUrls[0],
        })
        .eq("service_id", serviceId);

      if (coverError) {
        console.error(
          "Cover image update error:",
          coverError,
        );
        throw coverError;
      }
    }

    // ==========================================================
    // 8. Insert Service Skills
    // ==========================================================

    if (payload.skill_ids.length > 0) {
      const skillRows = payload.skill_ids.map((skillId) => ({
        service_id: serviceId,
        skill_id: skillId,
      }));

      const { error: skillsError } = await supabase
        .from("service_skills")
        .insert(skillRows);

      if (skillsError) {
        console.error(
          "Service skills insertion error:",
          skillsError,
        );
        throw skillsError;
      }
    }

    // ==========================================================
    // 9. Insert Service Media Records
    // ==========================================================

    if (mediaUrls.length > 0) {
      const mediaRows = mediaUrls.map((url, index) => ({
        service_id: serviceId,

        media_url: url,

        media_type: payload.media_files[index].type.startsWith(
          "video",
        )
          ? "video"
          : "image",

        display_order: index,
      }));

      const { error: mediaError } = await supabase
        .from("service_media")
        .insert(mediaRows);

      if (mediaError) {
        console.error(
          "Service media insertion error:",
          mediaError,
        );
        throw mediaError;
      }
    }

    // ==========================================================
    // 10. Insert Service Milestones
    // ==========================================================

    if (
      payload.service_type === "milestone" &&
      payload.milestone_templates &&
      payload.milestone_templates.length > 0
    ) {
      const milestoneRows =
        payload.milestone_templates.map((milestone) => ({
          service_id: serviceId,

          title: milestone.title,

          description: milestone.description ?? null,

          amount: milestone.amount,

          display_order: milestone.display_order,
        }));

      const { error: milestoneError } = await supabase
        .from("service_milestones")
        .insert(milestoneRows);

      if (milestoneError) {
        console.error(
          "Service milestones insertion error:",
          milestoneError,
        );
        throw milestoneError;
      }
    }

    // ==========================================================
    // 11. Return Listing ID
    // ==========================================================

    return serviceId;
  } catch (error) {
    console.error("Failed to create service:", error);
    throw error;
  }
}