import { useRef, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import type { FreelancerSetupValues } from "@/types/account-setup.types";
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
    event: ChangeEvent<HTMLInputElement>,
  ) => void;
  onRemoveFile: (field: Field, index: number) => void;
}) {
  const samples = useRef<HTMLInputElement>(null);
  const certificates = useRef<HTMLInputElement>(null);
  return (
    <section className="space-y-5 rounded-2xl border bg-background p-6 shadow-sm">
      <h3 className="text-sm font-semibold">Professional documents</h3>
      <p className="text-sm text-muted-foreground">
        Add work samples and optional certificates. These do not verify your
        identity.
      </p>
      {(["portfolioSamples", "certifications"] as const).map((field) => {
        const ref = field === "portfolioSamples" ? samples : certificates;
        const saved =
          field === "portfolioSamples"
            ? values.existingPortfolioSamples
            : values.existingCertifications;
        return (
          <div key={field} className="space-y-2">
            <h4 className="text-sm font-medium">
              {field === "portfolioSamples"
                ? "Portfolio samples (required)"
                : "Certifications (optional)"}
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
            <input
              ref={ref}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="hidden"
              onChange={(event) => onMultiFileSelect(field, event)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => ref.current?.click()}
            >
              Add{" "}
              {field === "portfolioSamples" ? "work samples" : "certificates"}
            </Button>
            <p className="text-xs text-muted-foreground">
              JPG, PNG, WebP or PDF · Up to 10 MB each · 10 files maximum
            </p>
            {errors[field] && (
              <p role="alert" className="text-xs text-destructive">
                {errors[field]}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
