"use client";
import ContentSkeleton from "@/components/shared/ContentSkeleton";

import { BasicInformationSection } from "./sections/BasicInformationSection";
import { ProfileSection } from "./sections/ProfileSection";
import { FreelancerInformationSection } from "./sections/FreelancerInformationSection";

import { useFreelancerSetup } from "./hooks/useFreelancerSetup";
import VerificationSettings from "@/components/account/VerificationSettings";
import TaxDocuments from "@/components/account/TaxDocuments";
import FreelancerTaxDeclaration from "@/components/account/FreelancerTaxDeclaration";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, FileText, Lock } from "lucide-react";
import { validateFreelancerSetup } from "@/lib/validation/account-setup.validation";
import type { FreelancerSetupValues } from "@/types/account-setup.types";
import { supabase } from "@/lib/supabaseClient";

const setupSteps = [
  { title: "Personal Profile", detail: "Basic information and profile" },
  { title: "Professional Details", detail: "Experience, skills and resume" },
  { title: "Documents & Finish", detail: "Verification and seller documents" },
] as const;

const stepFields = [
  ["firstName", "lastName", "display_name", "province", "city", "englishProficiency", "profilePhoto", "shortBio"],
  ["industries", "headline", "skills", "yearsOfExperience", "linkedIn", "github", "resume", "portfolioSamples", "certifications"],
] as const;

function formatTinInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 12);
  if (digits.length > 9) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}-${digits.slice(9)}`;
  if (digits.length > 6) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length > 3) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return digits;
}

export function FreelancerSetupForm() {
  const {
    values,
    categories,
    allSkills,
    recommendedSkills,
    photoPreview,
    bannerPreview,
    errors,
    isLoadingCategories,
    isLoadingSkills,
    isSubmitting,
    hasFreelancerProfile,
    hasClientProfile,
    isLoadingProfile,
    loadError,
    retryLoad,
    categoryError,
    handleChange,
    handlePhotoSelect,
    handlePhotoRemove,
    handleBannerSelect,
    handleFileSelect,
    handleMultiFileSelect,
    handleRemoveFile,
    handleSubmit,
  } = useFreelancerSetup();
  const [documentationVersion, setDocumentationVersion] = useState(0);
  const [step, setStep] = useState(0);
  const [localErrors, setLocalErrors] = useState<Partial<Record<keyof FreelancerSetupValues, string>>>({});
  const [tin, setTin] = useState("");
  const [tinSaved, setTinSaved] = useState(false);
  const [tinError, setTinError] = useState("");
  const hasExistingAccount = hasClientProfile || hasFreelancerProfile;

  useEffect(() => {
    if (!hasExistingAccount) return;
    let active = true;
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const response = await fetch("/api/freelancer-tax-profile/tin", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const result = await response.json();
        if (active && response.ok) setTinSaved(result.hasTin === true);
      } catch {
        // A user with an existing TIN can still enter it again if this check is unavailable.
      }
    })();
    return () => { active = false; };
  }, [hasExistingAccount]);

  function handleStageChange<K extends keyof FreelancerSetupValues>(
    field: K,
    value: FreelancerSetupValues[K],
  ) {
    handleChange(field, value);
    setLocalErrors((current) => ({ ...current, [field]: undefined }));
  }

  function continueToNextStep() {
    const result = validateFreelancerSetup(values);
    if (!result.ok) {
      const fields = new Set<string>(stepFields[step]);
      const stepErrors = Object.fromEntries(
        Object.entries(result.errors).filter(([field]) => fields.has(field)),
      ) as Partial<Record<keyof FreelancerSetupValues, string>>;
      if (Object.keys(stepErrors).length) {
        // Keep validation feedback attached to the current stage.
        // The final save still validates every required field.
        setStepErrors(stepErrors);
        return;
      }
    }
    setStep((current) => Math.min(current + 1, setupSteps.length - 1));
  }

  function finishSetup() {
    const normalizedTin = tin.replace(/\D/g, "");
    if (!tinSaved && !normalizedTin) {
      setTinError("Enter your TIN to continue.");
      return;
    }
    if (normalizedTin && !/^\d{9,12}$/.test(normalizedTin)) {
      setTinError("Enter 9 to 12 digits for your TIN.");
      return;
    }
    const result = validateFreelancerSetup(values);
    if (!result.ok) {
      for (let index = 0; index < stepFields.length; index += 1) {
        const fields = new Set<string>(stepFields[index]);
        const stepErrors = Object.fromEntries(
          Object.entries(result.errors).filter(([field]) => fields.has(field)),
        ) as Partial<Record<keyof FreelancerSetupValues, string>>;
        if (Object.keys(stepErrors).length) {
          setLocalErrors((current) => ({ ...current, ...stepErrors }));
          setStep(index);
          return;
        }
      }
    }
    setLocalErrors({});
    void handleSubmit(async () => {
      if (normalizedTin) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Sign in again to save your TIN.");
        const response = await fetch("/api/freelancer-tax-profile/tin", {
          method: "PUT",
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ tin: normalizedTin }),
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "TIN could not be saved securely.");
        setTinSaved(true);
        setTin("");
        setTinError("");
      }
      setDocumentationVersion((version) => version + 1);
    }, true);
  }

  const setStepErrors = (stepErrors: Partial<Record<keyof FreelancerSetupValues, string>>) => {
    setLocalErrors((current) => ({ ...current, ...stepErrors }));
  };

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
      {categoryError && step === 1 && (
        <p role="alert" className="text-sm text-destructive">
          {categoryError}
        </p>
      )}
      {/* Basic Information */}

      <ol aria-label="Freelancer setup progress" className="grid grid-cols-3 gap-2 sm:gap-5">
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
        bannerPreview={bannerPreview}
        errors={{ ...errors, ...localErrors }}
        onChange={handleStageChange}
        onPhotoSelect={(file) => { handlePhotoSelect(file); setLocalErrors((current) => ({ ...current, profilePhoto: undefined })); }}
        onPhotoRemove={() => { handlePhotoRemove(); setLocalErrors((current) => ({ ...current, profilePhoto: undefined })); }}
        onBannerSelect={(file) => { handleBannerSelect(file); setLocalErrors((current) => ({ ...current, bannerImage: undefined })); }}
        profilePhotoRequired={false}
      />

      <BasicInformationSection
        values={values}
        errors={{ ...errors, ...localErrors }}
        handleChange={handleStageChange}
      />
      </>}

      {/* Freelancer Information */}

      {step === 1 && <>
      <FreelancerInformationSection
        values={values}
        categories={categories}
        allSkills={allSkills}
        recommendedSkills={recommendedSkills}
        isLoadingCategories={isLoadingCategories}
        isLoadingSkills={isLoadingSkills}
        errors={{ ...errors, ...localErrors }}
        onChange={handleStageChange}
        onFileSelect={(field, file) => { handleFileSelect(field, file); setLocalErrors((current) => ({ ...current, [field]: undefined })); }}
        onMultiFileSelect={(field, files) => { handleMultiFileSelect(field, files); setLocalErrors((current) => ({ ...current, [field]: undefined })); }}
        onRemoveDocument={(field, index) => { handleRemoveFile(field, index); setLocalErrors((current) => ({ ...current, [field]: undefined })); }}
      />
      </>}

      {/* Verification */}

      {step === 2 && <>
      <section className="space-y-6 rounded-2xl border bg-card p-5 shadow-xl sm:p-8" aria-labelledby="setup-documents-heading">
        <header className="flex flex-col justify-between gap-3 border-b pb-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="setup-documents-heading" className="text-xl font-bold tracking-tight">Tax &amp; Payout Documents</h2>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">BIR Compliant</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Configure your Philippine tax details. TIN is required to unlock withdrawal capabilities.</p>
          </div>
        </header>
        <div className="space-y-3 rounded-xl border bg-background/40 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="setup-tin" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Taxpayer Identification Number (TIN) <span className="text-destructive">*</span></label>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-500"><Lock className="size-3" /> Mandatory for payouts</span>
          </div>
          <div className="relative">
            <FileText className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="setup-tin"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={15}
              value={tin}
              aria-invalid={Boolean(tinError)}
              onChange={(event) => { setTin(formatTinInput(event.target.value)); setTinError(""); }}
              className={`flex h-11 w-full rounded-xl border bg-card py-2 pl-10 pr-3 font-mono text-sm outline-none transition-colors focus-visible:border-emerald-500 focus-visible:ring-1 focus-visible:ring-emerald-500 ${tinError ? "border-destructive" : "border-input"}`}
              placeholder="000-000-000-000"
            />
          </div>
          <p className="text-xs text-muted-foreground">Enter your 9 or 12 digit BIR-issued individual or business Tax Identification Number.</p>
          {tinSaved && !tin && <p className="text-xs text-muted-foreground">A TIN is securely saved to your account.</p>}
          {tinError && <p role="alert" className="text-xs text-destructive">{tinError}</p>}
        </div>
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Optional tax documents</h3>
            <p className="pl-2 text-xs text-muted-foreground">Reduces or exempts withholding tax.</p>
          </div>
          <TaxDocuments
            setupMode
            refreshKey={documentationVersion}
            loadExistingData={hasClientProfile || hasFreelancerProfile}
          />
        <div className="space-y-3">
          <details className="group overflow-hidden rounded-xl border bg-background/30">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/60 text-muted-foreground"><FileText className="size-4" /></span>
                <span className="min-w-0"><span className="flex flex-wrap items-center gap-2 text-sm font-semibold">BIR Sworn Declaration <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">0.5% Tax Exemption</span></span><span className="mt-0.5 block text-xs text-muted-foreground">Under BIR Revenue Regulation 16-2023</span></span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
            </summary>
            <div className="border-t p-4">
              <FreelancerTaxDeclaration setupMode embedded profileReady={hasFreelancerProfile} />
            </div>
          </details>
        </div>
        </div>
      </section>
      {/* Submit */}
      <VerificationSettings />
      </>}

      <div className="flex flex-col-reverse justify-between gap-2 sm:flex-row">
        {step > 0 ? <Button type="button" variant="outline" onClick={() => setStep((current) => current - 1)}><ArrowLeft /> Back</Button> : <span />}
        {step < setupSteps.length - 1
          ? <Button type="button" onClick={continueToNextStep}>Continue <ArrowRight /></Button>
          : <Button type="button" onClick={finishSetup} disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save and Continue"}</Button>}
      </div>
      {hasFreelancerProfile && <div className="flex justify-end">
        <Button asChild variant="outline"><Link href="/home/dashboard">Continue to Dashboard</Link></Button>
      </div>}
    </fieldset>
  );
}
