import { useRef, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { Upload, Shield, FolderOpen, Award } from "lucide-react";

import type { FreelancerSetupValues } from "@/types/account-setup.types";

type Props = {
  values: FreelancerSetupValues;

  errors: Partial<Record<keyof FreelancerSetupValues, string>>;

  onChange: (
    field: keyof FreelancerSetupValues,
    value: FreelancerSetupValues[keyof FreelancerSetupValues],
  ) => void;

  onFileSelect: (
    field: keyof FreelancerSetupValues,
    event: ChangeEvent<HTMLInputElement>,
  ) => void;

  onMultiFileSelect: (
    field: "portfolioSamples" | "certifications",
    event: ChangeEvent<HTMLInputElement>,
  ) => void;

  onRemoveFile: (
    field: "portfolioSamples" | "certifications",
    index: number,
  ) => void;
};

export function VerificationSection({
  values,
  errors,
  onChange,
  onFileSelect,
  onMultiFileSelect,
  onRemoveFile,
}: Props) {
  const govIdInputRef = useRef<HTMLInputElement>(null);
  const samplesInputRef = useRef<HTMLInputElement>(null);
  const certsInputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="rounded-2xl border bg-background p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <h3 className="text-sm font-semibold">Verification</h3>

        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-5">
        {/* Government ID */}

        <div className="space-y-2">
          <Label>
            Government ID <span className="text-destructive">*</span>
          </Label>

          <input
            ref={govIdInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="hidden"
            onChange={(event) => onFileSelect("governmentId", event)}
          />

          {values.governmentId ? (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              <Shield className="size-5 text-muted-foreground" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {values.governmentId.name}
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange("governmentId", null)}
              >
                &times;
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => govIdInputRef.current?.click()}
              className="
                flex
                w-full
                items-center
                justify-center
                gap-2
                rounded-lg
                border-2
                border-dashed
                p-4
                text-sm
                transition-colors
                hover:bg-muted/40
              "
            >
              <Upload className="size-5 text-muted-foreground" />

              <span className="text-muted-foreground">
                Upload Government ID
              </span>
            </button>
          )}

          {errors.governmentId && (
            <p className="text-xs text-destructive">{errors.governmentId}</p>
          )}
        </div>

        {/* Portfolio Samples */}

        <div className="space-y-2">
          <Label>
            Portfolio Samples <span className="text-destructive">*</span>
          </Label>

          <input
            ref={samplesInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="hidden"
            onChange={(event) => onMultiFileSelect("portfolioSamples", event)}
          />

          <div className="flex flex-wrap gap-2">
            {values.portfolioSamples.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="
                  flex
                  items-center
                  gap-2
                  rounded-lg
                  border
                  bg-muted/30
                  p-2
                  text-sm
                "
              >
                <FolderOpen className="size-4 text-muted-foreground" />

                <span className="max-w-[200px] truncate">{file.name}</span>

                <button
                  type="button"
                  onClick={() => onRemoveFile("portfolioSamples", index)}
                  className="
                    text-destructive
                    hover:text-destructive/80
                  "
                >
                  &times;
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => samplesInputRef.current?.click()}
            className="
              flex
              w-full
              items-center
              justify-center
              gap-2
              rounded-lg
              border-2
              border-dashed
              p-4
              text-sm
              transition-colors
              hover:bg-muted/40
            "
          >
            <Upload className="size-5 text-muted-foreground" />

            <span className="text-muted-foreground">Add portfolio sample</span>
          </button>

          {errors.portfolioSamples && (
            <p className="text-xs text-destructive">
              {errors.portfolioSamples}
            </p>
          )}
        </div>

        {/* Certifications */}

        <div className="space-y-2">
          <Label>Certifications (Optional)</Label>

          <input
            ref={certsInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="hidden"
            onChange={(event) => onMultiFileSelect("certifications", event)}
          />

          <div className="flex flex-wrap gap-2">
            {values.certifications.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="
                  flex
                  items-center
                  gap-2
                  rounded-lg
                  border
                  bg-muted/30
                  p-2
                  text-sm
                "
              >
                <Award className="size-4 text-muted-foreground" />

                <span className="max-w-[200px] truncate">{file.name}</span>

                <button
                  type="button"
                  onClick={() => onRemoveFile("certifications", index)}
                  className="
                    text-destructive
                    hover:text-destructive/80
                  "
                >
                  &times;
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => certsInputRef.current?.click()}
            className="
              flex
              w-full
              items-center
              justify-center
              gap-2
              rounded-lg
              border-2
              border-dashed
              p-4
              text-sm
              transition-colors
              hover:bg-muted/40
            "
          >
            <Upload className="size-5 text-muted-foreground" />

            <span className="text-muted-foreground">Upload certifications</span>
          </button>
        </div>
      </div>
    </section>
  );
}
