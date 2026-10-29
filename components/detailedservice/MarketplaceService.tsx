"use client";
import GuestSignup from "@/components/marketplace/GuestSignup";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import Link from "next/link";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/lib/supabaseClient";
import { ListingActions } from "@/components/marketplace/ListingActions";
import { FreelancerAvailability } from "@/components/marketplace/FreelancerAvailability";
import { useFreelancerAvailability } from "@/hooks/useFreelancerAvailability";

import { useEffect, useMemo, useRef, useState } from "react";

import { AlertTriangle, Bookmark, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  getSavedListings,
  listingKey,
  saveListing,
} from "@/services/marketplace/listingActions";

import {
  getCurrentUserRole,
  switchUserRole,
  type UserRole,
} from "@/services/marketplace/AccountServices";

import {
  getMarketplaceService,
  createMarketplaceOrder,
  getCurrentClientProfileId,
} from "@/services/marketplace/MarketplaceServices";

import type { MarketplaceService } from "@/services/marketplace/MarketplaceServices";
import { getPublicProfile } from "@/services/profile/profileservice";
import type { Profile } from "@/types/profile/profile";
import {
  EMPLOYMENT_PREFERENCES,
  ENGLISH_PROFICIENCY,
} from "@/constants/account-setup.constants";
import {
  getJobCategories,
  type Category,
} from "@/services/serviceP/categoryService";

import ServiceReviews from "@/components/detailedservice/ServiceReviews";
import ServiceRelatedWork from "@/components/detailedservice/ServiceRelatedWork";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface MarketplaceServiceDetailsProps {
  serviceId: string;
  guest?: boolean;
}

function formatBudgetInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const decimalIndex = cleaned.indexOf(".");
  const wholeDigits = (decimalIndex < 0 ? cleaned : cleaned.slice(0, decimalIndex))
    .replace(/^0+(?=\d)/, "")
    .slice(0, 6);
  const fraction = decimalIndex < 0
    ? ""
    : `.${cleaned.slice(decimalIndex + 1).replace(/\./g, "").slice(0, 2)}`;
  const numeric = Number(`${wholeDigits || "0"}${fraction}`);
  if (numeric > 100_000) return "100,000";
  const formattedWhole = (wholeDigits || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${formattedWhole}${fraction}`;
}

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function deliveryDaysFromDate(dateValue: string, todayValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = todayValue.split("-").map(Number);
  const selected = Date.UTC(year, month - 1, day);
  const today = Date.UTC(todayYear, todayMonth - 1, todayDay);
  return Math.max(1, Math.ceil((selected - today) / 86_400_000));
}

export default function MarketplaceServiceDetails({
  serviceId,
  guest = false,
}: MarketplaceServiceDetailsProps) {
  const [signup, setSignup] = useState(false);
  const [shareFeedback, setShareFeedback] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState("");
  const [serviceSkills, setServiceSkills] = useState<{
    serviceId: string;
    names: string[];
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    let active = true;
    async function loadSkills() {
      try {
        const links = await supabase
          .from("service_skills")
          .select("skill_id")
          .eq("service_id", serviceId);
        if (links.error) throw links.error;
        const ids = [...new Set((links.data ?? []).map((row) => row.skill_id))];
        const skills = ids.length
          ? await supabase
              .from("skills")
              .select("id,name")
              .in("id", ids)
              .order("name")
          : { data: [], error: null };
        if (skills.error) throw skills.error;
        if (active)
          setServiceSkills({
            serviceId,
            names: (skills.data ?? []).map((row) => row.name),
            failed: false,
          });
      } catch {
        if (active) setServiceSkills({ serviceId, names: [], failed: true });
      }
    }
    void loadSkills();
    return () => {
      active = false;
    };
  }, [serviceId]);
  const [guestSeller, setGuestSeller] = useState<{
    display_name: string | null;
    avatar_url: string | null;
  } | null>(null);
  const [service, setService] = useState<MarketplaceService | null>(null);
  const [freelancerProfile, setFreelancerProfile] = useState<Profile | null>(null);
  const [freelancerProfileLoading, setFreelancerProfileLoading] = useState(false);
  const availability = useFreelancerAvailability(service?.freelancer_id ? [service.freelancer_id] : []);
  const available = availability.get(service?.freelancer_id ?? "");

  useEffect(() => {
    const userId = service?.freelancer?.user_id;
    if (!userId) {
      setFreelancerProfile(null);
      return;
    }
    let active = true;
    setFreelancerProfile(null);
    setFreelancerProfileLoading(true);
    void getPublicProfile(userId)
      .then((profile) => {
        if (active) setFreelancerProfile(profile?.role === "freelancer" ? profile : null);
      })
      .catch(() => {
        if (active) setFreelancerProfile(null);
      })
      .finally(() => {
        if (active) setFreelancerProfileLoading(false);
      });
    return () => {
      active = false;
    };
  }, [service?.freelancer?.user_id]);

  useEffect(() => {
    if (guest || !service?.service_id) return;
    let active = true;
    void getSavedListings()
      .then((saved) => {
        if (active) setIsSaved(saved.has(listingKey("service", service.service_id)));
      })
      .catch(() => {
        if (active) setSaveFeedback("Could not load saved status.");
      });
    return () => {
      active = false;
    };
  }, [guest, service?.service_id]);

  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);

  const [loading, setLoading] = useState(true);

  const [roleLoading, setRoleLoading] = useState(!guest);

  const [error, setError] = useState<string | null>(null);

  const [showRoleDialog, setShowRoleDialog] = useState(false);

  const [switchingRole, setSwitchingRole] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);

  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectBudget, setProjectBudget] = useState("");
  const [projectDeliveryDate, setProjectDeliveryDate] = useState("");
  const [projectRevisions, setProjectRevisions] = useState("");
  const [projectCategoryId, setProjectCategoryId] = useState("");
  const [projectCategoryText, setProjectCategoryText] = useState("");
  const [isCustomRequest, setIsCustomRequest] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const categoryRef = useRef<HTMLDivElement>(null);
  const categoryMatches = useMemo(() => {
    const query = projectCategoryText.trim().toLowerCase();
    return (query
      ? categories.filter((category) =>
          category.name.toLowerCase().includes(query),
        )
      : categories
    )
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 20);
  }, [categories, projectCategoryText]);

  useEffect(() => {
    void getJobCategories()
      .then(setCategories)
      .catch((error) => console.error("Failed to load job categories:", error));
  }, []);

  useEffect(() => {
    const closeCategory = (event: MouseEvent) => {
      if (!categoryRef.current?.contains(event.target as Node))
        setCategoryOpen(false);
    };
    document.addEventListener("mousedown", closeCategory);
    return () => document.removeEventListener("mousedown", closeCategory);
  }, []);
  /* ==========================================================
     LOAD CURRENT USER ROLE + LISTEN FOR ROLE CHANGES
  ========================================================== */

  useEffect(() => {
    if (guest) return;
    async function loadUserRole() {
      try {
        setRoleLoading(true);

        const role = await getCurrentUserRole();

        console.log("Marketplace listing current role:", role);

        setCurrentUserRole(role);
      } catch (err) {
        console.error("Failed to load current user role:", err);

        setCurrentUserRole(null);
      } finally {
        setRoleLoading(false);
      }
    }

    loadUserRole();

    function handleRoleChanged(event: Event) {
      const customEvent = event as CustomEvent<{
        role: UserRole;
      }>;

      const role = customEvent.detail?.role;

      if (role !== "client" && role !== "freelancer") {
        return;
      }

      console.log("Marketplace role changed:", role);

      setCurrentUserRole(role);
    }

    window.addEventListener("account-role-changed", handleRoleChanged);

    return () => {
      window.removeEventListener("account-role-changed", handleRoleChanged);
    };
  }, [guest]);

  /* ==========================================================
     LOAD LISTING
  ========================================================== */

  useEffect(() => {
    async function loadService() {
      if (!serviceId) {
        setError("Listing ID is missing.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setGuestSeller(null);

      try {
        console.log("Loading marketplace listing:", serviceId);

        const data = await getMarketplaceService(serviceId, guest);

        if (!data) {
          setError("Listing not found.");
          setService(null);
          return;
        }

        setService(data);
        if (guest && data.freelancer_id) {
          const { data: seller } = await supabase
            .from("freelancer_profiles")
            .select("user_id")
            .eq("freelancer_id", data.freelancer_id)
            .maybeSingle();
          if (seller) {
            const { data: identity } = await supabase
              .from("profiles")
              .select("display_name,avatar_url")
              .eq("user_id", seller.user_id)
              .maybeSingle();
            setGuestSeller(identity);
          }
        }
      } catch (err) {
        console.error("Failed to load marketplace listing:", err);

        setError("Failed to load listing.");
        setService(null);
      } finally {
        setLoading(false);
      }
    }

    loadService();
  }, [serviceId, guest]);

  /* ==========================================================
     SERVICE ACTION
  ========================================================== */

  async function handleServiceAction(customRequest = false) {
    if (guest) {
      setSignup(true);
      return;
    }
    if (!service) {
      return;
    }

    /*
     * Only services are purchased through
     * the Buy flow.
     */
    if (service.listing_type !== "service") {
      return;
    }

    /*
     * Freelancers must switch to Client mode
     * before purchasing a service.
     */
    if (currentUserRole === "freelancer") {
      setShowRoleDialog(true);
      return;
    }

    /*
     * A valid client role is required.
     */
    if (currentUserRole !== "client") {
      setActionError(
        "You must be logged in as a client to purchase this service.",
      );
      return;
    }

    setProjectTitle(service.title);
    setProjectDescription("");
    setProjectBudget(formatBudgetInput(String(service.price)));
    const defaultDeliveryDate = new Date();
    defaultDeliveryDate.setDate(
      defaultDeliveryDate.getDate() + Math.max(1, Number(service.delivery_time_days) || 1),
    );
    setProjectDeliveryDate(localDateString(defaultDeliveryDate));
    setProjectRevisions(String(service.revisions_count));
    setProjectCategoryId(service.category_id);
    setProjectCategoryText(service.category?.name ?? "");
    setIsCustomRequest(customRequest);
    setCategoryOpen(false);
    setActionError(null);
    setShowPurchaseDialog(true);
  }

  async function handleShareService() {
    if (!service) return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: service.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareFeedback("Service link copied.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setShareFeedback("Unable to share this service.");
    }
  }

  async function handleSaveService() {
    if (!service) return;
    if (guest) {
      setSignup(true);
      return;
    }
    if (saving) return;
    setSaving(true);
    setSaveFeedback("");
    try {
      await saveListing("service", service.service_id, !isSaved);
      setIsSaved((current) => !current);
    } catch (cause) {
      setSaveFeedback(cause instanceof Error ? cause.message : "Unable to save service.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmServiceRequest() {
    if (!service || !service.freelancer_id) return;
    const budget = Number(projectBudget.replace(/,/g, ""));
    const today = localDateString(new Date());
    if (!Number.isFinite(budget) || budget <= 0 || budget > 100_000) {
      setActionError("Enter a budget greater than 0 and no more than ₱100,000.");
      return;
    }
    if (!projectDeliveryDate || projectDeliveryDate < today) {
      setActionError("Choose today or a future delivery date.");
      return;
    }
    const deliveryTimeDays = deliveryDaysFromDate(projectDeliveryDate, today);

    try {
      setActionLoading(true);
      setActionError(null);
      setActionSuccess(null);
      const clientId = await getCurrentClientProfileId();

      if (!clientId) {
        throw new Error(
          "Client profile not found. Please complete your client profile first.",
        );
      }

      await createMarketplaceOrder(
        service.service_id,
        clientId,
        service.freelancer_id,
        {
          projectTitle,
          description: projectDescription,
          budget,
          deliveryTimeDays,
          revisionsCount: Number(projectRevisions),
          categoryId: projectCategoryId,
          categoryName:
            categories.find((category) => category.id === projectCategoryId)
              ?.name ?? service.category?.name ?? "",
        },
      );
      setShowPurchaseDialog(false);
      setActionSuccess("Your service request has been submitted successfully.");
    } catch (error) {
      console.error("Failed to purchase service:", error);
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to submit service request.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  /* ==========================================================
     SWITCH TO CLIENT
  ========================================================== */

  async function handleSwitchToClient() {
    try {
      setSwitchingRole(true);
      setActionError(null);

      await switchUserRole("client");

      setCurrentUserRole("client");

      window.dispatchEvent(
        new CustomEvent("account-role-changed", {
          detail: {
            role: "client",
          },
        }),
      );

      setShowRoleDialog(false);
    } catch (error) {
      console.error("Failed to switch to client:", error);

      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to switch to Client mode.",
      );
    } finally {
      setSwitchingRole(false);
    }
  }

  /* ==========================================================
     LOADING
  ========================================================== */

  if (loading || roleLoading) {
    return <ContentSkeleton label="Loading listing" variant="service" />;
  }

  /* ==========================================================
     ERROR
  ========================================================== */

  if (error) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold">Unable to load listing</h2>

          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  /* ==========================================================
     LISTING NOT FOUND
  ========================================================== */

  if (!service) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-muted-foreground">Listing not found.</p>
      </div>
    );
  }

  /* ==========================================================
     LISTING TYPE
  ========================================================== */

  const isService = service.listing_type === "service";

  const isFreelancer = currentUserRole === "freelancer";

  const actionLabel = isService ? "Buy" : "Apply";
  const sellerName = guest
    ? guestSeller?.display_name || "Freelancer name unavailable"
    : service.freelancer?.profile?.display_name ||
      [service.freelancer?.profile?.first_name, service.freelancer?.profile?.last_name]
        .filter(Boolean)
        .join(" ") ||
      "Freelancer name unavailable";
  const sellerAvatar = guest
    ? guestSeller?.avatar_url
    : service.freelancer?.profile?.avatar_url;
  const freelancerProfessionalDetails = [
    [
      "Experience",
      freelancerProfile?.years_of_experience != null
        ? `${freelancerProfile.years_of_experience} ${freelancerProfile.years_of_experience === 1 ? "year" : "years"}`
        : null,
    ],
    [
      "Work preference",
      EMPLOYMENT_PREFERENCES.find(
        (option) => option.value === freelancerProfile?.employment_preference,
      )?.label ?? freelancerProfile?.employment_preference ?? null,
    ],
    [
      "English",
      ENGLISH_PROFICIENCY.find(
        (option) => option.value === freelancerProfile?.english_proficiency,
      )?.label ?? freelancerProfile?.english_proficiency ?? null,
    ],
  ].filter(([, value]) => value);

  /* ==========================================================
     RETURN
  ========================================================== */

  return (
    <>
      <GuestSignup open={signup} onOpenChange={setSignup} />
      <div className="mx-auto w-full max-w-6xl break-words">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            {/* =====================================================
              LISTING IMAGE
          ===================================================== */}

            <div className="overflow-hidden rounded-2xl border bg-muted">
              {service.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={service.cover_image_url}
                  alt={service.title}
                  className="max-h-[500px] w-full object-cover"
                />
              ) : (
                <div className="flex h-48 sm:h-72 items-center justify-center">
                  <span className="text-muted-foreground">
                    {isService ? "Service Thumbnail" : "Job Thumbnail"}
                  </span>
                </div>
              )}
            </div>

            {/* =====================================================
              LISTING TITLE
          ===================================================== */}

            <div className="mt-6">
              <div className="flex items-start justify-between gap-4 border-b pb-4">
                <h1 className="min-w-0 flex-1 text-2xl font-bold tracking-tight">
                  {service.title}
                </h1>
              </div>
            </div>

            {/* =====================================================
              DESCRIPTION
          ===================================================== */}

            <section
              className="mt-8"
              aria-labelledby="about-service-heading"
            >
              <h2
                id="about-service-heading"
                className="text-xl font-semibold tracking-tight"
              >
                {isService ? "About this service" : "About this job"}
              </h2>
              <dl className="mt-6 space-y-6">
                <div className="grid gap-2 sm:grid-cols-[130px_minmax(0,1fr)] sm:gap-6">
                  <dt className="text-sm font-medium text-muted-foreground">
                    Service
                  </dt>
                  <dd className="text-sm font-semibold">
                    {service.category?.name || "Not specified"}
                  </dd>
                </div>
                <div className="grid gap-2 sm:grid-cols-[130px_minmax(0,1fr)] sm:gap-6">
                  <dt className="text-sm font-medium text-muted-foreground">
                    Skills included
                  </dt>
                  <dd className="flex flex-wrap gap-2 text-sm">
                    {serviceSkills?.serviceId !== serviceId ? (
                      <span className="text-muted-foreground">
                        Loading skills...
                      </span>
                    ) : serviceSkills.failed ? (
                      <span className="text-muted-foreground">
                        Skills unavailable.
                      </span>
                    ) : serviceSkills.names.length ? (
                      serviceSkills.names.map((name) => (
                        <span
                          key={name}
                          className="max-w-full break-words rounded-lg bg-muted px-3 py-1.5 text-xs font-medium"
                        >
                          {name}
                        </span>
                      ))
                    ) : (
                      <span className="text-muted-foreground">
                        No skills specified.
                      </span>
                    )}
                  </dd>
                </div>
                <div className="border-t pt-6">
                  <dt className="text-sm font-semibold">Description</dt>
                  <dd className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">
                    {service.description?.trim() || "No description provided."}
                  </dd>
                </div>
              </dl>
            </section>

            {/* =====================================================
              SERVICE DETAILS
          ===================================================== */}
          </div>
          <aside
            className="min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-2"
            aria-label="Listing details and actions"
          >
            {isService && (
              <section className="rounded-2xl border bg-card shadow-sm">
                {/* PRICE */}

                <div className="border-b p-6">
                  <p className="text-sm text-muted-foreground">Service price</p>

                  <p className="mt-1 text-3xl font-bold tracking-tight">
                    ₱
                    {Number(service.price).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>

                {/* DETAILS */}

                <div className="p-6">
                  <h2 className="text-base font-semibold">Service details</h2>

                  <div className="mt-5 divide-y [&>div]:py-4 [&>div:first-child]:pt-0 [&>div:last-child]:pb-0">
                    {/* DELIVERY */}

                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">
                        Delivery
                      </span>

                      <span className="text-sm font-medium">
                        {service.delivery_time_days}{" "}
                        {service.delivery_time_days === 1 ? "day" : "days"}
                      </span>
                    </div>

                    {/* REVISIONS */}

                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">
                        Revisions
                      </span>

                      <span className="text-sm font-medium">
                        {service.revisions_count}
                      </span>
                    </div>

                    {/* SERVICE TYPE */}

                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">
                        Service type
                      </span>

                      <span className="text-sm font-medium">
                        {service.service_type === "milestone"
                          ? "Milestone"
                          : "Standard"}
                      </span>
                    </div>

                    {/* CATEGORY */}

                    {service.category?.name && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm text-muted-foreground">
                          Category
                        </span>

                        <span className="text-right text-sm font-medium">
                          {service.category.name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* ACTION */}

                <div className="border-t p-6">
                  <button
                    type="button"
                    onClick={() => void handleServiceAction()}
                    disabled={actionLoading || available === false}
                    className="
                    w-full
                    rounded-lg
                    bg-primary
                    px-4
                    py-3
                    text-sm
                    font-semibold
                    text-primary-foreground
                    transition-opacity
                    hover:opacity-90
                    disabled:cursor-not-allowed
                    disabled:opacity-50
                  "
                  >
                    {available === false ? "Fully booked" : actionLoading ? "Submitting..." : actionLabel}
                  </button>

                  {actionError && (
                    <p className="mt-3 text-center text-xs text-destructive">
                      {actionError}
                    </p>
                  )}

                  {actionSuccess && (
                    <p className="mt-3 text-center text-xs text-emerald-600">
                      {actionSuccess}
                    </p>
                  )}

                  {!actionError && !actionSuccess && (
                    <p className="mt-3 text-center text-xs text-muted-foreground">
                      {isFreelancer
                        ? "Switch to a Client account to purchase this service."
                        : "Purchase this service from the freelancer."}
                    </p>
                  )}
                </div>
              </section>
            )}

            {isService && (guest || service.freelancer?.user_id) && (
              <section className="mt-4 rounded-2xl border bg-card p-5 shadow-sm" aria-label="Freelancer information and actions">
                <div className="flex items-center gap-3">
                  <Avatar className="size-12">
                    <AvatarImage src={sellerAvatar ?? undefined} alt="" />
                    <AvatarFallback>{sellerName.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    {guest ? (
                      <button type="button" onClick={() => setSignup(true)} className="truncate text-left font-semibold hover:text-primary">{sellerName}</button>
                    ) : (
                      <Link href={"/home/profile/" + service.freelancer!.user_id} className="truncate font-semibold hover:text-primary">{sellerName}</Link>
                    )}
                    {service.freelancer?.headline && <p className="truncate text-sm text-muted-foreground">{service.freelancer.headline}</p>}
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4">
                  <span className="text-sm font-medium">Availability</span>
                  <FreelancerAvailability available={available} />
                </div>
                <div className="mt-4 space-y-3 border-t pt-4">
                  <h3 className="text-sm font-medium">Professional details</h3>
                  {freelancerProfileLoading ? (
                    <p className="text-xs text-muted-foreground">Loading profile details…</p>
                  ) : freelancerProfessionalDetails.length ? (
                    <dl className="space-y-2 text-xs">
                      {freelancerProfessionalDetails.map(([label, value]) => (
                        <div key={label} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                          <dt className="shrink-0 text-muted-foreground">{label}</dt>
                          <dd className="min-w-0 break-words font-medium sm:text-right">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-xs text-muted-foreground">No professional details added yet.</p>
                  )}
                  {!freelancerProfileLoading && freelancerProfile && (
                    <div className="space-y-3">
                      <div>
                        <p className="mb-1.5 text-xs font-medium">Skills</p>
                        <div className="flex flex-wrap gap-1.5">
                          {freelancerProfile.skills?.length ? freelancerProfile.skills.slice(0, 5).map((skill) => (
                            <Badge key={skill.id} variant="outline" className="max-w-full whitespace-normal break-words font-normal">{skill.name}</Badge>
                          )) : <p className="text-xs text-muted-foreground">No skills added yet.</p>}
                        </div>
                      </div>
                      <div>
                        <p className="mb-1.5 text-xs font-medium">Industries</p>
                        <div className="flex flex-wrap gap-1.5">
                          {freelancerProfile.industries?.length ? freelancerProfile.industries.slice(0, 3).map((industry) => (
                            <Badge key={industry.id} variant="outline" className="max-w-full whitespace-normal break-words font-normal">{industry.name}</Badge>
                          )) : <p className="text-xs text-muted-foreground">No industries added yet.</p>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 w-full"
                  onClick={() => void handleServiceAction(true)}
                  disabled={actionLoading || available === false}
                >
                  Custom request
                </Button>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div>
                    <ListingActions kind="service" id={service.service_id} buttonVariant="outline" buttonClassName="w-full" onRequireAccount={guest ? () => setSignup(true) : undefined} />
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => void handleShareService()}>
                    <Share2 className="size-4" />Share
                  </Button>
                  <Button type="button" variant="outline" size="sm" className={isSaved ? "border-emerald-600 bg-emerald-600 text-white hover:border-emerald-700 hover:bg-emerald-700 hover:text-white dark:border-emerald-800 dark:bg-emerald-900 dark:text-white dark:hover:border-emerald-700 dark:hover:bg-emerald-800" : "transition-colors hover:border-emerald-600 hover:text-emerald-700"} aria-pressed={isSaved} disabled={saving} onClick={() => void handleSaveService()}>
                    {isSaved ? <Bookmark className="size-4 text-white" /> : <Bookmark className="size-4" />}
                    {saving ? "Saving" : isSaved ? "Saved" : "Save"}
                  </Button>
                </div>
                {shareFeedback && <p role="status" className="mt-2 text-center text-xs text-muted-foreground">{shareFeedback}</p>}
                {saveFeedback && <p role="status" className="mt-2 text-center text-xs text-muted-foreground">{saveFeedback}</p>}
              </section>
            )}

            {/* =====================================================
              JOB DETAILS
          ===================================================== */}

            {!isService && (
              <section className="mt-8 rounded-2xl border bg-background">
                {/* BUDGET */}

                <div className="border-b p-6">
                  <p className="text-sm text-muted-foreground">Job budget</p>

                  <p className="mt-1 text-3xl font-bold tracking-tight">
                    ₱
                    {Number(service.price).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>

                {/* DETAILS */}

                <div className="p-6">
                  <h2 className="text-base font-semibold">Job details</h2>

                  <div className="mt-5 space-y-5">
                    {/* DEADLINE */}

                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">
                        Deadline
                      </span>

                      <span className="text-sm font-medium">
                        {service.delivery_time_days}{" "}
                        {service.delivery_time_days === 1 ? "day" : "days"}
                      </span>
                    </div>

                    {/* CATEGORY */}

                    {service.category?.name && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm text-muted-foreground">
                          Category
                        </span>

                        <span className="text-right text-sm font-medium">
                          {service.category.name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* ACTION */}

                <div className="border-t p-6">
                  <button
                    type="button"
                    className="
                    w-full
                    rounded-lg
                    bg-primary
                    px-4
                    py-3
                    text-sm
                    font-semibold
                    text-primary-foreground
                    transition-opacity
                    hover:opacity-90
                  "
                  >
                    Apply
                  </button>

                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    Submit an application for this job.
                  </p>
                </div>
              </section>
            )}
          </aside>
          {/* =====================================================
              REVIEWS
              SERVICE ONLY
          ===================================================== */}

          {isService && service.freelancer_id && (
            <section className="min-w-0 lg:col-start-1 lg:row-start-2">
              <ServiceReviews freelancerId={service.freelancer_id} />
            </section>
          )}
        </div>
      </div>

      {isService && service.freelancer_id && (
        <ServiceRelatedWork service={service} guest={guest} sellerName={
          (guest ? guestSeller?.display_name : service.freelancer?.profile?.display_name) ||
          "this freelancer"
        } />
      )}

      <Dialog open={showPurchaseDialog} onOpenChange={setShowPurchaseDialog}>
        <DialogContent showCloseButton={false} className="max-h-[90vh] gap-6 overflow-y-auto p-6 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Send service request
            </DialogTitle>
            <DialogDescription>
              Describe the project scope, expected deliverables, and any key
              requirements. Your details will form the starting point for the
              service agreement.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-2">
            {isCustomRequest && (
              <div ref={categoryRef} className="grid gap-3">
                <Label htmlFor="project-category">Type of work</Label>
                <div className="relative">
                  <Input
                    id="project-category"
                    value={projectCategoryText}
                    placeholder="Search for a category..."
                    autoComplete="off"
                    onFocus={() => setCategoryOpen(true)}
                    onChange={(event) => {
                      setProjectCategoryText(event.target.value);
                      setProjectCategoryId("");
                      setCategoryOpen(true);
                    }}
                  />
                  {categoryOpen && (
                    <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-lg border bg-background shadow-lg">
                      <div className="max-h-60 overflow-y-auto py-1">
                        {categoryMatches.length ? (
                          categoryMatches.map((category) => (
                            <button
                              key={category.id}
                              type="button"
                              className="flex w-full px-4 py-2 text-left text-sm hover:bg-muted"
                              onClick={() => {
                                setProjectCategoryId(category.id);
                                setProjectCategoryText(category.name);
                                setCategoryOpen(false);
                              }}
                            >
                              {category.name}
                            </button>
                          ))
                        ) : (
                          <p className="px-4 py-3 text-sm text-muted-foreground">
                            No categories found.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Choose the type of work for this custom request.
                </p>
              </div>
            )}
            <div className="grid gap-3">
              <Label htmlFor="project-title">Project title</Label>
              <Input
                id="project-title"
                value={projectTitle}
                onChange={(event) => setProjectTitle(event.target.value)}
              />
            </div>
            <div className="grid gap-3">
              <Label htmlFor="project-description">Project details</Label>
              <Textarea
                id="project-description"
                rows={2}
                className="resize-none"
                placeholder="Describe the work, expected output, requirements, and any important context."
                value={projectDescription}
                onChange={(event) => setProjectDescription(event.target.value)}
              />
            </div>
            <div className="grid items-start gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <div className="flex min-h-5 items-center justify-between gap-2">
                  <Label htmlFor="project-budget">Budget</Label>
                  <span className="text-xs text-muted-foreground">Max: ₱100,000</span>
                </div>
                <div className="relative">
                  <Input
                    id="project-budget"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    className="pr-10"
                    value={projectBudget}
                    onChange={(event) => setProjectBudget(formatBudgetInput(event.target.value))}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-muted-foreground" aria-hidden="true">
                    ₱
                  </span>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="project-delivery-date" className="min-h-5">Delivery date</Label>
                <Input
                  id="project-delivery-date"
                  type="date"
                  min={localDateString(new Date())}
                  value={projectDeliveryDate}
                  onChange={(event) => setProjectDeliveryDate(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="project-revisions" className="min-h-5">Revisions</Label>
                <Input
                  id="project-revisions"
                  type="text"
                  inputMode="numeric"
                  value={projectRevisions}
                  onChange={(event) => setProjectRevisions(event.target.value.replace(/\D/g, ""))}
                />
              </div>
            </div>
            {actionError && (
              <p className="text-sm text-destructive">{actionError}</p>
            )}
          </div>
          <DialogFooter className="-mx-6 -mb-6 mt-2 rounded-b-xl border-t bg-muted/50 p-6">
            <Button
              variant="outline"
              disabled={actionLoading}
              onClick={() => setShowPurchaseDialog(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={
                actionLoading ||
                (isCustomRequest && !projectCategoryId) ||
                !projectTitle.trim() ||
                !projectDescription.trim()
              }
              onClick={confirmServiceRequest}
            >
              {actionLoading ? "Sending..." : "Confirm request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==========================================================
          SWITCH TO CLIENT DIALOG
      ========================================================== */}

      {showRoleDialog && (
        <div
          className="
            fixed inset-0 z-[200]
            flex items-center justify-center
            bg-black/50 p-4
          "
        >
          <div
            className="
              w-full max-w-md
              rounded-xl border
              bg-background
              p-6
              shadow-xl
            "
          >
            {/* DIALOG HEADER */}

            <div className="flex items-start gap-3">
              <div
                className="
                  flex h-10 w-10 shrink-0
                  items-center justify-center
                  rounded-full
                  bg-yellow-500/10
                "
              >
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              </div>

              <div>
                <h2 className="text-lg font-semibold">Switch to Client?</h2>

                <p className="mt-2 text-sm text-muted-foreground">
                  This service can only be purchased by clients. Switch to your
                  Client account to continue?
                </p>
              </div>
            </div>

            {/* DIALOG ACTIONS */}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={switchingRole}
                onClick={() => setShowRoleDialog(false)}
                className="
                  rounded-md
                  border
                  px-4
                  py-2
                  text-sm
                  transition
                  hover:bg-accent
                  disabled:opacity-50
                "
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={switchingRole}
                onClick={handleSwitchToClient}
                className="
                  rounded-md
                  bg-primary
                  px-4
                  py-2
                  text-sm
                  font-semibold
                  text-primary-foreground
                  transition
                  hover:opacity-90
                  disabled:cursor-not-allowed
                  disabled:opacity-50
                "
              >
                {switchingRole ? "Switching..." : "Switch to Client"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
