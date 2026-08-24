"use client";

import { useEffect, useState } from "react";

import { AlertTriangle } from "lucide-react";

import {
  getCurrentUserRole,
  switchUserRole,
  type UserRole,
} from "@/services/marketplace/AccountServices";

import { getMarketplaceService } from "@/services/marketplace/MarketplaceServices";

import type { MarketplaceService } from "@/services/marketplace/MarketplaceServices";

import ServiceReviews from "@/components/detailedservice/ServiceReviews";

interface MarketplaceServiceDetailsProps {
  serviceId: string;
}

export default function MarketplaceServiceDetails({
  serviceId,
}: MarketplaceServiceDetailsProps) {
  const [service, setService] = useState<MarketplaceService | null>(null);

  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(
    null,
  );

  const [loading, setLoading] = useState(true);

  const [roleLoading, setRoleLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [showRoleDialog, setShowRoleDialog] = useState(false);

  const [switchingRole, setSwitchingRole] = useState(false);

  /* ==========================================================
     LOAD CURRENT USER ROLE + LISTEN FOR ROLE CHANGES
  ========================================================== */

  useEffect(() => {
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
  }, []);

  /* ==========================================================
     LOAD MARKETPLACE LISTING
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

      try {
        console.log("Loading marketplace listing:", serviceId);

        const data = await getMarketplaceService(serviceId);

        if (!data) {
          setError("Listing not found.");
          setService(null);
          return;
        }

        setService(data);
      } catch (err) {
        console.error("Failed to load marketplace listing:", err);

        setError("Failed to load listing.");
        setService(null);
      } finally {
        setLoading(false);
      }
    }

    loadService();
  }, [serviceId]);

  /* ==========================================================
     SERVICE ACTION
  ========================================================== */

  async function handleServiceAction() {
    if (currentUserRole === "freelancer") {
      setShowRoleDialog(true);
      return;
    }

    console.log("Continue with service purchase");
  }

  /* ==========================================================
     SWITCH TO CLIENT
  ========================================================== */

  async function handleSwitchToClient() {
    try {
      setSwitchingRole(true);

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
    } finally {
      setSwitchingRole(false);
    }
  }

  /* ==========================================================
     LOADING
  ========================================================== */

  if (loading || roleLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-muted-foreground">Loading listing...</p>
      </div>
    );
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
  const isJob = service.listing_type === "job";

  /* ==========================================================
     CURRENT USER ROLE
  ========================================================== */

  const isFreelancer = currentUserRole === "freelancer";

  /*
   * Only services can be purchased.
   *
   * Jobs do not use the service purchase flow.
   */
  const actionLabel = isService ? "Buy" : "Apply";

  /* ==========================================================
     RETURN
  ========================================================== */

  return (
    <>
      <div className="w-full px-6 py-6">
        <div className="mx-auto max-w-4xl">
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
              <div className="flex h-[400px] items-center justify-center">
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
            <h1 className="text-2xl font-bold tracking-tight">
              {service.title}
            </h1>

            {service.category?.name && (
              <p className="mt-2 text-sm text-muted-foreground">
                {service.category.name}
              </p>
            )}
          </div>

          {/* =====================================================
              DESCRIPTION
          ===================================================== */}

          <section className="mt-8">
            <h2 className="text-lg font-semibold">
              {isService ? "About this service" : "About this job"}
            </h2>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {service.description}
            </p>
          </section>

          {/* =====================================================
              LISTING DETAILS
          ===================================================== */}

          <section className="mt-8 rounded-2xl border bg-background">
            {/* =================================================
                PRICE / BUDGET
            ================================================= */}

            <div className="border-b p-6">
              <p className="text-sm text-muted-foreground">
                {isService ? "Service price" : "Job budget"}
              </p>

              <p className="mt-1 text-3xl font-bold tracking-tight">
                ₱
                {Number(service.price).toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>

            {/* =================================================
                DETAILS
            ================================================= */}

            <div className="p-6">
              <h2 className="text-base font-semibold">
                {isService ? "Service details" : "Job details"}
              </h2>

              <div className="mt-5 space-y-5">
                {/* DELIVERY */}

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">
                    {isService ? "Delivery" : "Expected delivery"}
                  </span>

                  <span className="text-sm font-medium">
                    {service.delivery_time_days}{" "}
                    {service.delivery_time_days === 1 ? "day" : "days"}
                  </span>
                </div>

                {/* REVISIONS - SERVICE ONLY */}

                {isService && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">
                      Revisions
                    </span>

                    <span className="text-sm font-medium">
                      {service.revisions_count}
                    </span>
                  </div>
                )}

                {/* SERVICE TYPE - SERVICE ONLY */}

                {isService && (
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
                )}

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

            {/* =================================================
                ACTION
            ================================================= */}

            <div className="border-t p-6">
              {isService ? (
                <>
                  <button
                    type="button"
                    onClick={handleServiceAction}
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
                    {actionLabel}
                  </button>

                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    {isFreelancer
                      ? "Switch to a Client account to purchase this service."
                      : "Purchase this service from the freelancer."}
                  </p>
                </>
              ) : (
                <>
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
                    Submit your application to the client for this job.
                  </p>
                </>
              )}
            </div>
          </section>

          {/* =====================================================
              REVIEWS
              
              IMPORTANT:
              Jobs do not need reviews.
              Reviews are only rendered for services.
          ===================================================== */}

          {isService && service.freelancer_id && (
            <section className="mt-8">
              <ServiceReviews freelancerId={service.freelancer_id} />
            </section>
          )}
        </div>
      </div>

      {/* ==========================================================
          SWITCH TO CLIENT DIALOG
          
          Only relevant for service purchases.
      ========================================================== */}

      {showRoleDialog && isService && (
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