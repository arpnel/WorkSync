import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

export function InputErrorMessage({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <p
      id={id}
      role="alert"
      className="flex items-center gap-1.5 text-sm leading-5 text-destructive"
    >
      <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
