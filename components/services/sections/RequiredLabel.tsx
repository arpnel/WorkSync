import type { ComponentProps, ReactNode } from "react";
import { Label } from "@/components/ui/label";

export function RequiredLabel({
  children,
  ...props
}: ComponentProps<typeof Label> & { children: ReactNode }) {
  return (
    <Label {...props}>
      {children}
      <span aria-hidden="true" className="ml-1 text-destructive">*</span>
      <span className="sr-only"> required</span>
    </Label>
  );
}
