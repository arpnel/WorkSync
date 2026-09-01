import type { ServiceFormValues } from "./service-form.types";
import type {
  CreateListingPayload,
  ListingRole,
} from "@/services/serviceP/service.types";

export type ServiceCreatePayload = CreateListingPayload;

export function mapFormValuesToCreatePayload(
  values: ServiceFormValues,
  role: ListingRole = "freelancer",
): CreateListingPayload {
  const base = {
    title: values.title.trim(),
    description: values.description.trim(),
    category_id: values.categoryId,
    skill_ids: values.skillIds,
    pricing_type: values.pricingType,
  };

  if (role === "client") {
    return {
      ...base,
      budget_min: values.budgetMin,
      budget_max: values.budgetMax,
      deadline: values.deadline,
    };
  }

  return {
    ...base,
    price: values.price,
    service_type: values.serviceType,
    delivery_time_days: values.deliveryTimeDays,
    revisions_count: values.revisionCount,
    media_files: values.mediaFiles,
    milestone_templates:
      values.serviceType === "milestone"
        ? values.milestones.map((milestone, index) => ({
            title: milestone.title.trim(),
            description: milestone.description.trim() || undefined,
            amount: milestone.amount,
            display_order: index + 1,
          }))
        : undefined,
  };
}
