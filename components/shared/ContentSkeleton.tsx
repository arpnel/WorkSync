import { Skeleton } from "@/components/ui/skeleton";
import LayoutSkeleton, { type LayoutVariant } from "./LayoutSkeleton";

type Props = {
  label?: string;
  count?: number;
  variant?: "list" | "cards" | "detail" | LayoutVariant;
};

export default function ContentSkeleton({
  label = "Loading content",
  variant = "list",
  count,
}: Props) {
  if (variant !== "list" && variant !== "cards" && variant !== "detail")
    return <LayoutSkeleton variant={variant} label={label} count={count} />;
  return (
    <div role="status" aria-label={label} className="w-full min-w-0 space-y-5">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-5">
        {variant === "detail" && (
          <div className="space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        )}
        <div
          className={
            variant === "cards"
              ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
              : variant === "detail"
                ? "grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
                : "space-y-4"
          }
        >
          {Array.from(
            {
              length:
                count ??
                (variant === "cards" ? 6 : variant === "detail" ? 2 : 4),
            },
            (_, index) => (
              <div
                key={index}
                className="space-y-4 rounded-2xl border bg-card p-5"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 shrink-0 rounded-full" />
                  <Skeleton className="h-5 w-1/2" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                {variant === "detail" && <Skeleton className="h-40 w-full" />}
                <Skeleton className="h-4 w-1/3" />
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
