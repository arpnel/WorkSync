export const ACCOUNT_TYPES = {
  HIRE_TALENT: "hire-talent",
  OFFER_SERVICES: "offer-services",
} as const;

export const ENGLISH_PROFICIENCY = [
  { value: "native", label: "Native" },
  { value: "fluent", label: "Fluent" },
  { value: "intermediate", label: "Intermediate" },
  { value: "basic", label: "Basic" },
] as const;

export const EMPLOYMENT_PREFERENCES = [
  { value: "full-time", label: "Full Time" },
  { value: "part-time", label: "Part Time" },
  { value: "contract", label: "Contract" },
  { value: "hourly", label: "Hourly" },
] as const;

export const MAX_FILE_SIZE_MB = 10;
export const MAX_IMAGE_SIZE_MB = 5;
export const MAX_BIO_LENGTH = 500;

