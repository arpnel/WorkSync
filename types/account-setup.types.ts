export type AccountType = "hire-talent" | "offer-services";

export interface ClientSetupValues {
  firstName: string;
  lastName: string;
  display_name: string;
  province: string;
  city: string;
  englishProficiency: string;
  profilePhoto: File | null;
  shortBio: string;
}

export interface FreelancerSetupValues extends ClientSetupValues {
  primaryCategory: string;
  skills: string[];
  yearsOfExperience: number;
  industries: string[];
  employmentPreference: string;
  portfolioWebsite: string;
  linkedIn: string;
  github: string;
  resume: File | null;
  governmentId: File | null;
  portfolioSamples: File[];
  certifications: File[];
}

