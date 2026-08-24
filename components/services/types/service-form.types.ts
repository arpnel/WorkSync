export type ServiceType = "standard" | "milestone";

export type ServiceMilestoneForm = {
  title: string;
  description: string;
  amount: number;
  displayOrder: number;
};

export type ServiceFormValues = {
  // Basic Information
  title: string;

  // Selected job category
  categoryId: string;
  categoryText: string;

  // Description
  description: string;

  // Total service/project price
  price?: number;

  // Service Type
  serviceType: ServiceType;

  // Service Delivery
  // Number of days needed to complete the service
  deliveryTimeDays: number;

  // Revisions
  // 0 = no revisions
  // 1+ = number of revisions
  revisionCount: number;

  // Skills
  // Selected skills from category_skills
  // Inserted into service_skills after service creation
  skillIds: string[];

  // Service Milestones
  // Used only when serviceType === "milestone"
  milestones: ServiceMilestoneForm[];

  // Media
  mediaFiles: File[];
  mediaUrls: string[];
};