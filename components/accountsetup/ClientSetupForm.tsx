"use client";
import ContentSkeleton from "@/components/shared/ContentSkeleton";

import { BasicInformationSection } from "./sections/BasicInformationSection";
import { ProfileSection } from "./sections/ProfileSection";
import { SubmitSection } from "./sections/SubmitSection";

import { useClientSetup } from "./hooks/useClientSetup";
import VerificationSettings from "@/components/account/VerificationSettings";
import { Button } from "@/components/ui/button";

export function ClientSetupForm() {
  const {
    values,
    photoPreview,
    errors,
    isSubmitting,
    isLoadingProfile,
    loadError,
    retryLoad,
    handleChange,
    handlePhotoSelect,
    handlePhotoRemove,
    handleSubmit,
  } = useClientSetup();

  if (isLoadingProfile)
    return (
      <ContentSkeleton
        label="Loading your saved profile"
        variant="setup"
        count={2}
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
      <VerificationSettings />

      <SubmitSection
        isSubmitting={isSubmitting}
        label="Save & Continue"
        loadingLabel="Saving..."
        onSubmit={handleSubmit}
      />
    </fieldset>
  );
}
