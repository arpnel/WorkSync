import { CalendarDays } from "lucide-react";

export function PremiumExpiryNotice({
  periodEndsAt,
  now,
}: {
  periodEndsAt: string;
  now: number | null;
}) {
  const end = new Date(periodEndsAt);
  const remainingMs = now == null ? null : end.getTime() - now;
  const remainingDays = remainingMs == null ? null : Math.max(1, Math.ceil(remainingMs / 86_400_000));
  const endingSoon = remainingMs != null && remainingMs <= 7 * 86_400_000;
  const dateLabel = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(end);

  return (
    <div
      role="status"
      className={`rounded-xl border p-4 ${endingSoon ? "border-amber-500/40 bg-amber-500/5" : "border-primary/30 bg-primary/5"}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background/80 text-primary">
          <CalendarDays className="size-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Premium access ends
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight">
            {dateLabel} Philippine Time
          </p>
          <p className={`mt-1 text-sm font-medium ${endingSoon ? "text-amber-700 dark:text-amber-300" : "text-primary"}`}>
            {remainingMs == null
              ? "Checking time remaining…"
              : remainingMs < 86_400_000
                ? "Less than 24 hours remaining"
                : `${remainingDays} ${remainingDays === 1 ? "day" : "days"} remaining`}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Access returns to Free at that time. Renewals are manual; you will
            not be charged automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
