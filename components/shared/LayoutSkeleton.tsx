import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export type LayoutVariant =
  | "profile"
  | "workspace"
  | "projects"
  | "requests"
  | "service"
  | "job"
  | "analytics"
  | "work-analytics"
  | "reports"
  | "dashboard"
  | "dashboard-charts"
  | "account-settings"
  | "notification-settings"
  | "verification-settings"
  | "contacts"
  | "table"
  | "notifications"
  | "calendar"
  | "marketplace"
  | "listings"
  | "recommendation"
  | "similar"
  | "messages"
  | "setup";

function Lines({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          key={i}
          className={i === count - 1 ? "h-4 w-2/3" : "h-4 w-full"}
        />
      ))}
    </div>
  );
}
function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`min-w-0 space-y-5 rounded-xl border bg-card p-5 ${className}`}
    >
      {children}
    </div>
  );
}
function Toolbar() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Skeleton className="h-10 w-48 max-w-full flex-1" />
      <Skeleton className="h-10 w-28" />
      <Skeleton className="h-10 w-24" />
    </div>
  );
}
function Stats() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Panel key={i}>
          <Skeleton className="h-4 w-24 max-w-full" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-28 max-w-full" />
        </Panel>
      ))}
    </div>
  );
}
function Chart({ heightClass = "h-64" }: { heightClass?: string } = {}) {
  return (
    <Panel>
      <Skeleton className="h-5 w-40 max-w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div
        className={`flex ${heightClass} items-end gap-3 border-b border-l px-4 pt-5`}
      >
        {[40, 65, 50, 85, 60, 95].map((height, i) => (
          <Skeleton
            key={i}
            className="min-w-0 flex-1 rounded-b-none"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </Panel>
  );
}
function Rows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <Panel key={i}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-5 w-48 max-w-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-2 w-full max-w-xl" />
            </div>
            <div className="flex gap-6">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-24" />
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}
function TableRows({ count = 5 }: { count?: number }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[460px] divide-y">
        <div className="grid grid-cols-4 gap-4 py-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-4 w-20" />
          ))}
        </div>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="grid grid-cols-4 items-center gap-4 py-4">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
function Chat() {
  return (
    <Panel className="flex h-[min(65dvh,560px)] min-h-[380px] flex-col">
      <div className="flex justify-between gap-3 border-b pb-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="flex-1 space-y-4">
        <Skeleton className="h-12 w-3/4 rounded-2xl" />
        <Skeleton className="ml-auto h-16 w-2/3 rounded-2xl" />
        <Skeleton className="h-12 w-1/2 rounded-2xl" />
      </div>
      <Skeleton className="h-12 w-full rounded-xl" />
    </Panel>
  );
}
function Calendar() {
  return (
    <div className="@container space-y-5">
      <Skeleton className="h-10 w-48" />
      <div className="grid overflow-hidden rounded-3xl border bg-card @min-[900px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5 sm:px-7 sm:py-6 @min-[900px]:col-span-2">
          <div className="space-y-2">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="min-w-0 space-y-3 p-3 sm:p-5">
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="mx-auto h-4 w-6 sm:w-10" />
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 35 }, (_, i) => (
              <div
                key={i}
                className="h-16 space-y-3 rounded-xl border p-2 sm:h-28"
              >
                <Skeleton className="size-5 rounded-full" />
                <Skeleton className="hidden h-4 w-full sm:block" />
              </div>
            ))}
          </div>
        </div>
        <aside className="space-y-4 border-t p-5 @min-[900px]:border-t-0 @min-[900px]:border-l">
          <Skeleton className="h-6 w-36" />
          <Lines count={2} />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </aside>
      </div>
    </div>
  );
}

