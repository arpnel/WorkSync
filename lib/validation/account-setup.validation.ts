import { listProvinces, listMuncities } from "@jobuntux/psgc";
import {
  ENGLISH_PROFICIENCY,
  EMPLOYMENT_PREFERENCES,
} from "@/constants/account-setup.constants";
import type {
  ClientSetupValues,
  FreelancerSetupValues,
} from "@/types/account-setup.types";
type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: Partial<Record<keyof T, string>> };
export function validateSetupFile(
  file: File,
  kind: "photo" | "resume" | "document",
): string | undefined {
  const types =
    kind === "resume"
      ? ["application/pdf"]
      : kind === "photo"
        ? ["image/jpeg", "image/png", "image/webp"]
        : ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  const limit = kind === "photo" ? 5 : 10;
  if (!types.includes(file.type))
    return kind === "resume"
      ? "Choose a PDF resume."
      : "Choose a JPG, PNG or WebP image" +
          (kind === "document" ? ", or a PDF." : ".");
  if (file.size <= 0 || file.size > limit * 1024 * 1024)
    return `Choose a non-empty file up to ${limit} MB.`;
}
export function validateClientSetup(
  values: ClientSetupValues,
): ValidationResult<ClientSetupValues> {
  const errors: Partial<Record<keyof ClientSetupValues, string>> = {};
  for (const field of ["firstName", "lastName"] as const) {
    const name = values[field].trim();
    if (!name || name.length > 50 || /[\u0000-\u001f<>]/.test(name))
      errors[field] =
        "Enter your name as it appears on your ID (up to 50 characters).";
  }
  if (!values.display_name.trim() || values.display_name.trim().length > 50)
    errors.display_name = "Enter a display name of up to 50 characters.";
  const province = listProvinces().find(
    (p) => p.provName.toLowerCase() === values.province.trim().toLowerCase(),
  );
  if (!province) errors.province = "Choose a province from the list.";
  if (
    !province ||
    !listMuncities(province.provCode).some(
      (c) => c.munCityName.toLowerCase() === values.city.trim().toLowerCase(),
    )
  )
    errors.city = "Choose a city or municipality in your selected province.";
  if (
    !ENGLISH_PROFICIENCY.some(
      (option) => option.value === values.englishProficiency,
    )
  )
    errors.englishProficiency = "Select your English proficiency.";
  if (!values.profilePhoto && !values.existingAvatarUrl)
    errors.profilePhoto = "Add a profile photo.";
  if (values.profilePhoto) {
    const error = validateSetupFile(values.profilePhoto, "photo");
    if (error) errors.profilePhoto = error;
  }
  if (values.shortBio.trim().length < 10 || values.shortBio.trim().length > 500)
    errors.shortBio = "Write a bio between 10 and 500 characters.";
  if (Object.keys(errors).length) return { ok: false, errors };
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
export function validateFreelancerSetup(
  values: FreelancerSetupValues,
): ValidationResult<FreelancerSetupValues> {
  const base = validateClientSetup(values);
  const errors: Partial<Record<keyof FreelancerSetupValues, string>> = base.ok
    ? {}
    : { ...base.errors };
  if ((values.headline?.trim().length ?? 0) > 120)
    errors.headline = "Keep your professional headline within 120 characters.";
  if (
    values.hourlyRate?.trim() &&
    (!Number.isFinite(Number(values.hourlyRate)) ||
      Number(values.hourlyRate) <= 0)
  )
    errors.hourlyRate =
      "Enter an hourly rate greater than zero, or leave it blank.";
  if (!values.industries.length || values.industries.length > 10)
    errors.industries = "Select between 1 and 10 industries.";
  if (!values.skills.length || values.skills.length > 25)
    errors.skills = "Select between 1 and 25 skills.";
  if (
    !Number.isInteger(values.yearsOfExperience) ||
    values.yearsOfExperience < 0 ||
    values.yearsOfExperience > 50
  )
    errors.yearsOfExperience = "Enter a whole number from 0 to 50.";
  if (
    !EMPLOYMENT_PREFERENCES.some(
      (option) => option.value === values.employmentPreference,
    )
  )
    errors.employmentPreference = "Select an employment preference.";
  for (const field of ["portfolioWebsite", "linkedIn", "github"] as const) {
    if (!values[field].trim()) continue;
    try {
      const url = new URL(values[field].trim());
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error();
      if (
        field === "linkedIn" &&
        url.hostname !== "linkedin.com" &&
        !url.hostname.endsWith(".linkedin.com")
      )
        throw new Error();
      if (
        field === "github" &&
        url.hostname !== "github.com" &&
        url.hostname !== "www.github.com"
      )
        throw new Error();
    } catch {
      errors[field] =
        `Enter a valid ${field === "linkedIn" ? "LinkedIn" : field === "github" ? "GitHub" : "website"} URL.`;
    }
  }
  if (!values.resume && !values.existingResumeUrl)
    errors.resume = "Add your PDF resume.";
  if (values.resume) {
    const error = validateSetupFile(values.resume, "resume");
    if (error) errors.resume = error;
  }
  if (
    !values.portfolioSamples.length &&
    !values.existingPortfolioSamples?.length
  )
    errors.portfolioSamples = "Add at least one portfolio sample.";
  for (const field of ["portfolioSamples", "certifications"] as const) {
    const previous =
      field === "portfolioSamples"
        ? values.existingPortfolioSamples
        : values.existingCertifications;
    if (values[field].length + (previous?.length ?? 0) > 10)
      errors[field] = "Keep at most 10 files in this section.";
    for (const file of values[field]) {
      const error = validateSetupFile(file, "document");
      if (error) {
        errors[field] = error;
        break;
      }
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      ...values,
      ...(base.ok ? base.data : {}),
      industries: [...new Set(values.industries)],
      skills: [...new Set(values.skills)],
      headline: values.headline?.trim() ?? "",
      hourlyRate: values.hourlyRate?.trim() ?? "",
      portfolioWebsite: values.portfolioWebsite.trim(),
      linkedIn: values.linkedIn.trim(),
      github: values.github.trim(),
    },
  };
}
