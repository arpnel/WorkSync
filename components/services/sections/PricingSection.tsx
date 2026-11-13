import type { ServiceFormValues } from "../types/service-form.types";
import type { ListingRole } from "@/services/serviceP/service.types";

import { Input } from "@/components/ui/input";
import { RequiredLabel } from "./RequiredLabel";
import {
  MAX_JOB_BUDGET_PHP,
  MAX_SERVICE_PRICE_PHP,
  MAX_STANDARD_SERVICE_PRICE_PHP,
  MIN_SERVICE_PRICE_PHP,
} from "@/lib/validation/service.creation.validation";

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
        <RequiredLabel htmlFor="budget-max">Maximum Budget (PHP)</RequiredLabel>
        <Input
          id="budget-max"
          type="number"
          inputMode="numeric"
          min={MIN_SERVICE_PRICE_PHP}
          max={values.serviceType === "standard" ? MAX_STANDARD_SERVICE_PRICE_PHP : MAX_JOB_BUDGET_PHP}
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
          {values.serviceType === "standard"
            ? "Enter a budget between PHP 100 and PHP 10,000. For amounts over PHP 10,000, please use Milestone billing."
            : "Milestone budget: up to PHP 100,000."}
        </p>
        {errors.budgetMax && (
          <p className="text-xs text-destructive">{errors.budgetMax}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <RequiredLabel htmlFor="price">Service price (PHP)</RequiredLabel>
      <Input
        id="price"
        type="number"
        inputMode="numeric"
        min={MIN_SERVICE_PRICE_PHP}
        max={values.serviceType === "standard" ? MAX_STANDARD_SERVICE_PRICE_PHP : MAX_SERVICE_PRICE_PHP}
        step={1}
        placeholder={values.serviceType === "standard" ? "100–10,000" : "e.g. 15000"}
        value={values.price ?? ""}
        onChange={(event) => {
          const amount = event.target.value ? Number(event.target.value) : undefined;
          onChange({
            price:
              amount === undefined
                ? undefined
                : Number.isFinite(amount)
                  ? Math.min(amount, MAX_SERVICE_PRICE_PHP)
                  : MAX_SERVICE_PRICE_PHP,
          });
        }}
      />
      <p className="text-xs text-muted-foreground">
        {values.serviceType === "standard"
          ? "Enter an amount between PHP 100 and PHP 10,000. For amounts over PHP 10,000, please use Milestone billing."
          : "Milestone price: up to PHP 100,000."}
      </p>
      {errors.price && (
        <p className="text-xs text-destructive">{errors.price}</p>
      )}
    </div>
  );
}