function Shape({ variant, count }: { variant: LayoutVariant; count?: number }) {
  switch (variant) {
    case "table":
      return <TableRows count={count} />;
    case "projects":
      return <Rows count={count} />;
    case "requests":
      return (
        <>
          <Panel>
            <Toolbar />
          </Panel>
          <Panel>
            <Lines count={2} />
            <TableRows count={count ?? 3} />
          </Panel>
        </>
      );
    case "profile":
      return (
        <div className="mx-auto max-w-6xl space-y-6 py-2">
          <div className="overflow-hidden rounded-2xl border bg-card">
            <Skeleton className="h-32 w-full rounded-none sm:h-44 lg:h-48" />
            <div className="px-4 pb-5 sm:px-6 sm:pb-6">
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end">
                <Skeleton className="-mt-10 size-24 shrink-0 rounded-full border-4 border-background" />
                <div className="flex-1 space-y-3 pt-4">
                  <Skeleton className="h-7 w-52 max-w-full" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <Skeleton className="h-9 w-28" />
              </div>
            </div>
          </div>
          <Panel>
            <Skeleton className="h-6 w-20" />
            <Lines count={2} />
            <div className="grid gap-4 border-t pt-5 md:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Lines key={i} count={2} />
              ))}
            </div>
          </Panel>
          <Skeleton className="h-5 w-64 max-w-full" />
          <div className="flex gap-3 border-b pb-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-24" />
            ))}
          </div>
          <Stats />
          <div className="grid gap-6 md:grid-cols-2">
            <Panel>
              <Lines count={5} />
            </Panel>
            <Panel>
              <Lines count={5} />
            </Panel>
          </div>
        </div>
      );
    case "workspace":
      return (
        <div className="mx-auto max-w-[1440px] space-y-6">
          <div className="space-y-3 border-b pb-5">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-5 w-64 max-w-full" />
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)] xl:grid-cols-[minmax(0,1fr)_440px]">
            <div className="space-y-5">
              <Panel>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-10" />
                </div>
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </Panel>
              <Panel>
                <Toolbar />
                <Lines count={2} />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-52 w-full" />
              </Panel>
            </div>
            <div className="space-y-5">
              <Panel>
                <Skeleton className="h-6 w-40" />
                <Lines count={3} />
                <Skeleton className="h-9 w-28" />
                <Skeleton className="h-10 w-full" />
              </Panel>
              <Chat />
            </div>
          </div>
        </div>
      );
    case "service":
      return (
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-6">
              <Skeleton className="h-48 w-full rounded-2xl sm:h-72" />
              <Panel>
                <Skeleton className="h-8 w-3/4" />
                <Lines count={5} />
              </Panel>
            </div>
            <Panel>
              <Skeleton className="size-16 rounded-full" />
              <Lines count={3} />
              <Skeleton className="h-10 w-full" />
              <Lines count={4} />
              <Skeleton className="h-11 w-full" />
            </Panel>
          </div>
        </div>
      );
    case "job":
      return (
        <div className="mx-auto max-w-6xl space-y-5">
          <Skeleton className="h-9 w-32" />
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
            <Panel>
              <Skeleton className="h-7 w-3/4" />
              <Lines count={7} />
            </Panel>
            <Panel>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-28 w-full" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
              <Skeleton className="h-10 w-full" />
            </Panel>
          </div>
        </div>
      );
    case "work-analytics":
      return (
        <div className="@container space-y-6">
          <div className="grid grid-cols-12 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Panel
                key={i}
                className="col-span-12 @min-[560px]:col-span-6 @min-[1100px]:col-span-3"
              >
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-3 w-36 max-w-full" />
              </Panel>
            ))}
          </div>
          <Skeleton className="h-3 w-96 max-w-full" />
          <div className="grid grid-cols-12 gap-5">
            <div className="col-span-12 @min-[1000px]:col-span-8">
              <Chart heightClass="h-72 sm:h-80" />
            </div>
            <Panel className="col-span-12 @min-[1000px]:col-span-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mx-auto size-44 rounded-full" />
              <Lines />
            </Panel>
            <div className="col-span-12 @min-[900px]:col-span-6">
              <Chart heightClass="h-60" />
            </div>
            <div className="col-span-12 @min-[900px]:col-span-6">
              <Chart heightClass="h-60" />
            </div>
          </div>
          <Panel>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-10 w-52" />
            <TableRows />
          </Panel>
        </div>
      );
    case "analytics":
    case "reports":
      return (
        <div className="@container space-y-6">
          {variant === "reports" ? (
            <Toolbar />
          ) : (
            <Skeleton className="h-5 w-64 max-w-full" />
          )}
          {variant === "reports" && <Stats />}
          <div className="grid min-w-0 gap-5 @min-[640px]:grid-cols-2">
            <Chart />
            <Chart />
          </div>
          <Panel>
            <TableRows />
          </Panel>
        </div>
      );
    case "dashboard-charts":
      return (
        <div className="@container space-y-6">
          <Skeleton className="h-5 w-48" />
          <Chart heightClass="h-64 sm:h-72" />
          <div className="grid gap-5 @min-[640px]:grid-cols-2">
            <Chart />
            <Chart />
          </div>
          <Panel>
            <Skeleton className="h-6 w-40" />
            <TableRows />
          </Panel>
        </div>
      );
    case "dashboard":
      return (
        <div className="@container grid min-w-0 grid-cols-12 gap-6 @min-[900px]:grid-cols-[minmax(0,1fr)_320px]">
          <div className="col-span-12 @min-[900px]:col-span-1 @min-[900px]:col-start-1">
            <Stats />
          </div>
          <div className="col-span-12 space-y-6 @min-[900px]:col-span-1 @min-[900px]:col-start-1">
            <Skeleton className="h-5 w-36" />
            <Chart heightClass="h-64 sm:h-72" />
            <div className="grid gap-5 @min-[640px]:grid-cols-2">
              <Chart />
              <Chart />
            </div>
            <Panel>
              <Skeleton className="h-6 w-40" />
              <TableRows />
            </Panel>
          </div>
          <aside className="col-span-12 space-y-5 @min-[900px]:col-span-1 @min-[900px]:col-start-2 @min-[900px]:row-start-1 @min-[900px]:row-span-2">
            <Panel>
              <Skeleton className="h-6 w-36" />
              <Lines count={6} />
            </Panel>
            <Panel>
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-64 w-full" />
              <Lines count={5} />
            </Panel>
            <Panel>
              <Skeleton className="h-6 w-40" />
              <Lines count={4} />
            </Panel>
          </aside>
        </div>
      );
    case "account-settings":
      return (
        <>
          {[2, 5, 1].map((rows, i) => (
            <Panel key={i}>
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-4 w-3/4" />
              {Array.from({ length: rows }, (_, j) => (
                <Skeleton key={j} className="h-10 w-full max-w-md" />
              ))}
            </Panel>
          ))}
        </>
      );
    case "notification-settings":
      return (
        <Panel>
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-3/4" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-4" />
              <Skeleton className="h-4 w-48 max-w-full" />
            </div>
          ))}
          <Skeleton className="h-9 w-28" />
        </Panel>
      );
    case "verification-settings":
      return (
        <Panel>
          <Skeleton className="h-6 w-40" />
          <Lines count={2} />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-10 w-40" />
        </Panel>
      );
    case "contacts":
      return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: count ?? 6 }, (_, i) => (
            <Panel key={i}>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-24" />
            </Panel>
          ))}
        </div>
      );
    case "notifications":
      return (
        <>
          <Skeleton className="h-5 w-20" />
          <div className="space-y-2">
            {Array.from({ length: count ?? 5 }, (_, i) => (
              <div key={i} className="flex gap-4 rounded-lg border p-4">
                <Skeleton className="size-10 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        </>
      );
    case "calendar":
      return <Calendar />;
    case "marketplace":
    case "listings":
      return (
        <div
          className={
            variant === "marketplace"
              ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
              : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          }
        >
          {Array.from(
            { length: count ?? (variant === "marketplace" ? 8 : 6) },
            (_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-lg border bg-card"
              >
                <Skeleton className="aspect-[1.7/1] w-full rounded-none" />
                <div className="space-y-4 p-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-8 rounded-full" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                  <Lines count={2} />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
              </div>
            ),
          )}
        </div>
      );
    case "recommendation":
      return (
        <Panel>
          <Skeleton className="aspect-video w-full sm:aspect-[1.8/1]" />
          <Skeleton className="h-7 w-3/4" />
          <Lines count={3} />
          <Skeleton className="h-10 w-32" />
        </Panel>
      );
    case "similar":
      return (
        <Panel>
          <Skeleton className="aspect-video w-full" />
          <Skeleton className="h-5 w-3/4" />
          <Lines count={2} />
          <Skeleton className="h-9 w-full" />
        </Panel>
      );
    case "messages":
      return (
        <div className="flex h-[calc(100dvh-6rem)] overflow-hidden rounded-xl border sm:h-[calc(100dvh-7rem)]">
          <div className="w-full shrink-0 space-y-4 border-r p-4 md:w-80 lg:w-96">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-9 w-full" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <Skeleton className="size-12 shrink-0 rounded-full" />
                <div className="flex-1">
                  <Lines count={2} />
                </div>
              </div>
            ))}
          </div>
          <div className="hidden min-w-0 flex-1 p-4 md:block">
            <Chat />
          </div>
        </div>
      );
    case "setup":
      return (
        <div className="mx-auto max-w-2xl space-y-8">
          {Array.from({ length: count ?? 3 }, (_, i) => (
            <Panel key={i}>
              <Skeleton className="h-5 w-40" />
              <div className="grid gap-5 sm:grid-cols-2">
                {[0, 1, 2, 3].map((j) => (
                  <div key={j} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      );
  }
}

export default function LayoutSkeleton({
  variant,
  label = "Loading content",
  count,
}: {
  variant: LayoutVariant;
  label?: string;
  count?: number;
}) {
  return (
    <div role="status" aria-label={label} className="w-full min-w-0">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-5">
        <Shape variant={variant} count={count} />
      </div>
    </div>
  );
}
