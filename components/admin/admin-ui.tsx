import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
const tones = {
  neutral: "border-border bg-muted/30 text-foreground",
  orange:
    "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300",
  blue: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
  violet:
    "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
  green:
    "border-green-300 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300",
  red: "border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
};
export type AdminTone = keyof typeof tones;
export function AdminStats({
  items,
}: {
  items: { label: string; value: number; tone: AdminTone }[];
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-4",
        items.length === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4",
      )}
    >
      {items.map((item) => (
        <Card
          key={item.label}
          className={cn(
            "gap-2 rounded-lg border p-4 shadow-none ring-0",
            tones[item.tone],
          )}
        >
          <p className="text-sm font-medium">{item.label}</p>
          <p className="text-3xl font-semibold tabular-nums">{item.value}</p>
        </Card>
      ))}
    </div>
  );
}
export function AdminStatus({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: AdminTone;
}) {
  return (
    <Badge className={cn("rounded-full border", tones[tone])}>{children}</Badge>
  );
}
export function InfoSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}
export function InfoField({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="mt-1 text-sm break-words">{value}</div>
      </div>
    </div>
  );
}
export const approvalClass = "bg-green-600 text-white hover:bg-green-700";
export const reviewDialogClass = "max-h-[85dvh] overflow-y-auto sm:max-w-xl";
export function ReviewFeedback({ message }: { message: string }) {
  return message ? (
    <p role="status" className="rounded-lg border bg-muted/30 p-3 text-sm">
      {message}
    </p>
  ) : null;
}
