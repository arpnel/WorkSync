import type { ServiceFormValues } from "./service-form.types";

export type ServiceCreatePayload = {
  name: string;

  description: string;

  price: number;

  category_id: string;

  service_type: "standard" | "milestone";

  delivery_time_days: number;

  revisions_count: number;

  // Main thumbnail (first uploaded media)
  image_url?: string;

  // Temporary field used for inserting into service_skills
  skill_ids: string[];

  // Temporary field used for inserting service_media
  media_urls: string[];

  // Temporary field used for inserting service_milestones
  milestone_templates?: {
    title: string;
    description?: string;
    amount: number;
    display_order: number;
  }[];
};

export function mapFormValuesToCreatePayload(
  values: ServiceFormValues,
): ServiceCreatePayload {
  return {
    name: values.title.trim(),

    description: values.description.trim(),

    price: values.price ?? 0,

    category_id: values.categoryId,

    service_type: values.serviceType,

    delivery_time_days: values.deliveryTimeDays,

    revisions_count: values.revisionCount,

    // First media becomes the service thumbnail
    image_url: values.mediaUrls?.[0] || undefined,

    // All uploaded media
    media_urls: values.mediaUrls ?? [],

    // Selected skills
    skill_ids: values.skillIds,

    // Only included for milestone services
    milestone_templates:
      values.serviceType === "milestone"
        ? values.milestones.map((m) => ({
            title: m.title.trim(),
            description: m.description?.trim(),
            amount: m.amount,
            display_order: m.displayOrder,
          }))
        : undefined,
  };
}
