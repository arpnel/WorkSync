import type {
  ExperienceLevel,
  PricingType,
  ServiceType,
} from "@/services/serviceP/service.types";

export type ServiceMilestoneForm = {
  title: string;
  description: string;
  amount: number;
  displayOrder: number;
};

export type ServiceFormValues = {
  title: string;
  categoryId: string;
  categoryText: string;
  description: string;

  price?: number;
  serviceType: ServiceType;
  deliveryTimeDays: number;
  revisionCount: number;

  budgetMin?: number;
  budgetMax?: number;
  pricingType: PricingType;
  deadline: string;
  experienceLevel: ExperienceLevel;

  skillIds: string[];
  milestones: ServiceMilestoneForm[];
  mediaFiles: File[];
  mediaUrls: string[];
};
