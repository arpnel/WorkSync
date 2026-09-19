"use client";
import ContentSkeleton from "@/components/shared/ContentSkeleton";

import { BasicInformationSection } from "./sections/BasicInformationSection";
import { ProfileSection } from "./sections/ProfileSection";
import { FreelancerInformationSection } from "./sections/FreelancerInformationSection";
import { VerificationSection } from "./sections/VerificationSection";
import { SubmitSection } from "./sections/SubmitSection";

import { useFreelancerSetup } from "./hooks/useFreelancerSetup";
import VerificationSettings from "@/components/account/VerificationSettings";
import { Button } from "@/components/ui/button";

export function FreelancerSetupForm() {
  const {
    values,
    categories,
    allSkills,
    recommendedSkills,
    photoPreview,
    errors,
    isLoadingCategories,
    isLoadingSkills,
    isSubmitting,
    isLoadingProfile,
    loadError,
    retryLoad,
    categoryError,
    handleChange,
    handlePhotoSelect,
    handlePhotoRemove,
    handleFileSelect,
    handleMultiFileSelect,
    handleRemoveFile,
    handleSubmit,
  } = useFreelancerSetup();

  if (isLoadingProfile)
    return (
      <ContentSkeleton
        label="Loading your saved profile"
        variant="setup"
        count={4}
      />
    );
  if (loadError)
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
        <Button onClick={retryLoad}>Retry loading profile</Button>
      </div>
    );

  return (
    <fieldset
      disabled={isSubmitting}
      className="mx-auto min-w-0 max-w-2xl space-y-8"
    >
      {categoryError && (
        <p role="alert" className="text-sm text-destructive">
          {categoryError}
        </p>
      )}
      {/* Basic Information */}

      <BasicInformationSection
        values={values}
        errors={errors}
        handleChange={handleChange}
      />

      {/* Profile */}

      <ProfileSection
        values={values}
        photoPreview={photoPreview}
        errors={errors}
        onChange={handleChange}
        onPhotoSelect={handlePhotoSelect}
        onPhotoRemove={handlePhotoRemove}
      />

      {/* Freelancer Information */}

      <FreelancerInformationSection
        values={values}
        categories={categories}
        allSkills={allSkills}
        recommendedSkills={recommendedSkills}
        isLoadingCategories={isLoadingCategories}
        isLoadingSkills={isLoadingSkills}
        errors={errors}
        onChange={handleChange}
        onFileSelect={handleFileSelect}
      />

      {/* Verification */}

      <VerificationSection
        values={values}
        errors={errors}
        onMultiFileSelect={handleMultiFileSelect}
        onRemoveFile={handleRemoveFile}
      />

      {/* Submit */}
      <VerificationSettings />

      <SubmitSection
        isSubmitting={isSubmitting}
        label="Save Freelancer Profile"
        loadingLabel="Saving..."
        onSubmit={handleSubmit}
      />
    </fieldset>
  );
}
