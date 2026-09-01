import type { ServiceFormValues } from "../types/service-form.types";
import type { ListingRole } from "@/services/serviceP/service.types";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
          step={1}
          placeholder="e.g. 15000"
          value={values.budgetMax ?? ""}
          onChange={(event) =>
            onChange({
              budgetMin: 0,
              budgetMax: event.target.value
                ? Number(event.target.value)
                : undefined,
              pricingType: "fixed",
            })
          }
        />
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
