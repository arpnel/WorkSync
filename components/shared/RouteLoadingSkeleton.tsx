"use client";
import { usePathname } from "next/navigation";
import ContentSkeleton from "./ContentSkeleton";
import type { LayoutVariant } from "./LayoutSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function RouteLoadingSkeleton() {
  const path = usePathname().toLowerCase();
  let variant: LayoutVariant = "table";
  let title = "";
  let width = "";
  let toolbar = false;
  if (path.startsWith("/admin")) {
    variant = /\/analytics$/.test(path) ? "reports" : "table";
    toolbar = variant === "table";
  } else if (/\/projects\/(standard|milestone)\//.test(path)) {
    variant = "workspace";
  } else if (path.includes("/profile")) {
    variant = "profile";
    width = "max-w-6xl";
  } else if (path.includes("/marketplace/jobs/")) {
    variant = "job";
  } else if (/\/marketplace\/[^/]+/.test(path)) {
    variant = "service";
  } else if (path.includes("/messages")) {
    variant = "messages";
  } else if (path.includes("/dashboard")) {
    title = "Dashboard";
    variant = "dashboard";
    width = "max-w-[1600px]";
  } else if (path.includes("/reports") || path.includes("/analytics")) {
    title = "Analytics";
    variant = "work-analytics";
    width = "max-w-[1600px]";
  } else if (path.includes("/schedule")) {
    title = "Schedule";
    variant = "calendar";
  } else if (path.includes("/projects")) {
    title = "Projects";
    variant = "projects";
    toolbar = true;
  } else if (path.includes("/notifications")) {
    title = "Notifications";
    variant = "notifications";
    width = "max-w-4xl";
    toolbar = true;
  } else if (path.includes("/settings")) {
    title = "Settings";
    variant = "account-settings";
    width = "max-w-5xl";
  } else if (path.includes("/my-listings")) {
    title = "My Listings";
    variant = "listings";
    toolbar = true;
  } else if (path.includes("/marketplace")) {
    title = "Marketplace";
    variant = "marketplace";
    toolbar = true;
  } else if (path.includes("/client")) {
    title = "Clients";
    variant = "contacts";
    toolbar = true;
  } else if (path.includes("/payments")) {
    title = "Payment status";
    variant = "verification-settings";
    width = "max-w-2xl p-6";
  }
  return (
    <div className={`mx-auto w-full min-w-0 space-y-6 ${width}`}>
      {variant === "work-analytics" ? (
        <div className="flex flex-col justify-between gap-4 lg:flex-row">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Analytics
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Track your projects and confirmed payments over time.
            </p>
          </div>
          <div aria-hidden="true" className="space-y-2">
            <div className="flex gap-2">
              <Skeleton className="h-10 w-36" />
              <Skeleton className="h-10 w-28" />
            </div>
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ) : (
        title && (
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h1>
        )
      )}
      {path.startsWith("/admin") && (
        <Skeleton aria-hidden="true" className="h-9 w-48" />
      )}
      {toolbar && (
        <div aria-hidden="true" className="space-y-4">
          {variant === "projects" && (
            <div className="flex flex-wrap gap-2 rounded-xl border p-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-11 w-24" />
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>
      )}
      <ContentSkeleton
        variant={variant}
        label={`Loading ${title.toLowerCase() || "page"}`}
      />
    </div>
  );
}
