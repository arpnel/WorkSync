"use client";
import HeroSection from "@/components/dashboard/hero-section-one";
import Features from "@/components/dashboard/features-1";
import StatsSection from "@/components/dashboard/stats-two";
import FooterSection from "@/components/dashboard/footer-four";
import { FaqBubble } from "@/components/landing/FaqBubble";
import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck, Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SignupDialog } from "@/components/auth/signup/SignupDialog";
import { FreelancerAvailability } from "@/components/marketplace/FreelancerAvailability";
import { useFreelancerAvailability } from "@/hooks/useFreelancerAvailability";
import { supabase } from "@/lib/supabaseClient";
import {
  getMarketplaceServices,
  type MarketplaceService,
} from "@/services/marketplace/MarketplaceServices";
import { getFreelancerRatings } from "@/services/marketplace/listingActions";
import {
  getGuestServiceIdentities,
  type GuestServiceIdentity,
} from "@/services/marketplace/guestServiceIdentities";

const SERVICE_SHOWCASE_LIMIT = 10;

export default function LandingPage() {
  const [services, setServices] = useState<MarketplaceService[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceError, setServiceError] = useState("");
  const [serviceAttempt, setServiceAttempt] = useState(0);
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  const [signupOpen, setSignupOpen] = useState(false);
  const [guestIdentities, setGuestIdentities] = useState<
    Map<string, GuestServiceIdentity>
  >(new Map());
  const availability = useFreelancerAvailability(
    services.flatMap((service) =>
      service.freelancer_id ? [service.freelancer_id] : [],
    ),
  );
  useEffect(() => {
    let active = true;
    const loadingTimeout = window.setTimeout(() => {
      if (!active) return;
      setLoading(false);
      setServiceError("Freelancer services are taking too long to load.");
    }, 12_000);
    setLoading(true);
    setServiceError("");
    setRatings(new Map());
    setGuestIdentities(new Map());
    void (async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const listings = await getMarketplaceServices({
          guest: !session,
          listingType: "service",
          sort: "latest",
          page: 0,
          pageSize: SERVICE_SHOWCASE_LIMIT,
        });
        const serviceListings = listings.filter(
          (listing): listing is MarketplaceService =>
            listing.listing_type === "service",
        );
        if (active) {
          window.clearTimeout(loadingTimeout);
          setServiceError("");
          setServices(serviceListings);
          setLoading(false);
        }
        const freelancerIds = serviceListings.flatMap((service) =>
          service.freelancer_id ? [service.freelancer_id] : [],
        );
        const [serviceRatings, publicIdentities] = await Promise.all([
          freelancerIds.length
            ? getFreelancerRatings(freelancerIds).catch(
                () => new Map<string, number>(),
              )
            : Promise.resolve(new Map<string, number>()),
          !session && serviceListings.length
            ? getGuestServiceIdentities(
                serviceListings.map((service) => service.service_id),
              ).catch(() => new Map<string, GuestServiceIdentity>())
            : Promise.resolve(new Map<string, GuestServiceIdentity>()),
        ]);
        if (active) {
          setRatings(serviceRatings);
          setGuestIdentities(publicIdentities);
        }
      } catch (cause) {
        if (active) {
          setServices([]);
          setServiceError(
            cause instanceof Error
              ? cause.message
              : "Unable to load freelancer services.",
          );
        }
      } finally {
        window.clearTimeout(loadingTimeout);
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      window.clearTimeout(loadingTimeout);
    };
  }, [serviceAttempt]);

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
      <Dialog open={signupOpen} onOpenChange={setSignupOpen}>
        <DialogContent className="auth-dialog-content max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <SignupDialog />
        </DialogContent>
      </Dialog>
      <HeroSection />
      <Features />
      <section
        id="about"
        className="scroll-mt-6 bg-muted/30 px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-6 border-b pb-8 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
                Freelancer services
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Services posted by freelancers
              </h2>
              <p className="mt-3 text-muted-foreground">
                Explore recent services and find the right fit for your next
                project.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSignupOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              View other services <ArrowRight className="size-4" />
            </button>
          </div>
          {loading ? (
            <div
              role="status"
              aria-label="Loading freelancer services"
              className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="overflow-hidden rounded-xl border bg-card">
                  <div className="aspect-[4/3] animate-pulse bg-muted/50" />
                  <div className="space-y-3 p-4">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-muted/50" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted/50" />
                    <div className="h-10 animate-pulse rounded bg-muted/50" />
                  </div>
                </div>
              ))}
            </div>
          ) : serviceError ? (
            <div className="mt-8 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
              <p role="alert" className="text-sm text-destructive">
                {serviceError}
              </p>
              <button
                type="button"
                className="mt-3 text-sm font-medium text-primary hover:underline"
                onClick={() => setServiceAttempt((attempt) => attempt + 1)}
              >
                Try again
              </button>
            </div>
          ) : services.length ? (
            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {services.map((service) => {
                const profile = service.freelancer?.profile;
                const publicIdentity = guestIdentities.get(service.service_id);
                const freelancerName =
                  profile?.display_name?.trim() ||
                  publicIdentity?.display_name?.trim() ||
                  [profile?.first_name, profile?.last_name]
                    .filter(Boolean)
                    .join(" ")
                    .trim() ||
                  [publicIdentity?.first_name, publicIdentity?.last_name]
                    .filter(Boolean)
                    .join(" ")
                    .trim() ||
                  "Freelancer";
                const freelancerId = service.freelancer_id ?? "";
                const freelancerAvailability = availability.get(freelancerId);
                const rating = ratings.get(freelancerId);
                const price = new Intl.NumberFormat("en-PH", {
                  style: "currency",
                  currency: "PHP",
                  maximumFractionDigits: 2,
                }).format(service.price);

                return (
                  <button
                    type="button"
                    key={service.service_id}
                    onClick={() => setSignupOpen(true)}
                    aria-label={`Sign up to view ${service.title} by ${freelancerName}`}
                    className="group block w-full cursor-pointer rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Card className="h-full gap-0 overflow-hidden rounded-xl border bg-card p-0 shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md">
                      <div className="aspect-[4/3] overflow-hidden bg-muted">
                        {service.cover_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={service.cover_image_url}
                            alt={service.title}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="grid h-full place-items-center bg-gradient-to-br from-primary/10 via-muted to-primary/5 text-sm text-muted-foreground">
                            {service.category?.name ?? "Freelancer service"}
                          </div>
                        )}
                      </div>
                      <div className="space-y-3 p-4">
                        <FreelancerAvailability
                          available={freelancerAvailability}
                        />
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Avatar className="size-8 shrink-0">
                            <AvatarImage
                              src={
                                profile?.avatar_url ??
                                publicIdentity?.avatar_url ??
                                undefined
                              }
                              alt={freelancerName}
                            />
                            <AvatarFallback className="text-xs">
                              {(freelancerName[0] ?? "F").toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold">
                              {freelancerName}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {service.freelancer?.headline ||
                                publicIdentity?.headline ||
                                "Freelancer"}
                            </p>
                          </div>
                        </div>
                        <h3 className="line-clamp-2 text-base font-semibold leading-6 group-hover:text-primary">
                          {service.title}
                        </h3>
                        {service.freelancer?.verification_status === "approved" && (
                          <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                            <ShieldCheck className="size-3.5" aria-hidden="true" />
                            Verified freelancer
                          </p>
                        )}
                        <p className={`flex items-center gap-1.5 text-xs font-medium ${rating == null ? "text-muted-foreground" : ""}`}>
                          {rating == null ? (
                            <>
                              <Star className="size-3.5 text-amber-600" aria-hidden="true" />
                              <span>Not yet rated</span>
                            </>
                          ) : (
                            <>
                              <Star className="size-3.5 fill-amber-400 text-amber-600" aria-hidden="true" />
                              <span>
                                {rating.toFixed(1)} rating
                              </span>
                            </>
                          )}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="max-w-full truncate rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {service.category?.name ?? "Category"}
                          </span>
                          <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            {service.service_type === "milestone" ? "Milestone" : "Standard"}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-3">
                          <div>
                            <p className="text-[11px] uppercase text-muted-foreground">
                              Starting at
                            </p>
                            <p className="text-lg font-bold leading-tight">{price}</p>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <p className="font-medium capitalize">
                              {service.pricing_mode}
                            </p>
                            <p>{service.delivery_time_days} days</p>
                            <p>{service.revisions_count} revisions</p>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-8 rounded-xl border border-dashed bg-card/60 px-5 py-10 text-center">
              <p className="font-medium">No active freelancer services yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Check back later to see new service postings.
              </p>
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
