import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
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
            <AccountSetupFileDropzone
              accept="image/png,image/jpeg,image/webp,application/pdf"
              supportedTypes="JPG, PNG, or PDF (up to 5 MB each)"
              multiple
              onFiles={(files) => onMultiFileSelect(field, files)}
            />
            {values[field].map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/30 p-3"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm font-medium text-foreground">{file.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {file.type.startsWith("image/") ? "Image" : "PDF document"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => onRemoveFile(field, index)}
                >
                  Remove
                </Button>
              </div>
            ))}
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
