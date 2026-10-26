"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CodeXml,
  Layers3,
  Megaphone,
  Music2,
  Palette,
  PenTool,
  RefreshCw,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getServiceCategoryExplorer,
  type ExplorerCategory,
} from "@/services/marketplace/categoryExplorerService";

const visuals = [
  {
    match: /creative|design|art/i,
    icon: Palette,
    className:
      "bg-rose-100/80 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  },
  {
    match: /development|tech|it|data|ai/i,
    icon: CodeXml,
    className:
      "bg-sky-100/80 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  },
  {
    match: /video|animation/i,
    icon: Video,
    className:
      "bg-violet-100/80 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  },
  {
    match: /writing|translation/i,
    icon: PenTool,
    className:
      "bg-amber-100/80 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  },
  {
    match: /market|business/i,
    icon: Megaphone,
    className:
      "bg-emerald-100/80 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
  {
    match: /audio|music/i,
    icon: Music2,
    className:
      "bg-fuchsia-100/80 text-fuchsia-700 dark:bg-fuchsia-950/50 dark:text-fuchsia-300",
  },
];
function visualFor(name: string) {
  return (
    visuals.find((item) => item.match.test(name)) ?? {
      icon: BriefcaseBusiness,
      className:
        "bg-indigo-100/80 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
    }
  );
}
function categoryHref(id: string) {
  return `/marketplace?category=${encodeURIComponent(id)}`;
}
function subcategoryHref(categoryId: string, skillId: string) {
  return `/marketplace?category=${encodeURIComponent(categoryId)}&subcategory=${encodeURIComponent(skillId)}`;
}

export default function ServiceCategoryExplorer() {
  const [categories, setCategories] = useState<ExplorerCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCategories(await getServiceCategoryExplorer());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load service categories.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to WorkSync
          </Link>
          <Button asChild variant="outline">
            <Link href="/marketplace">
              Browse all services
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
        <section className="mx-auto max-w-3xl py-10 text-center sm:py-14">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            Discover WorkSync
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
            Explore Services by Category
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Browse categories with active services. Featured specialties are
            sampled from recent listings to keep this page quick to load.
          </p>
        </section>
        {error ? (
          <div className="mx-auto max-w-xl rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <h2 className="font-semibold">Categories could not be loaded</h2>
            <p role="alert" className="mt-2 text-sm text-muted-foreground">
              {error}
            </p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => void load()}
            >
              <RefreshCw className="size-4" />
              Try again
            </Button>
          </div>
        ) : loading ? (
          <div
            role="status"
            aria-label="Loading service categories"
            className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="h-[23rem] animate-pulse rounded-2xl border bg-muted/40"
              />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="rounded-2xl border border-dashed py-14 text-center">
            <Layers3 className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-3 font-semibold">No service categories yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Check back when services are available.
            </p>
          </div>
        ) : (
          <div className="grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => {
              const visual = visualFor(category.name);
              const Icon = visual.icon;
              return (
                <Card
                  key={category.id}
                  className="flex min-h-[23rem] flex-col overflow-hidden rounded-2xl border bg-card p-0 shadow-sm"
                >
                  <div className="flex flex-1 flex-col p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={categoryHref(category.id)}
                        className="text-lg font-semibold leading-snug hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {category.name}
                      </Link>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        {category.listingCount === null
                          ? "Active services"
                          : `${category.listingCount} ${category.listingCount === 1 ? "service" : "services"}`}
                      </span>
                    </div>
                    <ul className="mt-4 space-y-1">
                      {category.subcategories.map((subcategory) => (
                        <li key={subcategory.id}>
                          <Link
                            href={subcategoryHref(category.id, subcategory.id)}
                            className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-2 text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="truncate">{subcategory.name}</span>
                            {subcategory.listingCount !== null && (
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                {subcategory.listingCount}{" "}
                                {subcategory.listingCount === 1
                                  ? "service"
                                  : "services"}
                              </span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <Button
                      asChild
                      variant="outline"
                      className="mt-auto w-full justify-between"
                    >
                      <Link href={categoryHref(category.id)}>
                        Explore All {category.name}
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                  </div>
                  <Link
                    href={categoryHref(category.id)}
                    aria-label={`Explore all services in ${category.name}`}
                    className={`relative flex h-28 items-center justify-center overflow-hidden ${visual.className}`}
                  >
                    <div className="absolute -right-8 -top-16 size-48 rounded-full border border-current/10" />
                    <div className="absolute -bottom-20 -left-6 size-44 rounded-full border border-current/10" />
                    <div className="relative grid size-16 place-items-center rounded-2xl bg-background/70 shadow-sm backdrop-blur">
                      <Icon className="size-8" strokeWidth={1.6} />
                    </div>
                    <span className="sr-only">
                      Browse {category.name} services
                    </span>
                  </Link>
                </Card>
              );
            })}
          </div>
        )}
        <div className="mt-10 rounded-2xl border bg-muted/20 p-5 text-center sm:p-6">
          <p className="font-medium">Not sure where to start?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse every active service and use the marketplace filters to
            narrow your search.
          </p>
          <Button asChild className="mt-4">
            <Link href="/marketplace">
              Explore the marketplace
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
