export type ServiceType = "standard" | "milestone";

export interface MilestoneTemplate {
  title: string;
  description?: string;
  amount: number;
  display_order: number;
}

export interface CreateServicePayload {
  title: string;

  description: string;

  category_id: string;

  price: number;

  service_type: ServiceType;

  delivery_time_days: number;

  revisions_count: number;

  skill_ids: string[];

  media_files: File[];

  milestone_templates?: MilestoneTemplate[];
}