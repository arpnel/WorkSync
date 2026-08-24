"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { validateFreelancerSetup } from "@/lib/validation/account-setup.validation";

import {
  getJobCategories,
  getAllSkills,
  getSkillsByCategory,
  type Category,
  type Skill,
} from "../service/category.service";

import { submitFreelancerSetup } from "../service/accountSetup.service";

import type { FreelancerSetupValues } from "@/types/account-setup.types";

const INITIAL_VALUES: FreelancerSetupValues = {
  firstName: "",
  lastName: "",
  display_name: "",

  province: "",
  city: "",
  englishProficiency: "",

  profilePhoto: null,
  shortBio: "",

  primaryCategory: "",
  industries: [],
  skills: [],

  yearsOfExperience: 0,
  employmentPreference: "",

  portfolioWebsite: "",
  linkedIn: "",
  github: "",

  resume: null,

  governmentId: null,
  portfolioSamples: [],
  certifications: [],
};

export function useFreelancerSetup() {
  const router = useRouter();

  const [values, setValues] =
    useState<FreelancerSetupValues>(INITIAL_VALUES);

  const [categories, setCategories] = useState<Category[]>([]);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [recommendedSkills, setRecommendedSkills] =
    useState<Skill[]>([]);

  const [photoPreview, setPhotoPreview] = useState("");

  const [errors, setErrors] = useState<
    Partial<Record<keyof FreelancerSetupValues, string>>
  >({});

  const [isLoadingCategories, setIsLoadingCategories] =
    useState(true);

  const [isLoadingSkills, setIsLoadingSkills] =
    useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);

  /*
   * Load categories and all skills.
   */
  useEffect(() => {
    const loadCategoryData = async () => {
      try {
        setIsLoadingCategories(true);
        setIsLoadingSkills(true);

        const [categoryData, skillData] = await Promise.all([
          getJobCategories(),
          getAllSkills(),
        ]);

        setCategories(categoryData);
        setAllSkills(skillData);
      } catch (error) {
        console.error(
          "Failed to load category data:",
          error,
        );

        toast.error(
          "Failed to load industries and skills.",
        );
      } finally {
        setIsLoadingCategories(false);
        setIsLoadingSkills(false);
      }
    };

    loadCategoryData();
  }, []);

  /*
   * Load recommended skills whenever selected industries change.
   */
  useEffect(() => {
    const loadRecommendedSkills = async () => {
      if (values.industries.length === 0) {
        setRecommendedSkills([]);
        return;
      }

      try {
        const skillGroups = await Promise.all(
          values.industries.map((categoryId) =>
            getSkillsByCategory(categoryId),
          ),
        );

        const skillMap = new Map<string, Skill>();

        skillGroups.flat().forEach((skill) => {
          skillMap.set(skill.id, skill);
        });

        setRecommendedSkills(
          Array.from(skillMap.values()).sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        );
      } catch (error) {
        console.error(
          "Failed to load recommended skills:",
          error,
        );

        toast.error(
          "Failed to load recommended skills.",
        );
      }
    };

    loadRecommendedSkills();
  }, [values.industries]);

  /*
   * Generic form change handler.
   */
  const handleChange = <
    K extends keyof FreelancerSetupValues,
  >(
    field: K,
    value: FreelancerSetupValues[K],
  ) => {
    setValues((prev) => ({
      ...prev,
      [field]: value,
    }));

    if (errors[field]) {
      setErrors((prev) => ({
        ...prev,
        [field]: undefined,
      }));
    }
  };

  /*
   * Profile photo.
   */
  const handlePhotoSelect = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    handleChange("profilePhoto", file);

    const reader = new FileReader();

    reader.onload = () => {
      setPhotoPreview(reader.result as string);
    };

    reader.readAsDataURL(file);
  };

  const handlePhotoRemove = () => {
    handleChange("profilePhoto", null);
    setPhotoPreview("");
  };

  /*
   * Industries.
   */
  const handleIndustriesChange = (
    industryIds: string[],
  ) => {
    handleChange("industries", industryIds);
  };

  /*
   * Skills.
   */
  const handleSkillsChange = (
    skillIds: string[],
  ) => {
    handleChange("skills", skillIds);
  };

  /*
   * Single file select.
   */
  const handleFileSelect = (
    field: keyof FreelancerSetupValues,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0] ?? null;

    handleChange(
      field,
      file as FreelancerSetupValues[keyof FreelancerSetupValues],
    );
  };

  /*
   * Multi file select.
   */
  const handleMultiFileSelect = (
    field:
      | "portfolioSamples"
      | "certifications",
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(
      event.target.files ?? [],
    );

    handleChange(field, [
      ...(values[field] as File[]),
      ...files,
    ]);
  };

  /*
   * Remove a file from a multi-file field.
   */
  const handleRemoveFile = (
    field:
      | "portfolioSamples"
      | "certifications",
    index: number,
  ) => {
    handleChange(
      field,
      (values[field] as File[]).filter(
        (_, i) => i !== index,
      ),
    );
  };

  /*
   * Submit.
   */
  const handleSubmit = async () => {
  console.log("SUBMIT BUTTON CLICKED");
  console.log("Current form values:", values);

  const result = validateFreelancerSetup(values);

  console.log("Validation result:", result);

  if (!result.ok) {
    console.log("VALIDATION FAILED:", result.errors);

    setErrors(result.errors);

    toast.error("Please fix the errors before continuing.");

    return;
  }

  console.log("VALIDATION PASSED");

  setIsSubmitting(true);

  try {
    console.log("Submitting freelancer setup:", result.data);

    await submitFreelancerSetup(result.data);

    console.log("Freelancer setup saved successfully");

    toast.success("Account setup completed!");

    router.push("/home/dashboard");
  } catch (error) {
    console.error("Freelancer setup error:", error);

    toast.error(
      error instanceof Error
        ? error.message
        : "Failed to save your information.",
    );
  } finally {
    setIsSubmitting(false);
  }
};

  return {
    values,
    categories,
    allSkills,
    recommendedSkills,
    photoPreview,
    errors,
    isLoadingCategories,
    isLoadingSkills,
    isSubmitting,
    handleChange,
    handlePhotoSelect,
    handlePhotoRemove,
    handleIndustriesChange,
    handleSkillsChange,
    handleFileSelect,
    handleMultiFileSelect,
    handleRemoveFile,
    handleSubmit,
  };
}