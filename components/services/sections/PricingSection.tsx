import type { ServiceFormValues } from "../types/service-form.types";
import type { ListingRole } from "@/services/serviceP/service.types";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_JOB_BUDGET_PHP } from "@/lib/validation/service.creation.validation";

type Props = {
  values: ServiceFormValues;
  errors: Partial<Record<keyof ServiceFormValues, string>>;
  listingRole: ListingRole;
  onChange: (values: Partial<ServiceFormValues>) => void;
};

export function ServicePricingSection({
  values,
  errors,
  listingRole,
  onChange,
}: Props) {
  const isJob = listingRole === "client";

  if (isJob) {
    return (
      <div className="space-y-3">
        <Label htmlFor="budget-max">Maximum Budget (PHP)</Label>
        <Input
          id="budget-max"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_JOB_BUDGET_PHP}
          step={1}
          placeholder="e.g. 15000"
          value={values.budgetMax ?? ""}
          onChange={(event) => {
            const rawValue = event.target.value;
            const amount = rawValue ? Number(rawValue) : undefined;
            onChange({
              budgetMin: 0,
              budgetMax:
                amount === undefined
                  ? undefined
                  : Number.isFinite(amount)
                    ? Math.min(amount, MAX_JOB_BUDGET_PHP)
                    : MAX_JOB_BUDGET_PHP,
              pricingType: "fixed",
            });
          }}
        />
        <p className="text-xs text-muted-foreground">
          Maximum project budget: PHP 100,000.
        </p>
        {errors.budgetMax && (
          <p className="text-xs text-destructive">{errors.budgetMax}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Label htmlFor="price">Minimum Estimated Price (PHP)</Label>
      <Input
        id="price"
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        placeholder="e.g. 5000"
        value={values.price ?? ""}
        onChange={(event) =>
          onChange({
            price: event.target.value ? Number(event.target.value) : undefined,
          })
        }
      />
      {errors.price && (
        <p className="text-xs text-destructive">{errors.price}</p>
      )}
    </div>
  );
}
