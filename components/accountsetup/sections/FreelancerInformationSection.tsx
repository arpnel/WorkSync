import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import type { FreelancerSetupValues } from "@/types/account-setup.types";
import type { Category, Skill } from "@/services/serviceP/categoryService";

import { FreelancerIndustrySection } from "./FreelancerIndustrySection";
import { FreelancerSkillsSection } from "./FreelancerSkillsSection";
import { AccountSetupFileDropzone } from "./AccountSetupFileDropzone";
import { VerificationSection } from "./VerificationSection";

type Props = {
  values: FreelancerSetupValues;

  categories: Category[];
  allSkills: Skill[];
  recommendedSkills: Skill[];

  isLoadingCategories: boolean;
  isLoadingSkills: boolean;

  errors: Partial<Record<keyof FreelancerSetupValues, string>>;

  onChange: (
    field: keyof FreelancerSetupValues,
    value: FreelancerSetupValues[keyof FreelancerSetupValues],
  ) => void;

  onFileSelect: (
    field: keyof FreelancerSetupValues,
    file: File,
  ) => void;
  onMultiFileSelect: (
    field: "portfolioSamples" | "certifications",
    files: File[],
  ) => void;
  onRemoveDocument: (
    field: "portfolioSamples" | "certifications",
    index: number,
  ) => void;
};

export function FreelancerInformationSection({
  values,
  categories,
  allSkills,
  recommendedSkills,
  isLoadingCategories,
  isLoadingSkills,
  errors,
  onChange,
  onFileSelect,
  onMultiFileSelect,
  onRemoveDocument,
}: Props) {
  return (
    <section className="rounded-2xl border bg-background p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <h3 className="text-sm font-semibold">Freelancer Information</h3>

        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="headline">Professional headline</Label>
          <Input
            id="headline"
            aria-invalid={!!errors.headline}
            maxLength={120}
            value={values.headline ?? ""}
            onChange={(event) => onChange("headline", event.target.value)}
            placeholder="e.g. Web developer and UI designer"
          />
          {errors.headline && (
            <p className="text-xs text-destructive">{errors.headline}</p>
          )}
        </div>
        {/* Years of Experience */}

        <div className="space-y-2">
          <Label htmlFor="yearsOfExperience">
            Years of Experience <span className="text-destructive">*</span>
          </Label>

          <Input
            id="yearsOfExperience"
            aria-invalid={!!errors.yearsOfExperience}
            type="number"
            min={0}
            max={50}
            step={1}
            value={values.yearsOfExperience}
            onChange={(e) =>
              onChange(
                "yearsOfExperience",
                e.target.value ? Number(e.target.value) : 0,
              )
            }
          />

          {errors.yearsOfExperience && (
            <p className="text-xs text-destructive">
              {errors.yearsOfExperience}
            </p>
          )}
        </div>

        {/* Industries */}

        <div className="space-y-3">
          <FreelancerIndustrySection
            selectedCategoryIds={values.industries}
            categories={categories}
            error={errors.industries}
            onChange={(categoryIds) => onChange("industries", categoryIds)}
          />

          {isLoadingCategories && (
            <p className="text-xs text-muted-foreground">
              Loading industries...
            </p>
          )}
        </div>

        {/* Skills */}

        <div className="space-y-3">
          <FreelancerSkillsSection
            industryIds={values.industries}
            industries={categories.filter((category) =>
              values.industries.includes(category.id),
            )}
            recommendedSkills={recommendedSkills}
            allSkills={allSkills}
            selectedSkillIds={values.skills}
            error={errors.skills}
            onChange={(skillIds) => onChange("skills", skillIds)}
          />

          {isLoadingSkills && (
            <p className="text-xs text-muted-foreground">Loading skills...</p>
          )}
        </div>

        {/* URLs */}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="linkedIn">LinkedIn</Label>

            <Input
              id="linkedIn"
              aria-invalid={!!errors.linkedIn}
              type="url"
              value={values.linkedIn}
              onChange={(e) => onChange("linkedIn", e.target.value)}
              placeholder="https://linkedin.com/in/..."
            />

            {errors.linkedIn && (
              <p className="text-xs text-destructive">{errors.linkedIn}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="github">GitHub</Label>

            <Input
              id="github"
              aria-invalid={!!errors.github}
              type="url"
              value={values.github}
              onChange={(e) => onChange("github", e.target.value)}
              placeholder="https://github.com/..."
            />

            {errors.github && (
              <p className="text-xs text-destructive">{errors.github}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="portfolioWebsite">Portfolio website</Label>
          <Input
            id="portfolioWebsite"
            aria-invalid={!!errors.portfolioWebsite}
            type="url"
            value={values.portfolioWebsite ?? ""}
            onChange={(event) => onChange("portfolioWebsite", event.target.value)}
            placeholder="yourportfolio.dev"
          />
          <p className="text-xs text-muted-foreground">
            Add any portfolio domain, such as yourportfolio.dev or opreko.website. You can enter it with or without https://.
          </p>
          {errors.portfolioWebsite && (
            <p className="text-xs text-destructive">{errors.portfolioWebsite}</p>
          )}
        </div>

        {/* Resume */}

        <div className="space-y-2">
          <Label htmlFor="resume">Resume / CV</Label>

          <AccountSetupFileDropzone
            accept="application/pdf,.pdf"
            supportedTypes="PDF (up to 5 MB)"
            invalid={!!errors.resume}
            onFiles={(files) => {
              if (files[0]) onFileSelect("resume", files[0]);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            {values.resume && (
              <>
                <span className="break-all text-sm text-muted-foreground">
                  {values.resume.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onChange("resume", null)}
                >
                  Remove
                </Button>
              </>
            )}
          </div>

          {values.existingResumeUrl && !values.resume && (
            <p className="text-sm text-muted-foreground">
              Your saved resume will be kept. Choose a PDF to replace it.
            </p>
          )}
          {values.resume && (
            <p className="text-xs text-muted-foreground">
              {values.resume.name}
            </p>
          )}

          {errors.resume && (
            <p className="text-xs text-destructive">{errors.resume}</p>
          )}
        </div>

        <VerificationSection
          values={values}
          errors={errors}
          onMultiFileSelect={onMultiFileSelect}
          onRemoveFile={onRemoveDocument}
        />
      </div>
    </section>
  );
}
