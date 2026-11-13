import type { ServiceFormValues } from "../types/service-form.types";
import type { ListingRole } from "@/services/serviceP/service.types";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RequiredLabel } from "./RequiredLabel";

type Props = {
  values: ServiceFormValues;
  errors: Partial<Record<keyof ServiceFormValues, string>>;
  listingRole: ListingRole;
  onChange: (values: Partial<ServiceFormValues>) => void;
};

export function ServiceDetailsSection({
  values,
  errors,
  listingRole,
  onChange,
}: Props) {
  const noun = listingRole === "client" ? "Job" : "Service";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <RequiredLabel htmlFor="title">{noun} Title</RequiredLabel>
          <span className="shrink-0 text-xs text-muted-foreground">
            {values.title.length}/120
          </span>
        </div>
        <Input
          id="title"
          maxLength={120}
          value={values.title}
          placeholder={
            listingRole === "client"
              ? "Build a responsive company website"
              : "I will design a modern landing page"
          }
          onChange={(event) => onChange({ title: event.target.value })}
        />
        {errors.title && (
          <p className="text-xs text-destructive">{errors.title}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <RequiredLabel htmlFor="description">{noun} Description</RequiredLabel>
          <span className="shrink-0 text-xs text-muted-foreground">
            {values.description.length}/2000
          </span>
        </div>
        <Textarea
          id="description"
          rows={7}
          maxLength={2000}
          value={values.description}
          placeholder={
            listingRole === "client"
              ? "Describe the work, expected deliverables, and requirements."
              : "Describe what you will deliver, your process, and what clients should expect."
          }
          onChange={(event) => onChange({ description: event.target.value })}
        />
        {errors.description && (
          <p className="text-xs text-destructive">{errors.description}</p>
        )}
      </div>
    </div>
  );
}
