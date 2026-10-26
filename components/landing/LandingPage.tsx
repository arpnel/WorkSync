"use client";
import HeroSection from "@/components/dashboard/hero-section-one";
import Features from "@/components/dashboard/features-1";
import StatsSection from "@/components/dashboard/stats-two";
import FooterSection from "@/components/dashboard/footer-four";
import { FaqBubble } from "@/components/landing/FaqBubble";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  CodeXml,
  Layers3,
  Megaphone,
  Music2,
  Palette,
  PenTool,
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
function categoryLink(categoryId: string, skillId?: string) {
  return `/marketplace?category=${encodeURIComponent(categoryId)}${skillId ? `&subcategory=${encodeURIComponent(skillId)}` : ""}`;
}

export default function LandingPage() {
  const [categories, setCategories] = useState<ExplorerCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryError, setCategoryError] = useState("");
  const [categoryAttempt, setCategoryAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void getServiceCategoryExplorer()
      .then((rows) => {
        if (active) {
          setCategories(
            [...rows]
              .sort(
                (a, b) =>
                  (b.listingCount ?? 0) - (a.listingCount ?? 0) ||
                  a.name.localeCompare(b.name),
              )
              .slice(0, 6),
          );
          setCategoryError("");
        }
      })
      .catch((cause) => {
        if (active) {
          setCategories([]);
          setCategoryError(
            cause instanceof Error
              ? cause.message
              : "Unable to load categories.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [categoryAttempt]);

  return (
    <div
      onClickCapture={(event) => {
        const anchor =
          event.target instanceof Element ? event.target.closest("a") : null;
        if (
          !anchor ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        const href = anchor.getAttribute("href");
        if (
          href !== "#features" &&
          href !== "#about" &&
          href !== "#why-worksync"
        )
          return;
        const section = document.getElementById(href.slice(1));
        if (!section) return;
        event.preventDefault();
        history.replaceState(null, "", href);
        requestAnimationFrame(() =>
          section.scrollIntoView({
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
            block: "start",
          }),
        );
      }}
    >
      <HeroSection />
      <Features />
      <section
        id="about"
        className="scroll-mt-6 bg-muted/30 px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
                Find your next fit
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Explore services by category
              </h2>
              <p className="mt-3 text-muted-foreground">
                Start with the most active categories, then narrow your search
                by specialty.
              </p>
            </div>
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/marketplace/categories">
                Explore all categories <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          {loading ? (
            <div
              role="status"
              aria-label="Loading popular categories"
              className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            >
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  key={index}
                  className="h-[23rem] animate-pulse rounded-2xl border bg-muted/40"
                />
              ))}
            </div>
          ) : categories.length ? (
            <div className="mt-8 grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
                          href={categoryLink(category.id)}
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
                        {[...category.subcategories]
                          .sort(
                            (a, b) =>
                              (b.listingCount ?? 0) - (a.listingCount ?? 0) ||
                              a.name.localeCompare(b.name),
                          )
                          .slice(0, 3)
                          .map((subcategory) => (
                            <li key={subcategory.id}>
                              <Link
                                href={categoryLink(category.id, subcategory.id)}
                                className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-2 text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <span className="truncate">
                                  {subcategory.name}
                                </span>
                                {subcategory.listingCount !== null && (
                                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                    {subcategory.listingCount}{" "}
                                    {subcategory.listingCount === 1
                                      ? "service"
                                      : "services"}
                                  </span>
                                )}{" "}
                              </Link>
                            </li>
                          ))}
                      </ul>
                      <Button
                        asChild
                        variant="outline"
                        className="mt-auto w-full justify-between"
                      >
                        <Link href={categoryLink(category.id)}>
                          Explore {category.name}
                          <ArrowRight className="size-4" />
                        </Link>
                      </Button>
                    </div>
                    <Link
                      href={categoryLink(category.id)}
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
          ) : (
            <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed bg-card/60 px-5 py-10 text-center">
              {categoryError && (
                <p role="alert" className="mb-3 text-sm text-destructive">
                  {categoryError}
                </p>
              )}
              <Layers3 className="size-7 text-muted-foreground" />
              <p className="mt-3 font-medium">
                Browse the full service directory
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                See every category and specialty available on WorkSync.
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
                {categoryError && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setLoading(true);
                      setCategoryAttempt((attempt) => attempt + 1);
                    }}
                  >
                    Retry
                  </Button>
                )}
                <Button asChild variant="link">
                  <Link href="/marketplace/categories">
                    Explore all categories <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
      <StatsSection />
      <FooterSection />
      <FaqBubble />
    </div>
  );
}
