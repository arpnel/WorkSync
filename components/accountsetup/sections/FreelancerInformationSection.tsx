import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  EMPLOYMENT_PREFERENCES,
} from "@/constants/account-setup.constants";

import type { FreelancerSetupValues } from "@/types/account-setup.types";
import type {
  Category,
  Skill,
} from "@/services/serviceP/categoryService";

import { FreelancerIndustrySection } from "./FreelancerIndustrySection";
import { FreelancerSkillsSection } from "./FreelancerSkillsSection";

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
    event: React.ChangeEvent<HTMLInputElement>,
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
}: Props) {
  return (
    <section className="rounded-2xl border bg-background p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <h3 className="text-sm font-semibold">
          Freelancer Information
        </h3>

        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-5">
        {/* Years of Experience */}

        <div className="space-y-2">
          <Label htmlFor="yearsOfExperience">
            Years of Experience{" "}
            <span className="text-destructive">*</span>
          </Label>

          <Input
            id="yearsOfExperience"
            type="number"
            min={0}
            max={50}
            value={values.yearsOfExperience || ""}
            onChange={(e) =>
              onChange(
                "yearsOfExperience",
                e.target.value
                  ? parseInt(e.target.value, 10)
                  : 0,
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
            onChange={(categoryIds) =>
              onChange("industries", categoryIds)
            }
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
            onChange={(skillIds) =>
              onChange("skills", skillIds)
            }
          />

          {isLoadingSkills && (
            <p className="text-xs text-muted-foreground">
              Loading skills...
            </p>
          )}
        </div>

        {/* Employment Preference */}

        <div className="space-y-2">
          <Label htmlFor="employmentPreference">
            Employment Preference{" "}
            <span className="text-destructive">*</span>
          </Label>

          <Select
            value={values.employmentPreference}
            onValueChange={(value) =>
              onChange("employmentPreference", value)
            }
          >
            <SelectTrigger id="employmentPreference">
              <SelectValue placeholder="Select preference" />
            </SelectTrigger>

            <SelectContent>
              {EMPLOYMENT_PREFERENCES.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {errors.employmentPreference && (
            <p className="text-xs text-destructive">
              {errors.employmentPreference}
            </p>
          )}
        </div>

        {/* URLs */}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="portfolioWebsite">
              Portfolio Website
            </Label>

            <Input
              id="portfolioWebsite"
              type="url"
              value={values.portfolioWebsite}
              onChange={(e) =>
                onChange(
                  "portfolioWebsite",
                  e.target.value,
                )
              }
              placeholder="https://yourportfolio.com"
            />

            {errors.portfolioWebsite && (
              <p className="text-xs text-destructive">
                {errors.portfolioWebsite}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="linkedIn">
              LinkedIn
            </Label>

            <Input
              id="linkedIn"
              type="url"
              value={values.linkedIn}
              onChange={(e) =>
                onChange("linkedIn", e.target.value)
              }
              placeholder="https://linkedin.com/in/..."
            />

            {errors.linkedIn && (
              <p className="text-xs text-destructive">
                {errors.linkedIn}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="github">
              GitHub
            </Label>

            <Input
              id="github"
              type="url"
              value={values.github}
              onChange={(e) =>
                onChange("github", e.target.value)
              }
              placeholder="https://github.com/..."
            />

            {errors.github && (
              <p className="text-xs text-destructive">
                {errors.github}
              </p>
            )}
          </div>
        </div>

        {/* Resume */}

        <div className="space-y-2">
          <Label htmlFor="resume">
            Resume / CV{" "}
            <span className="text-destructive">*</span>
          </Label>

          <input
            id="resume"
            type="file"
            accept="application/pdf"
            className="block w-full rounded-md border p-2 text-sm"
            onChange={(event) => onFileSelect("resume", event)}
          />

          {values.resume && (
            <p className="text-xs text-muted-foreground">
              {values.resume.name}
            </p>
          )}

          {errors.resume && (
            <p className="text-xs text-destructive">
              {errors.resume}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
