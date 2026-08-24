import type { ServiceFormValues } from "../types/service-form.types";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ServicePricingSectionProps = {
  values: ServiceFormValues;
  errors: Partial<Record<keyof ServiceFormValues, string>>;
  onChange: (values: Partial<ServiceFormValues>) => void;
};

export function ServicePricingSection({
  values,
  errors,
  onChange,
}: ServicePricingSectionProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <Label className="text-sm font-semibold">
          Pricing
        </Label>

        <p className="text-xs text-muted-foreground">
          Set the total price clients will pay for this service.
        </p>
      </div>

      {/* Price */}
      <div className="space-y-2">
        <Label
          htmlFor="price"
          className="text-sm font-medium"
        >
          Service Price (PHP)
        </Label>

        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            ₱
          </span>

          <Input
            id="price"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className="pl-8"
            value={values.price ?? ""}
            placeholder="e.g. 5000"
            onChange={(e) =>
              onChange({
                price:
                  e.target.value === ""
                    ? undefined
                    : Number(e.target.value),
              })
            }
          />
        </div>

        {errors.price && (
          <p className="text-xs text-destructive">
            {errors.price}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          {values.serviceType === "milestone"
            ? "This is the total project budget. It will be divided into milestone payments after the client hires you."
            : "Clients will pay this amount for the completed service."}
        </p>
      </div>

      {/* Information */}
      <div className="rounded-lg border bg-muted/20 p-4">
        <p className="text-xs text-muted-foreground">
          You can change your service price anytime from your My Listing page.
        </p>
      </div>
    </div>
  );
}