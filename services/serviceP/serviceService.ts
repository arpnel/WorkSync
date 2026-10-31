import { invalidatePageReads } from "@/lib/pageReadCache";
import { supabase } from "@/lib/supabaseClient";
import { MAX_JOB_BUDGET_PHP } from "@/lib/validation/service.creation.validation";
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

export async function updateServiceMedia(
  serviceId: string,
  files: File[],
  retainedUrls: string[],
) {
  const user = await getAuthenticatedUser();
  const { data: existing, error: loadError } = await supabase
    .from("service_media")
    .select("media_url,media_type,display_order")
    .eq("service_id", serviceId)
    .order("display_order", { ascending: true });
  if (loadError) throw loadError;

  let existingMedia = existing ?? [];
  if (existingMedia.length === 0) {
    const { data: service, error: serviceError } = await supabase
      .from("services")
      .select("cover_image_url")
      .eq("service_id", serviceId)
      .maybeSingle();
    if (serviceError) throw serviceError;
    if (service?.cover_image_url) {
      existingMedia = [
        {
          media_url: service.cover_image_url,
          media_type: /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(
            service.cover_image_url,
          )
            ? "video"
            : "image",
          display_order: 0,
        },
      ];
    }
  }

  const retained = existingMedia.filter((item) =>
    retainedUrls.includes(item.media_url),
  );
  const upload = await uploadServiceMedia(user.id, serviceId, files);
  const nextMedia = [
    ...retained.map((item, index) => ({ ...item, display_order: index })),
    ...upload.media.map((item, index) => ({
      ...item,
      display_order: retained.length + index,
    })),
  ];

  const { error: deleteError } = await supabase
    .from("service_media")
    .delete()
    .eq("service_id", serviceId);
  if (deleteError) {
    await supabase.storage
      .from(SERVICE_MEDIA_BUCKET)
      .remove(upload.uploadedPaths);
    throw deleteError;
  }

  const { error: insertError } = nextMedia.length
    ? await supabase.from("service_media").insert(
        nextMedia.map((item) => ({
          service_id: serviceId,
          media_url: item.media_url,
          media_type: item.media_type,
          display_order: item.display_order,
        })),
      )
    : { error: null };

  if (insertError) {
    await supabase
      .from("service_media")
      .insert(
        existingMedia.map((item) => ({ service_id: serviceId, ...item })),
      );
    await supabase.storage
      .from(SERVICE_MEDIA_BUCKET)
      .remove(upload.uploadedPaths);
    throw insertError;
  }

  const { error: coverError } = await supabase
    .from("services")
    .update({ cover_image_url: nextMedia[0]?.media_url ?? null })
    .eq("service_id", serviceId);
  if (coverError) throw coverError;
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
      service_id: crypto.randomUUID(),
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
        throw new Error(
          `Unable to attach skills to this service: ${error.message}`,
        );
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
        throw new Error(
          `Unable to attach media to this service: ${mediaError.message}`,
        );
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

    await Promise.all([
      supabase
        .from("service_media")
        .delete()
        .eq("service_id", service.service_id),
      supabase
        .from("service_milestones")
        .delete()
        .eq("service_id", service.service_id),
      supabase
        .from("service_skills")
        .delete()
        .eq("service_id", service.service_id),
    ]);

    const cleanup = await supabase
      .from("services")
      .delete()
      .eq("service_id", service.service_id);
    if (cleanup.error) {
      console.error("Failed to roll back service listing:", cleanup.error);
    }

    throw error;
  }
}

async function createClientJob(
  userId: string,
  payload: CreateListingPayload,
): Promise<CreateListingResult> {
  if (
    !Number.isFinite(payload.budget_max) ||
    payload.budget_max! <= 0 ||
    payload.budget_max! > MAX_JOB_BUDGET_PHP
  ) {
    throw new Error(
      "Budget must be greater than 0 and no more than PHP 100,000.",
    );
  }

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
      job_id: crypto.randomUUID(),
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
        throw new Error(
          `Unable to attach skills to this job: ${error.message}`,
        );
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

async function createListingUncached(
  payload: CreateListingPayload,
): Promise<CreateListingResult> {
  const user = await getAuthenticatedUser();
  const role = await getCurrentListingRole();

  if (role === "freelancer") {
    return createFreelancerService(user.id, payload);
  }

  return createClientJob(user.id, payload);
}

export async function queueListingForModeration(
  listingType: CreateListingResult["listingType"],
  id: string,
) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session)
    throw new Error(
      "Your listing was saved but could not be submitted for moderation. Contact support before retrying.",
    );
  const queued = await fetch("/api/listings/moderate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionData.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: listingType, id }),
  });
  const queueResult = (await queued.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (!queued.ok)
    throw new Error(
      queueResult?.error ??
        "Your listing was saved but could not be submitted for review.",
    );
  invalidatePageReads();
}

export async function createListing(
  ...args: Parameters<typeof createListingUncached>
) {
  const result = await createListingUncached(...args);
  await queueListingForModeration(result.listingType, result.id);
  return result;
}
export const createService = createListing;
