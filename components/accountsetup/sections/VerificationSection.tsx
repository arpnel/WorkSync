import { Button } from "@/components/ui/button";
import type { FreelancerSetupValues } from "@/types/account-setup.types";
import { AccountSetupFileDropzone } from "./AccountSetupFileDropzone";
type Field = "portfolioSamples" | "certifications";
export function VerificationSection({
  values,
  errors,
  onMultiFileSelect,
  onRemoveFile,
}: {
  values: FreelancerSetupValues;
  errors: Partial<Record<keyof FreelancerSetupValues, string>>;
  onMultiFileSelect: (
    field: Field,
    files: File[],
  ) => void;
  onRemoveFile: (field: Field, index: number) => void;
}) {
  return (
    <div className="space-y-5">
      {(["portfolioSamples", "certifications"] as const).map((field) => {
        const saved =
          field === "portfolioSamples"
            ? values.existingPortfolioSamples
            : values.existingCertifications;
        return (
          <div key={field} className="space-y-2">
            <h4 className="text-sm font-medium">
              {field === "portfolioSamples"
                ? "Portfolio samples"
                : "Certifications"}
            </h4>
            {!!saved?.length && (
              <p className="text-xs text-muted-foreground">
                {saved.length} saved file(s) will be kept.
              </p>
            )}
            {values[field].map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm"
              >
                <span className="truncate">{file.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => onRemoveFile(field, index)}
                >
                  Remove
                </Button>
              </div>
            ))}
            <AccountSetupFileDropzone
              accept="image/png,image/jpeg,image/webp,application/pdf"
              supportedTypes="JPG, PNG, or PDF (up to 5 MB each)"
              multiple
              onFiles={(files) => onMultiFileSelect(field, files)}
            />
            {errors[field] && (
              <p role="alert" className="text-xs text-destructive">
                {errors[field]}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
