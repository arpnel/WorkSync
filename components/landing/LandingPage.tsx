"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Menu,
  X,
  Search,
  Layers,
  MessageSquare,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import { LogoIcon } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SigninDialog } from "@/components/auth/login/SigninDialog";
import { SignupDialog } from "@/components/auth/signup/SignupDialog";
import { supabase } from "@/lib/supabaseClient";
const navigation = [
  { id: "marketplace", label: "Explore services" },
  { id: "how-it-works", label: "How it works" },
  { id: "features", label: "Why WorkSync" },
  { id: "for-freelancers", label: "For freelancers" },
];
function AuthButton({
  signup = false,
  label,
}: {
  signup?: boolean;
  label: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={signup ? "default" : "outline"}>{label}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-sm">
        <DialogTitle className="sr-only">
          {signup ? "Join WorkSync" : "Sign in to WorkSync"}
        </DialogTitle>
        {signup ? <SignupDialog /> : <SigninDialog />}
      </DialogContent>
    </Dialog>
  );
}
export default function LandingPage() {
  const [menu, setMenu] = useState(false),
    [expanded, setExpanded] = useState(true),
    [query, setQuery] = useState("");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
      [],
    ),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void supabase
      .from("job_categories")
      .select("id,name")
      .order("name")
      .then(
        ({ data, error }) => {
          if (!active) return;
          setCategories(data ?? []);
          setError(
            error
              ? "Categories are unavailable right now. You can still sign in to explore WorkSync."
              : "",
          );
          setLoading(false);
        },
        () => {
          if (!active) return;
          setCategories([]);
          setError("Categories are unavailable right now. Please try again.");
          setLoading(false);
        },
      );
    return () => {
      active = false;
    };
  }, [retry]);
  const go = (id: string) => {
    if (id === "marketplace") setExpanded(true);
    setMenu(false);
    requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      }),
    );
  };
  const matches = categories.filter((category) =>
    category.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#landing-content" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <a
            href="#"
            aria-label="WorkSync home"
            className="flex items-center gap-2 text-xl font-bold tracking-tight"
          >
            <LogoIcon className="size-8" />
            WorkSync
          </a>
          <nav
            aria-label="Main navigation"
            className="ml-auto hidden items-center gap-5 lg:flex"
          >
            {navigation.map((item) => (
              <a
                key={item.id}
                href={"#" + item.id}
                onClick={(event) => {
                  event.preventDefault();
                  go(item.id);
                }}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-2 sm:flex lg:ml-4">
            <AuthButton label="Sign in" />
            <AuthButton signup label="Join WorkSync" />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto lg:hidden"
            aria-expanded={menu}
            aria-controls="landing-navigation"
            aria-label={menu ? "Close navigation" : "Open navigation"}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </Button>
        </div>
        {menu && (
          <nav
            id="landing-navigation"
            aria-label="Mobile navigation"
            className="space-y-2 border-t px-4 py-4 lg:hidden"
          >
            {navigation.map((item) => (
              <a
                key={item.id}
                href={"#" + item.id}
                onClick={(event) => {
                  event.preventDefault();
                  go(item.id);
                }}
                className="block rounded-lg px-3 py-3 text-sm hover:bg-muted"
              >
                {item.label}
              </a>
            ))}
            <div className="flex gap-2 pt-2 sm:hidden">
              <AuthButton label="Sign in" />
              <AuthButton signup label="Join WorkSync" />
            </div>
          </nav>
        )}
      </header>
      <main id="landing-content">
        <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-16 text-white sm:px-12 sm:py-20 lg:px-16">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-20 size-96 rounded-full border-[60px] border-emerald-800/30"
            />
            <div className="relative max-w-3xl">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
                Independent talent. Shared ambition.
              </p>
              <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
                Your next idea.
                <br />
                <span className="font-serif font-normal italic text-emerald-200">
                  The right collaborator.
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-emerald-50/80 sm:text-lg">
                Discover freelance services, agree on the work, and keep every
                conversation and delivery in one place.
              </p>
              <form
                className="mt-8 flex max-w-xl gap-2 rounded-xl bg-white p-2 text-zinc-950"
                onSubmit={(event) => {
                  event.preventDefault();
                  go("marketplace");
                }}
              >
                <label htmlFor="service-search" className="sr-only">
                  Find a service category
                </label>
                <Input
                  id="service-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="What kind of work do you need?"
                  className="h-12 min-w-0 border-0 bg-transparent shadow-none dark:bg-transparent"
                />
                <Button
                  type="submit"
                  className="h-12 bg-emerald-800 text-white hover:bg-emerald-700"
                  aria-label="Explore matching categories"
                >
                  <Search className="size-5" />
                  <span className="hidden sm:inline">Explore</span>
                </Button>
              </form>
              <p className="mt-4 text-xs text-emerald-100/70">
                Explore categories here. Sign in to browse services and connect.
              </p>
            </div>
          </div>
        </section>
        <section
          id="marketplace"
          className="mx-auto max-w-7xl scroll-mt-24 px-4 py-12 sm:px-6 lg:px-8"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
                Explore the marketplace
              </p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Find a place to start.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                Browse WorkSync?s service categories, then join to find the
                right fit for your project.
              </p>
            </div>
            <Button
              variant="outline"
              aria-expanded={expanded}
              aria-controls="marketplace-content"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Hide marketplace" : "Show marketplace"}
              <ChevronDown
                className={expanded ? "size-4 rotate-180" : "size-4"}
              />
            </Button>
          </div>
          <div
            id="marketplace-content"
            hidden={!expanded}
            className="mt-8 space-y-6"
          >
            <Input
              aria-label="Filter service categories"
              placeholder="Filter categories"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="max-w-md"
            />
            {loading ? (
              <p role="status" className="py-8 text-muted-foreground">
                Loading categories?
              </p>
            ) : error ? (
              <div role="alert" className="rounded-xl border p-5">
                <p>{error}</p>
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    setLoading(true);
                    setRetry(retry + 1);
                  }}
                >
                  Try again
                </Button>
              </div>
            ) : matches.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {matches.map((category) => (
                  <Dialog key={category.id}>
                    <DialogTrigger asChild>
                      <button className="group flex min-h-36 flex-col items-start justify-between rounded-2xl border bg-card p-6 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary">
                        <Layers
                          className="size-6 text-primary"
                          aria-hidden="true"
                        />
                        <span className="mt-5 flex w-full items-center justify-between gap-3 font-medium">
                          {category.name}
                          <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-1" />
                        </span>
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
                      <DialogTitle>{category.name}</DialogTitle>
                      <p className="text-sm leading-6 text-muted-foreground">
                        Sign in to browse available services and contact
                        freelancers. This public preview shows categories, not
                        individual listings.
                      </p>
                      <SigninDialog />
                    </DialogContent>
                  </Dialog>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                {query
                  ? "No categories match your search. Try a different term."
                  : "No categories are available yet."}
              </p>
            )}
          </div>
        </section>
        <section
          id="how-it-works"
          className="scroll-mt-24 border-y bg-muted/30"
        >
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              From an idea to a delivery.
            </h2>
            <div className="mt-10 grid gap-8 md:grid-cols-3">
              {[
                [
                  "01",
                  "Find your fit",
                  "Explore services and discuss what your project needs.",
                ],
                [
                  "02",
                  "Agree on the details",
                  "Define scope, budget and delivery expectations before work begins.",
                ],
                [
                  "03",
                  "Work together",
                  "Share updates, review submissions and keep your project moving.",
                ],
              ].map(([step, title, copy]) => (
                <div key={step}>
                  <span className="text-sm font-semibold text-primary">
                    {step}
                  </span>
                  <h3 className="mt-4 text-xl font-semibold">{title}</h3>
                  <p className="mt-3 max-w-sm text-sm leading-7 text-muted-foreground">
                    {copy}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section
          id="features"
          className="mx-auto max-w-7xl scroll-mt-24 px-4 py-16 sm:px-6 lg:px-8"
        >
          <div className="grid gap-10 lg:grid-cols-2">
            <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              Less scattered.
              <br />
              More working together.
            </h2>
            <div className="space-y-7">
              {[
                {
                  Icon: MessageSquare,
                  title: "Keep the conversation connected",
                  text: "Discuss requirements and share project updates in WorkSync.",
                },
                {
                  Icon: ListChecks,
                  title: "Make expectations clear",
                  text: "Use agreements, milestones and delivery reviews to organize the work.",
                },
                {
                  Icon: ShieldCheck,
                  title: "A place to raise concerns",
                  text: "Report listings and use project disputes when an engagement needs review.",
                },
              ].map(({ Icon, title, text }) => (
                <div key={title} className="flex gap-4">
                  <span className="h-fit rounded-xl bg-primary/10 p-3 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section
          id="for-freelancers"
          className="mx-auto max-w-7xl scroll-mt-24 px-4 pb-16 sm:px-6 lg:px-8"
        >
          <div className="flex flex-col justify-between gap-8 rounded-3xl bg-muted px-6 py-12 sm:px-12 lg:flex-row lg:items-center">
            <div className="max-w-xl">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">
                For independent professionals
              </p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Make room for your next opportunity.
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                Build your profile, showcase your work, and offer your services
                to clients.
              </p>
            </div>
            <div className="shrink-0">
              <AuthButton signup label="Create your account" />
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-sm text-muted-foreground">
            ? {new Date().getFullYear()} WorkSync
          </p>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-5">
            {navigation.map((item) => (
              <a
                key={item.id}
                href={"#" + item.id}
                onClick={(event) => {
                  event.preventDefault();
                  go(item.id);
                }}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
