import type {
  ClientSetupValues,
  FreelancerSetupValues,
} from "@/types/account-setup.types";

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: Partial<Record<keyof T, string>> };

// ──────────────────────────────────────────────
// Single field validators
// ──────────────────────────────────────────────

function validateName(
  name: string,
  field: string,
): string | undefined {
  const trimmed = name.trim();

  if (!trimmed) {
    return `${field} is required.`;
  }

  if (trimmed.length < 2) {
    return `${field} must be at least 2 characters.`;
  }

  if (trimmed.length > 50) {
    return `${field} must be at most 50 characters.`;
  }

  return undefined;
}

// ──────────────────────────────────────────────
// Client Setup Validation
// ──────────────────────────────────────────────

export function validateClientSetup(
  values: ClientSetupValues,
): ValidationResult<ClientSetupValues> {
  const errors: Partial<Record<keyof ClientSetupValues, string>> = {};

  // ────────────────────────────────────────────
  // Basic Information
  // ────────────────────────────────────────────

  const firstNameError = validateName(
    values.firstName,
    "First Name",
  );

  if (firstNameError) {
    errors.firstName = firstNameError;
  }

  const lastNameError = validateName(
    values.lastName,
    "Last Name",
  );

  if (lastNameError) {
    errors.lastName = lastNameError;
  }

  if (!values.province.trim()) {
    errors.province = "Province is required.";
  }

  if (!values.city.trim()) {
    errors.city = "City is required.";
  }

  if (!values.englishProficiency) {
    errors.englishProficiency =
      "Please select your English proficiency.";
  }

  // Display Name
  if (!values.display_name?.trim()) {
    errors.display_name = "Display name is required.";
  }

  // ────────────────────────────────────────────
  // Profile
  // ────────────────────────────────────────────

  if (!values.profilePhoto) {
    errors.profilePhoto = "Profile photo is required.";
  }

  if (!values.shortBio.trim()) {
    errors.shortBio = "Short bio is required.";
  } else if (values.shortBio.trim().length < 10) {
    errors.shortBio = "Bio must be at least 10 characters.";
  } else if (values.shortBio.trim().length > 500) {
    errors.shortBio = "Bio must be at most 500 characters.";
  }

  // ────────────────────────────────────────────
  // Return validation result
  // ────────────────────────────────────────────

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
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      display_name: values.display_name.trim(),
      province: values.province.trim(),
      city: values.city.trim(),
      shortBio: values.shortBio.trim(),
    },
  };
}

// ──────────────────────────────────────────────
// Freelancer Setup Validation
// ──────────────────────────────────────────────

export function validateFreelancerSetup(
  values: FreelancerSetupValues,
): ValidationResult<FreelancerSetupValues> {
  const errors: Partial<
    Record<keyof FreelancerSetupValues, string>
  > = {};

  // ────────────────────────────────────────────
  // Basic Information
  // ────────────────────────────────────────────

  const firstNameError = validateName(
    values.firstName,
    "First Name",
  );

  if (firstNameError) {
    errors.firstName = firstNameError;
  }

  const lastNameError = validateName(
    values.lastName,
    "Last Name",
  );

  if (lastNameError) {
    errors.lastName = lastNameError;
  }

  if (!values.province.trim()) {
    errors.province = "Province is required.";
  }

  if (!values.city.trim()) {
    errors.city = "City is required.";
  }

  if (!values.englishProficiency) {
    errors.englishProficiency =
      "Please select your English proficiency.";
  }

  // Display Name
  if (!values.display_name?.trim()) {
    errors.display_name = "Display name is required.";
  }

  // ────────────────────────────────────────────
  // Profile
  // ────────────────────────────────────────────

  if (!values.profilePhoto) {
    errors.profilePhoto = "Profile photo is required.";
  }

  if (!values.shortBio.trim()) {
    errors.shortBio = "Short bio is required.";
  } else if (values.shortBio.trim().length < 10) {
    errors.shortBio = "Bio must be at least 10 characters.";
  } else if (values.shortBio.trim().length > 500) {
    errors.shortBio = "Bio must be at most 500 characters.";
  }

  // ────────────────────────────────────────────
  // Freelancer Information
  // ────────────────────────────────────────────

  // Industries
  if (!values.industries || values.industries.length === 0) {
    errors.industries = "Select at least one industry.";
  }

  // Skills
  if (!values.skills || values.skills.length === 0) {
    errors.skills = "Select at least one skill.";
  } else if (values.skills.length > 25) {
    errors.skills = "You can select up to 25 skills.";
  }

  // Years of Experience
  if (
    values.yearsOfExperience === undefined ||
    values.yearsOfExperience < 0
  ) {
    errors.yearsOfExperience =
      "Years of experience cannot be negative.";
  } else if (values.yearsOfExperience > 50) {
    errors.yearsOfExperience =
      "Years of experience cannot exceed 50.";
  }

  // Employment Preference
  if (!values.employmentPreference) {
    errors.employmentPreference =
      "Please select an employment preference.";
  }

  // ────────────────────────────────────────────
  // URLs
  // ────────────────────────────────────────────

  if (
    values.portfolioWebsite?.trim() &&
    !isValidUrl(values.portfolioWebsite.trim())
  ) {
    errors.portfolioWebsite = "Please enter a valid URL.";
  }

  if (
    values.linkedIn?.trim() &&
    !isValidUrl(values.linkedIn.trim())
  ) {
    errors.linkedIn = "Please enter a valid URL.";
  }

  if (
    values.github?.trim() &&
    !isValidUrl(values.github.trim())
  ) {
    errors.github = "Please enter a valid URL.";
  }

  // ────────────────────────────────────────────
  // Resume
  // ────────────────────────────────────────────

  if (!values.resume) {
    errors.resume = "Resume is required.";
  } else if (values.resume.type !== "application/pdf") {
    errors.resume = "Resume must be a PDF file.";
  } else if (values.resume.size > 10 * 1024 * 1024) {
    errors.resume = "Resume must be less than 10MB.";
  }

  // ────────────────────────────────────────────
  // Government ID
  // ────────────────────────────────────────────

  if (!values.governmentId) {
    errors.governmentId = "Government ID is required.";
  } else if (
    values.governmentId.size > 10 * 1024 * 1024
  ) {
    errors.governmentId =
      "Government ID must be less than 10MB.";
  }

  // ────────────────────────────────────────────
  // Portfolio Samples
  // ────────────────────────────────────────────

  if (
    !values.portfolioSamples ||
    values.portfolioSamples.length === 0
  ) {
    errors.portfolioSamples =
      "Upload at least one portfolio sample.";
  }

  // ────────────────────────────────────────────
  // Return validation result
  // ────────────────────────────────────────────

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
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      display_name: values.display_name.trim(),
      province: values.province.trim(),
      city: values.city.trim(),
      shortBio: values.shortBio.trim(),

      portfolioWebsite:
        values.portfolioWebsite?.trim() ?? "",

      linkedIn:
        values.linkedIn?.trim() ?? "",

      github:
        values.github?.trim() ?? "",
    },
  };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:"
    );
  } catch {
    return false;
  }
}