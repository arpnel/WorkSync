"use client";

import { BasicInformationSection } from "./sections/BasicInformationSection";
import { ProfileSection } from "./sections/ProfileSection";
import { FreelancerInformationSection } from "./sections/FreelancerInformationSection";
import { VerificationSection } from "./sections/VerificationSection";
import { SubmitSection } from "./sections/SubmitSection";

import { useFreelancerSetup } from "./hooks/useFreelancerSetup";

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
    handleChange,
    handlePhotoSelect,
    handlePhotoRemove,
    handleIndustriesChange,
    handleSkillsChange,
    handleFileSelect,
    handleMultiFileSelect,
    handleRemoveFile,
    handleSubmit,
  } = useFreelancerSetup();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
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
        onChange={handleChange}
        onFileSelect={handleFileSelect}
        onMultiFileSelect={handleMultiFileSelect}
        onRemoveFile={handleRemoveFile}
      />

      {/* Submit */}

      <SubmitSection
        isSubmitting={isSubmitting}
        label="Save Freelancer Profile"
        loadingLabel="Saving..."
        onSubmit={handleSubmit}
      />
    </div>
  );
}
