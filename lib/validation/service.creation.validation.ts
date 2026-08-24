import type { ServiceFormValues } from "@/components/services/types/service-form.types";

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: Partial<Record<keyof T, string>> };

export function validateServiceCreationValues(
  values: ServiceFormValues,
): ValidationResult<ServiceFormValues> {
  const errors: Partial<Record<keyof ServiceFormValues, string>> = {};

  const title = values.title.trim();

  if (!title) {
    errors.title = "Title is required";
  } else if (title.length < 3) {
    errors.title = "Title must be at least 3 characters";
  } else if (title.length > 120) {
    errors.title = "Title must be at most 120 characters";
  }

  const categoryId = values.categoryId.trim();

  if (!categoryId) {
    errors.categoryId = "Category is required";
  }

  const description = values.description.trim();

  if (!description) {
    errors.description = "Description is required";
  } else if (description.length < 20) {
    errors.description = "Description must be at least 20 characters";
  } else if (description.length > 2000) {
    errors.description = "Description must be at most 2000 characters";
  }

  if (!values.serviceType) {
    errors.serviceType = "Service type is required";
  }

  if (
    values.price === undefined ||
    !Number.isFinite(values.price) ||
    values.price <= 0
  ) {
    errors.price = "Price must be greater than 0";
  }

  if (
    !Number.isFinite(values.deliveryTimeDays) ||
    values.deliveryTimeDays <= 0
  ) {
    errors.deliveryTimeDays =
      "Duration must be greater than 0";
  }

  if (
    !Number.isFinite(values.revisionCount) ||
    values.revisionCount < 0
  ) {
    errors.revisionCount =
      "Revision count cannot be negative";
  }

  const skillIds = values.skillIds ?? [];

  if (skillIds.length < 1) {
    errors.skillIds =
      "Select at least one skill";
  }

  if (skillIds.length > 12) {
    errors.skillIds =
      "Select up to 12 skills";
  }

  // Media validation
  const mediaUrls = values.mediaUrls ?? [];
  const mediaFiles = values.mediaFiles ?? [];

  if (mediaUrls.length === 0) {
    errors.mediaUrls =
      "Upload at least one image or video";
  }

  if (mediaUrls.length > 10) {
    errors.mediaUrls =
      "You can upload up to 10 media files";
  }

  mediaFiles.forEach((file) => {
    const allowedTypes = [
      "image/",
      "video/",
    ];

    const isAllowed = allowedTypes.some((type) =>
      file.type.startsWith(type)
    );

    if (!isAllowed) {
      errors.mediaFiles =
        "Only images and videos are allowed";
    }

    if (file.size > 50 * 1024 * 1024) {
      errors.mediaFiles =
        "Each file must be smaller than 50MB";
    }
  });

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      errors,
    };
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
      mediaUrls,
    },
  };
}