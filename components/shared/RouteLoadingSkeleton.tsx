"use client";
import { usePathname } from "next/navigation";
import ContentSkeleton from "./ContentSkeleton";
import type { LayoutVariant } from "./LayoutSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { getActiveAdminNavItem } from "@/components/admin/admin-navigation";

function AdminRouteSkeleton({ path }: { path: string }) {
  const item = getActiveAdminNavItem(path);
  const isDashboard = path === "/admin" || path === "/admin/";
  const isAnalytics = path.startsWith("/admin/analytics");
  const isTaxReview = path.startsWith("/admin/financial/tax");
  const isAssessmentEditor = path.startsWith("/admin/assessments");
  const isUserDetail = /^\/admin\/users\/[^/]+/.test(path);
  return (
    <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-6">
      <header className="space-y-2" aria-hidden="true">
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </header>
      {isDashboard ? (
        <ContentSkeleton label="Loading admin dashboard" variant="admin-dashboard" />
      ) : isAnalytics ? (
        <ContentSkeleton label="Loading admin analytics" variant="reports" />
      ) : isTaxReview ? (
        <div className="grid gap-5">
          {[0, 1].map((section) => (
            <section key={section} className="space-y-4 rounded-xl border bg-card p-4 sm:p-6" aria-hidden="true">
              <Skeleton className="h-6 w-64 max-w-full" />
              <Skeleton className="h-4 w-80 max-w-full" />
              {section === 0 ? (
                <div className="grid gap-3 xl:grid-cols-2">
                  {[0, 1].map((i) => <div key={i} className="space-y-3 rounded-lg border p-4"><Skeleton className="h-5 w-48" /><Skeleton className="h-4 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-9 w-28" /></div>)}
                </div>
              ) : <ContentSkeleton label="Loading tax document records" variant="admin-table" count={4} />}
            </section>
          ))}
        </div>
      ) : isAssessmentEditor ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.6fr)]" aria-hidden="true">
          <section className="space-y-4 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-3"><Skeleton className="h-6 w-44" /><Skeleton className="h-9 w-24" /></div>
            <Skeleton className="h-10 w-full" />
            {[0, 1, 2].map((i) => <div key={i} className="space-y-2 rounded-lg border p-4"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-8 w-24" /></div>)}
          </section>
          <section className="space-y-5 rounded-xl border bg-card p-4 sm:p-6">
            <Skeleton className="h-6 w-56" />
            <div className="grid gap-4 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-10 w-full" /></div>)}</div>
            {[0, 1, 2].map((i) => <div key={i} className="space-y-3 rounded-lg border p-4"><Skeleton className="h-5 w-36" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>)}
          </section>
        </div>
      ) : isUserDetail ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.65fr)]" aria-hidden="true">
          <section className="space-y-5 rounded-xl border bg-card p-5">
            <div className="flex items-center gap-4"><Skeleton className="size-16 rounded-full" /><div className="space-y-2"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-64 max-w-full" /></div></div>
            <div className="grid gap-4 sm:grid-cols-2">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="space-y-2 rounded-lg border p-4"><Skeleton className="h-3 w-24" /><Skeleton className="h-5 w-40 max-w-full" /></div>)}</div>
          </section>
          <section className="space-y-4 rounded-xl border bg-card p-5"><Skeleton className="h-5 w-40" /><ContentSkeleton label="Loading account history" variant="admin-table" count={3} /></section>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3" aria-hidden="true">
            {[0, 1, 2, ...(path.startsWith("/admin/moderation") || path.startsWith("/admin/reports") || path.startsWith("/admin/disputes") ? [3] : [])].map((i) => (
              <div key={i} className="space-y-3 rounded-xl border bg-card p-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
          <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5" aria-hidden="true">
            <div className="flex flex-wrap gap-3">
              <Skeleton className="h-10 min-w-48 flex-1" />
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-10 w-10" />
            </div>
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-7 w-24 rounded-full" />)}
            </div>
          </section>
          <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5" aria-hidden="true">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="space-y-2"><Skeleton className="h-5 w-44" /><Skeleton className="h-4 w-72 max-w-full" /></div>
              <Skeleton className="h-9 w-32" />
            </div>
            <ContentSkeleton label={`Loading ${item?.label.toLowerCase() ?? "admin records"}`} variant="admin-table" />
          </section>
        </>
      )}
    </div>
  );
}

export default function RouteLoadingSkeleton() {
  const path = usePathname().toLowerCase();
  if (path.startsWith("/admin")) return <AdminRouteSkeleton path={path} />;
  let variant: LayoutVariant = "table";
  let title = "";
  let width = "";
  let toolbar = false;
  if (/\/projects\/(standard|milestone)\//.test(path)) {
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
