export type ListingRole = "client" | "freelancer";
export type ServiceType = "standard" | "milestone";
export type PricingType = "fixed";
export type ExperienceLevel = "beginner" | "intermediate" | "expert";

export interface MilestoneTemplate {
  title: string;
  description?: string;
  amount: number;
  display_order: number;
}

export interface CreateListingPayload {
  title: string;
  description: string;
  category_id: string;
  skill_ids: string[];

  price?: number;
  service_type?: ServiceType;
  delivery_time_days?: number;
  revisions_count?: number;
  media_files?: File[];
  milestone_templates?: MilestoneTemplate[];

  budget_min?: number;
  budget_max?: number;
  pricing_type?: PricingType;
  deadline?: string;
  experience_level?: ExperienceLevel;
}

export interface CreateListingResult {
  listingType: "service" | "job";
  id: string;
}
