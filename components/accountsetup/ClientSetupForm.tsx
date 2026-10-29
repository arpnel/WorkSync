"use client";
import ContentSkeleton from "@/components/shared/ContentSkeleton";

import { BasicInformationSection } from "./sections/BasicInformationSection";
import { ClientHiringTypeSection } from "./sections/ClientHiringTypeSection";
import { ProfileSection } from "./sections/ProfileSection";
import { useClientSetup } from "./hooks/useClientSetup";
import VerificationSettings from "@/components/account/VerificationSettings";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { validateClientSetup } from "@/lib/validation/account-setup.validation";
import type { ClientSetupValues } from "@/types/account-setup.types";

const setupSteps = [
  { title: "Personal Profile", detail: "Basic information and profile" },
  { title: "Business Details & Finish", detail: "Hiring type and verification" },
] as const;

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
  const [step, setStep] = useState(0);
  const [stageErrors, setStageErrors] = useState<Partial<Record<keyof ClientSetupValues, string>>>({});

  function handleBasicInformationChange(field: keyof ClientSetupValues, value: ClientSetupValues[keyof ClientSetupValues]) {
    handleChange(field, value);
    setStageErrors((current) => ({
      ...current,
      [field]: undefined,
      ...(field === "province" ? { city: undefined } : {}),
    }));
  }

  function continueToNextStep() {
    const result = validateClientSetup(values, true);
    if (!result.ok) {
      setStageErrors(result.errors);
      return;
    }
    setStageErrors({});
    setStep(1);
  }

  function finishSetup() {
    const result = validateClientSetup(values, true);
    if (!result.ok) {
      setStageErrors(result.errors);
      setStep(0);
      return;
    }
    setStageErrors({});
    void handleSubmit();
  }

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
      <ol aria-label="Client setup progress" className="grid grid-cols-2 gap-2 sm:gap-5">
        {setupSteps.map((item, index) => (
          <li key={item.title} aria-current={step === index ? "step" : undefined} className={`border-t-2 pt-3 ${index <= step ? "border-primary" : "border-border"}`}>
            <div className="flex items-center gap-2">
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm ${index <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {index < step ? <Check className="size-4" /> : index + 1}
              </span>
              <span className={`text-xs font-medium sm:text-sm ${index === step ? "text-foreground" : "text-muted-foreground"}`}>{item.title}</span>
            </div>
            <p className="mt-1 pl-9 text-xs text-muted-foreground">{item.detail}</p>
          </li>
        ))}
      </ol>

      {step === 0 && <>
      <ProfileSection
        values={values}
        photoPreview={photoPreview}
        errors={{ ...errors, ...stageErrors }}
        onChange={handleChange}
        onPhotoSelect={handlePhotoSelect}
        onPhotoRemove={handlePhotoRemove}
        profilePhotoRequired={false}
      />

      {/* Basic Information */}

      <BasicInformationSection
        values={values}
        errors={{ ...errors, ...stageErrors }}
        handleChange={handleBasicInformationChange}
      />
      </>}

      {step === 1 && <>
      <ClientHiringTypeSection />

      <VerificationSettings />

      <div className="flex flex-col-reverse justify-between gap-2 sm:flex-row">
        <Button type="button" variant="outline" onClick={() => setStep(0)}><ArrowLeft /> Back</Button>
        <Button type="button" disabled={isSubmitting} onClick={finishSetup}>
          {isSubmitting ? "Saving..." : "Save and Continue"}
        </Button>
      </div>
      </>}

      {step === 0 && <div className="flex justify-end">
        <Button type="button" onClick={continueToNextStep}>Continue <ArrowRight /></Button>
      </div>}
    </fieldset>
  );
}
