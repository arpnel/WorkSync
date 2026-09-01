import type { ServiceFormValues } from "@/components/services/types/service-form.types";
import type { ListingRole } from "@/services/serviceP/service.types";

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: Partial<Record<keyof T, string>> };

export function validateListingCreationValues(
  values: ServiceFormValues,
  role: ListingRole,
): ValidationResult<ServiceFormValues> {
  const errors: Partial<Record<keyof ServiceFormValues, string>> = {};
  const title = values.title.trim();
  const categoryId = values.categoryId.trim();
  const description = values.description.trim();
  const skillIds = values.skillIds ?? [];
  const mediaFiles = values.mediaFiles ?? [];

  if (!title) {
    errors.title = "Title is required.";
  } else if (title.length < 3) {
    errors.title = "Title must be at least 3 characters.";
  } else if (title.length > 120) {
    errors.title = "Title must be at most 120 characters.";
  }

  if (!categoryId) {
    errors.categoryId = "Category is required.";
  }

  if (!description) {
    errors.description = "Description is required.";
  } else if (description.length < 20) {
    errors.description = "Description must be at least 20 characters.";
  } else if (description.length > 2000) {
    errors.description = "Description must be at most 2000 characters.";
  }

  if (skillIds.length < 1) {
    errors.skillIds = "Select at least one skill.";
  } else if (skillIds.length > 12) {
    errors.skillIds = "Select up to 12 skills.";
  }

  if (role === "freelancer") {
    if (
      values.price === undefined ||
      !Number.isFinite(values.price) ||
      values.price <= 0
    ) {
      errors.price = "Price must be greater than 0.";
    }

    if (
      !Number.isFinite(values.deliveryTimeDays) ||
      values.deliveryTimeDays <= 0
    ) {
      errors.deliveryTimeDays = "Duration must be greater than 0.";
    }

    if (!Number.isFinite(values.revisionCount) || values.revisionCount < 0) {
      errors.revisionCount = "Revision count cannot be negative.";
    }
  } else {
    if (
      values.budgetMax === undefined ||
      !Number.isFinite(values.budgetMax) ||
      values.budgetMax <= 0
    ) {
      errors.budgetMax = "Maximum budget must be greater than 0.";
    }

    if (
      !["beginner", "intermediate", "expert"].includes(values.experienceLevel)
    ) {
      errors.experienceLevel = "Select an expected expertise level.";
    }

    if (!values.deadline) {
      errors.deadline = "Deadline is required.";
    } else {
      const deadline = new Date(`${values.deadline}T23:59:59`);

      if (Number.isNaN(deadline.getTime()) || deadline <= new Date()) {
        errors.deadline = "Deadline must be in the future.";
      }
    }
  }

  if (mediaFiles.length > 10) {
    errors.mediaFiles = "You can upload up to 10 media files.";
  }

  for (const file of mediaFiles) {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      errors.mediaFiles = "Only images and videos are allowed.";
    }

    if (file.size > 50 * 1024 * 1024) {
      errors.mediaFiles = "Each file must be smaller than 50MB.";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      ...values,
      title,
      categoryId,
      description,
      skillIds,
      mediaFiles,
    },
  };
}

export const validateServiceCreationValues = validateListingCreationValues;
