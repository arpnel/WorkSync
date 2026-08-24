"use client";

import { BasicInformationSection } from "./sections/BasicInformationSection";
import { ProfileSection } from "./sections/ProfileSection";
import { SubmitSection } from "./sections/SubmitSection";

import { useClientSetup } from "./hooks/useClientSetup";

export function ClientSetupForm() {
  const {
    values,
    photoPreview,
    errors,
    isSubmitting,
    handleChange,
    handlePhotoSelect,
    handlePhotoRemove,
    handleSubmit,
  } = useClientSetup();

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

      {/* Submit */}

      <SubmitSection
        isSubmitting={isSubmitting}
        label="Save & Continue"
        loadingLabel="Saving..."
        onSubmit={handleSubmit}
      />
    </div>
  );
}
