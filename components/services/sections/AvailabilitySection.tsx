import type { ServiceFormValues } from "../types/service-form.types";
import type { ListingRole } from "@/services/serviceP/service.types";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  values: ServiceFormValues;
  errors: Partial<Record<keyof ServiceFormValues, string>>;
  listingRole: ListingRole;
  onChange: (values: Partial<ServiceFormValues>) => void;
};

const minimumDeadline = new Date(Date.now() + 86400000)
  .toISOString()
  .slice(0, 10);

const serviceTypes = [
  {
    value: "standard",
    label: "Standard Service",
    description: "Single delivery after completion.",
  },
  {
    value: "milestone",
    label: "Milestone Project",
    description: "Work divided into defined stages.",
  },
] as const;

export function ServiceDeliverySection({
  values,
  errors,
  listingRole,
  onChange,
}: Props) {
  if (listingRole === "client") {
    return (
      <div className="space-y-3">
        <Label htmlFor="deadline">Project Deadline</Label>
        <Input
          id="deadline"
          type="date"
          min={minimumDeadline}
          value={values.deadline}
          onChange={(event) => onChange({ deadline: event.target.value })}
        />
        {errors.deadline && (
          <p className="text-xs text-destructive">{errors.deadline}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2">
        {serviceTypes.map((type) => (
          <button
            key={type.value}
            type="button"
            onClick={() => onChange({ serviceType: type.value })}
            className={cn(
              "rounded-xl border p-4 text-left transition hover:bg-muted/40",
              values.serviceType === type.value &&
                "border-primary bg-primary/5",
            )}
          >
            <p className="text-sm font-medium">{type.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {type.description}
            </p>
          </button>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="delivery-time">Expected Duration</Label>
          <Input
            id="delivery-time"
            type="number"
            min={1}
            value={values.deliveryTimeDays}
            onChange={(event) =>
              onChange({ deliveryTimeDays: Number(event.target.value) || 0 })
            }
          />
          {errors.deliveryTimeDays && (
            <p className="text-xs text-destructive">
              {errors.deliveryTimeDays}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="revision-count">Revisions Included</Label>
          <Input
            id="revision-count"
            type="number"
            min={0}
            value={values.revisionCount}
            onChange={(event) =>
              onChange({ revisionCount: Number(event.target.value) || 0 })
            }
          />
          {errors.revisionCount && (
            <p className="text-xs text-destructive">{errors.revisionCount}</p>
          )}
        </div>
      </div>
    </div>
  );
}
