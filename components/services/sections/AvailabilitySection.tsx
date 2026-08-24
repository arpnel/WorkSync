import type { ServiceFormValues } from "../types/service-form.types";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ServiceDeliverySectionProps = {
  values: ServiceFormValues;
  errors: Partial<Record<keyof ServiceFormValues, string>>;
  onChange: (values: Partial<ServiceFormValues>) => void;
};

const serviceTypes = [
  {
    value: "standard",
    label: "Standard Service",
    description:
      "Single delivery after completion. Best for smaller tasks.",
  },
  {
    value: "milestone",
    label: "Milestone Project",
    description:
      "Large projects divided into verified stages.",
  },
];

export function ServiceDeliverySection({
  values,
  errors,
  onChange,
}: ServiceDeliverySectionProps) {
  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <Label className="text-sm font-semibold">
          Service Delivery
        </Label>

        <p className="mt-1 text-xs text-muted-foreground">
          Define how your service will be delivered and verified.
        </p>
      </div>


      {/* Service Type */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">
          Service Type
        </Label>

        <div className="grid gap-3 md:grid-cols-2">
          {serviceTypes.map((type) => {
            const selected =
              values.serviceType === type.value;

            return (
              <button
                key={type.value}
                type="button"
                onClick={() =>
                  onChange({
                    serviceType:
                      type.value as ServiceFormValues["serviceType"],
                  })
                }
                className={cn(
                  "rounded-xl border p-4 text-left transition",
                  "hover:bg-muted/40",
                  selected &&
                    "border-primary bg-primary/5"
                )}
              >
                <p className="text-sm font-medium">
                  {type.label}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {type.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>


      {/* Duration + Revision */}
      <div className="grid gap-6 md:grid-cols-2">

        {/* Duration */}
        <div className="space-y-3">
          <Label
            htmlFor="delivery-time"
            className="text-sm font-medium"
          >
            Expected Duration
          </Label>

          <div className="relative">
            <Input
              id="delivery-time"
              type="number"
              min={1}
              value={values.deliveryTimeDays}
              placeholder="Example: 30"
              onChange={(e) =>
                onChange({
                  deliveryTimeDays:
                    Number(e.target.value) || 0,
                })
              }
            />

            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              days
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            {values.serviceType === "milestone"
              ? "Total estimated project duration."
              : "Time needed to complete and deliver the service."}
          </p>


          {errors.deliveryTimeDays && (
            <p className="text-xs text-destructive">
              {errors.deliveryTimeDays}
            </p>
          )}
        </div>


        {/* Revision */}
        <div className="space-y-3">
          <Label
            htmlFor="revision-count"
            className="text-sm font-medium"
          >
            Revisions Included
          </Label>

          <div className="relative">
            <Input
              id="revision-count"
              type="number"
              min={0}
              value={values.revisionCount}
              placeholder="Example: 3"
              onChange={(e) =>
                onChange({
                  revisionCount:
                    Number(e.target.value) || 0,
                })
              }
            />

            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              revisions
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            Number of change requests included after delivery.
          </p>


          {errors.revisionCount && (
            <p className="text-xs text-destructive">
              {errors.revisionCount}
            </p>
          )}
        </div>

      </div>

    </div>
  );
}