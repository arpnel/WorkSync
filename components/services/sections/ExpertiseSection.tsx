import type { ServiceFormValues } from "../types/service-form.types";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const levels = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "expert", label: "Expert" },
] as const;

type Props = {
  values: ServiceFormValues;
  errors: Partial<Record<keyof ServiceFormValues, string>>;
  onChange: (values: Partial<ServiceFormValues>) => void;
};

export function JobExpertiseSection({ values, errors, onChange }: Props) {
  return (
    <div className="space-y-3 md:col-span-2">
      <Label>Expected Expertise</Label>
      <div
        className="grid grid-cols-3 gap-2"
        role="group"
        aria-label="Expected expertise"
      >
        {levels.map((level) => (
          <button
            key={level.value}
            type="button"
            aria-pressed={values.experienceLevel === level.value}
            onClick={() => onChange({ experienceLevel: level.value })}
            className={cn(
              "min-w-0 rounded-md border px-3 py-2.5 text-sm font-medium transition hover:bg-muted",
              values.experienceLevel === level.value &&
                "border-primary bg-primary/5 text-primary",
            )}
          >
            {level.label}
          </button>
        ))}
      </div>
      {errors.experienceLevel && (
        <p className="text-xs text-destructive">{errors.experienceLevel}</p>
      )}
    </div>
  );
}
