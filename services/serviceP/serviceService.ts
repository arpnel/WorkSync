import { supabase } from "@/lib/supabaseClient";
import type {
  CreateListingPayload,
  CreateListingResult,
  ListingRole,
} from "./service.types";

const SERVICE_MEDIA_BUCKET = "service-media";

async function getAuthenticatedUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error("You must be logged in.");
  }

  return user;
}

export async function getCurrentListingRole(): Promise<ListingRole> {
  const user = await getAuthenticatedUser();
  const { data, error } = await supabase
    .from("Users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data?.role !== "client" && data?.role !== "freelancer") {
    throw new Error("Your account role cannot create a listing.");
  }

  return data.role;
}

async function uploadServiceMedia(
  userId: string,
  serviceId: string,
  files: File[],
) {
  const uploadedPaths: string[] = [];
  const media: Array<{
    media_url: string;
    media_type: string;
    display_order: number;
  }> = [];

  try {
    for (const [index, file] of files.entries()) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${userId}/${serviceId}/${crypto.randomUUID()}-${safeName}`;
      const { error } = await supabase.storage
        .from(SERVICE_MEDIA_BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        throw error;
      }

      uploadedPaths.push(path);

      const { data } = supabase.storage
        .from(SERVICE_MEDIA_BUCKET)
        .getPublicUrl(path);

      media.push({
        media_url: data.publicUrl,
        media_type: file.type.startsWith("video/") ? "video" : "image",
        display_order: index,
      });
    }

    return { media, uploadedPaths };
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await supabase.storage.from(SERVICE_MEDIA_BUCKET).remove(uploadedPaths);
    }

    throw error;
  }
}

async function createFreelancerService(
  userId: string,
  payload: CreateListingPayload,
): Promise<CreateListingResult> {
  const { data: freelancer, error: freelancerError } = await supabase
    .from("freelancer_profiles")
    .select("freelancer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (freelancerError) {
    throw freelancerError;
  }

  if (!freelancer) {
    throw new Error(
      "Complete your freelancer profile before posting a service.",
    );
  }

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .insert({
      freelancer_id: freelancer.freelancer_id,
      category_id: payload.category_id,
      title: payload.title.trim(),
      description: payload.description.trim(),
      price: payload.price,
      pricing_mode: payload.pricing_type ?? "fixed",
      delivery_time_days: payload.delivery_time_days,
      revisions_count: payload.revisions_count,
      service_type: payload.service_type ?? "standard",
      status: "Active",
    })
    .select("service_id")
    .single();

  if (serviceError) {
    throw serviceError;
  }

  const uploadedPaths: string[] = [];

  try {
    if (payload.skill_ids.length > 0) {
      const { error } = await supabase.from("service_skills").insert(
        payload.skill_ids.map((skillId) => ({
          service_id: service.service_id,
          skill_id: skillId,
        })),
      );

      if (error) {
        throw error;
      }
    }

    const files = payload.media_files ?? [];

    if (files.length > 0) {
      const upload = await uploadServiceMedia(
        userId,
        service.service_id,
        files,
      );
      uploadedPaths.push(...upload.uploadedPaths);

      const { error: mediaError } = await supabase.from("service_media").insert(
        upload.media.map((item) => ({
          service_id: service.service_id,
          ...item,
        })),
      );

      if (mediaError) {
        throw mediaError;
      }

      const { error: coverError } = await supabase
        .from("services")
        .update({ cover_image_url: upload.media[0]?.media_url ?? null })
        .eq("service_id", service.service_id);

      if (coverError) {
        throw coverError;
      }
    }

    if (
      payload.service_type === "milestone" &&
      payload.milestone_templates?.length
    ) {
      const { error } = await supabase.from("service_milestones").insert(
        payload.milestone_templates.map((milestone) => ({
          service_id: service.service_id,
          title: milestone.title,
          description: milestone.description ?? null,
          amount: milestone.amount,
          display_order: milestone.display_order,
        })),
      );

      if (error) {
        throw error;
      }
    }

    return {
      listingType: "service",
      id: service.service_id,
    };
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await supabase.storage.from(SERVICE_MEDIA_BUCKET).remove(uploadedPaths);
    }

    await supabase
      .from("services")
      .delete()
      .eq("service_id", service.service_id);

    throw error;
  }
}

async function createClientJob(
  userId: string,
  payload: CreateListingPayload,
): Promise<CreateListingResult> {
  const { data: client, error: clientError } = await supabase
    .from("client_profiles")
    .select("client_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (clientError) {
    throw clientError;
  }

  if (!client) {
    throw new Error("Complete your client profile before posting a job.");
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      client_id: client.client_id,
      category_id: payload.category_id,
      title: payload.title.trim(),
      description: payload.description.trim(),
      budget_min: payload.budget_min,
      budget_max: payload.budget_max,
      pricing_type: payload.pricing_type ?? "fixed",
      deadline: payload.deadline || null,
      experience_level: payload.experience_level ?? "intermediate",
      status: "open",
    })
    .select("job_id")
    .single();

  if (jobError) {
    throw jobError;
  }

  try {
    if (payload.skill_ids.length > 0) {
      const { error } = await supabase.from("job_skills").insert(
        payload.skill_ids.map((skillId) => ({
          job_id: job.job_id,
          skill_id: skillId,
        })),
      );

      if (error) {
        throw error;
      }
    }

    return {
      listingType: "job",
      id: job.job_id,
    };
  } catch (error) {
    await supabase.from("jobs").delete().eq("job_id", job.job_id);
    throw error;
  }
}

export async function createListing(
  payload: CreateListingPayload,
): Promise<CreateListingResult> {
  const user = await getAuthenticatedUser();
  const role = await getCurrentListingRole();

  if (role === "freelancer") {
    return createFreelancerService(user.id, payload);
  }

  return createClientJob(user.id, payload);
}

export const createService = createListing;
