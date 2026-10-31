"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  validateClientSetup,
  validateFreelancerSetup,
  validateSetupFile,
} from "@/lib/validation/account-setup.validation";
import {
  loadAccountSetup,
  submitClientSetup,
  submitFreelancerSetup,
} from "../service/accountSetup.service";
import type { FreelancerSetupValues } from "@/types/account-setup.types";
const initial: FreelancerSetupValues = {
  firstName: "",
  lastName: "",
  display_name: "",
  province: "",
  city: "",
  englishProficiency: "",
  profilePhoto: null,
  bannerImage: null,
  shortBio: "",
  industries: [],
  headline: "",
  skills: [],
  yearsOfExperience: 0,
  linkedIn: "",
  github: "",
  portfolioWebsite: "",
  resume: null,
  portfolioSamples: [],
  certifications: [],
};
export function useSetupForm(role: "client" | "freelancer") {
  const router = useRouter();
  const [values, setValues] = useState<FreelancerSetupValues>(initial);
  const [photoPreview, setPhotoPreview] = useState("");
  const [bannerPreview, setBannerPreview] = useState("");
  const [errors, setErrors] = useState<
    Partial<Record<keyof FreelancerSetupValues, string>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [hasFreelancerProfile, setHasFreelancerProfile] = useState(false);
  const [hasClientProfile, setHasClientProfile] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const submitting = useRef(false);
  useEffect(() => {
    let alive = true;
    void loadAccountSetup(role)
      .then((saved) => {
        if (!alive) return;
        setValues({ ...initial, ...saved.values });
        setHasFreelancerProfile(saved.hasFreelancerProfile);
        setHasClientProfile(saved.hasClientProfile);
        setPhotoPreview(saved.values.existingAvatarUrl ?? "");
        setBannerPreview(saved.values.existingBannerUrl ?? "");
        setLoadError("");
      })
      .catch((error) => {
        if (alive)
          setLoadError(
            error instanceof Error
              ? error.message
              : "Your saved profile could not be loaded.",
          );
      })
      .finally(() => {
        if (alive) setIsLoadingProfile(false);
      });
    return () => {
      alive = false;
    };
  }, [role, reload]);
  function retryLoad() {
    setIsLoadingProfile(true);
    setReload((value) => value + 1);
  }
  function handleChange<K extends keyof FreelancerSetupValues>(
    field: K,
    value: FreelancerSetupValues[K],
  ) {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  }
  useEffect(() => {
    if (!values.profilePhoto) return;
    const url = URL.createObjectURL(values.profilePhoto);
    // External browser resource; the loaded profile URL stays separate.
    const image = new Image();
    image.onload = () => setPhotoPreview(url);
    image.src = url;
    return () => {
      image.onload = null;
      URL.revokeObjectURL(url);
    };
  }, [values.profilePhoto]);
  useEffect(() => {
    if (!values.bannerImage) return;
    const url = URL.createObjectURL(values.bannerImage);
    setBannerPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [values.bannerImage]);
  function handlePhotoSelect(file: File) {
    if (!file) return;
    const error = validateSetupFile(file, "photo");
    if (error) {
      setErrors((previous) => ({ ...previous, profilePhoto: error }));
      return;
    }
    handleChange("profilePhoto", file);
  }
  function handlePhotoRemove() {
    handleChange("profilePhoto", null);
    setPhotoPreview(values.existingAvatarUrl ?? "");
  }
  function handleBannerSelect(file: File) {
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setErrors((previous) => ({ ...previous, bannerImage: "Choose an image file for your banner." }));
      return;
    }
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      setErrors((previous) => ({ ...previous, bannerImage: "Choose a non-empty image up to 5 MB." }));
      return;
    }
    handleChange("bannerImage", file);
  }
  function handleFileSelect(
    field: keyof FreelancerSetupValues,
    file: File,
  ) {
    if (field !== "resume") return;
    if (!file) return;
    const error = validateSetupFile(file, "resume");
    if (error) {
      setErrors((previous) => ({ ...previous, resume: error }));
      return;
    }
    handleChange("resume", file);
  }
  function handleMultiFileSelect(
    field: "portfolioSamples" | "certifications",
    files: File[],
  ) {
    for (const file of files) {
      const error = validateSetupFile(file, "document");
      if (error) {
        setErrors((previous) => ({ ...previous, [field]: error }));
        return;
      }
    }
    const stored =
      field === "portfolioSamples"
        ? values.existingPortfolioSamples
        : values.existingCertifications;
    const additions = files.filter(
      (file) =>
        !values[field].some(
          (current) =>
            current.name === file.name &&
            current.size === file.size &&
            current.lastModified === file.lastModified,
        ),
    );
    if (values[field].length + additions.length + (stored?.length ?? 0) > 10) {
      setErrors((previous) => ({
        ...previous,
        [field]: "Keep at most 10 files in this section.",
      }));
      return;
    }
    handleChange(field, [...values[field], ...additions]);
  }
  async function handleSubmit(
    afterProfileSaved?: () => Promise<void>,
    stayOnPage = false,
  ) {
    if (submitting.current || isLoadingProfile || loadError) return;
    const result =
      role === "client"
        ? validateClientSetup(values, true)
        : validateFreelancerSetup(values);
    if (!result.ok) {
      setErrors(result.errors);
      toast.error("Please correct the highlighted fields.");
      return;
    }
    setErrors({});
    submitting.current = true;
    setIsSubmitting(true);
    let profileSaved = false;
    try {
      if (role === "client") await submitClientSetup(values);
      else await submitFreelancerSetup(values);
      profileSaved = true;
      if (role === "freelancer") setHasFreelancerProfile(true);
      await afterProfileSaved?.();
      toast.success(
        stayOnPage
          ? "Profile saved. You can submit your seller and tax documents below."
          : "Profile setup saved. Identity verification has its own status.",
      );
      if (!stayOnPage) {
        router.push("/home/dashboard");
        router.refresh();
      }
    } catch (error) {
      toast.error(
        profileSaved
          ? `${error instanceof Error ? error.message : "Document submission failed."} Your profile is saved; retry this step here.`
          : error instanceof Error
            ? error.message
            : "Profile setup could not be saved. Please retry.",
      );
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  }
  return {
    values,
    photoPreview,
    bannerPreview,
    errors,
    isSubmitting,
    isLoadingProfile,
    hasFreelancerProfile,
    hasClientProfile,
    loadError,
    retryLoad,
    handleChange,
    handlePhotoSelect,
    handlePhotoRemove,
    handleBannerSelect,
    handleFileSelect,
    handleMultiFileSelect,
    handleRemoveFile: (
      field: "portfolioSamples" | "certifications",
      index: number,
    ) =>
      handleChange(
        field,
        values[field].filter((_, i) => i !== index),
      ),
    handleIndustriesChange: (ids: string[]) => handleChange("industries", ids),
    handleSkillsChange: (ids: string[]) => handleChange("skills", ids),
    handleSubmit,
  };
}
