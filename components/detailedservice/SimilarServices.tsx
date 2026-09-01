"use client";

import { useEffect, useState } from "react";

import { AlertTriangle } from "lucide-react";

import {
  getCurrentUserRole,
  switchUserRole,
  type UserRole,
} from "@/services/marketplace/AccountServices";

import {
  getMarketplaceService,
  type MarketplaceService,
} from "@/services/marketplace/MarketplaceServices";

import ServiceReviews from "@/components/detailedservice/ServiceReviews";

interface MarketplaceServiceDetailsProps {
  serviceId: string;
}

export default function MarketplaceServiceDetails({
  serviceId,
}: MarketplaceServiceDetailsProps) {
  const [service, setService] =
    useState<MarketplaceService | null>(null);

  const [currentUserRole, setCurrentUserRole] =
    useState<UserRole | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [roleLoading, setRoleLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [showRoleDialog, setShowRoleDialog] =
    useState(false);

  const [switchingRole, setSwitchingRole] =
    useState(false);

  /* ==========================================================
     LOAD CURRENT USER ROLE
  ========================================================== */

  useEffect(() => {
    let mounted = true;

    async function loadUserRole() {
      try {
        setRoleLoading(true);

        const role =
          await getCurrentUserRole();

        if (!mounted) {
          return;
        }

        setCurrentUserRole(role);
      } catch (err) {
        console.error(
          "Failed to load current user role:",
          err,
        );

        if (mounted) {
          setCurrentUserRole(null);
        }
      } finally {
        if (mounted) {
          setRoleLoading(false);
        }
      }
    }

    loadUserRole();

    function handleRoleChanged(
      event: Event,
    ) {
      const customEvent =
        event as CustomEvent<{
          role: UserRole;
        }>;

      const role =
        customEvent.detail?.role;

      if (
        role !== "client" &&
        role !== "freelancer"
      ) {
        return;
      }

      setCurrentUserRole(role);
    }

    window.addEventListener(
      "account-role-changed",
      handleRoleChanged,
    );

    return () => {
      mounted = false;

      window.removeEventListener(
        "account-role-changed",
        handleRoleChanged,
      );
    };
  }, []);

  /* ==========================================================
     LOAD SERVICE
  ========================================================== */

  useEffect(() => {
    let mounted = true;

    async function loadService() {
      if (!serviceId) {
        setError(
          "Service ID is missing.",
        );
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const data =
          await getMarketplaceService(
            serviceId,
          );

        if (!mounted) {
          return;
        }

        if (!data) {
          setService(null);
          setError(
            "Service not found.",
          );
          return;
        }

        setService(data);
      } catch (err) {
        console.error(
          "Failed to load service:",
          err,
        );

        if (mounted) {
          setService(null);
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load service.",
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadService();

    return () => {
      mounted = false;
    };
  }, [serviceId]);

  /* ==========================================================
     BUY SERVICE
  ========================================================== */

  function handleServiceAction() {
    if (!service) {
      return;
    }

    /*
     * Only clients can purchase a service.
     */
    if (
      currentUserRole ===
      "freelancer"
    ) {
      setShowRoleDialog(true);
      return;
    }

    /*
     * User must be in Client mode.
     */
    if (
      currentUserRole !==
      "client"
    ) {
      setError(
        "You must be logged in as a client to purchase this service.",
      );
      return;
    }

    /*
     * Connect the actual service-order
     * creation flow here.
     */
    console.log(
      "Purchase service:",
      service.service_id,
    );
  }

  /* ==========================================================
     SWITCH TO CLIENT
  ========================================================== */

  async function handleSwitchToClient() {
    try {
      setSwitchingRole(true);

      await switchUserRole(
        "client",
      );

      setCurrentUserRole(
        "client",
      );

      window.dispatchEvent(
        new CustomEvent(
          "account-role-changed",
          {
            detail: {
              role: "client",
            },
          },
        ),
      );

      setShowRoleDialog(false);
    } catch (err) {
      console.error(
        "Failed to switch to client:",
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : "Failed to switch to Client mode.",
      );
    } finally {
      setSwitchingRole(false);
    }
  }

  /* ==========================================================
     LOADING
  ========================================================== */

  if (
    loading ||
    roleLoading
  ) {
    return (
      <div className="flex min-h-[400px] items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">
          Loading service...
        </p>
      </div>
    );
  }

  /* ==========================================================
     ERROR
  ========================================================== */

  if (error) {
    return (
      <div className="flex min-h-[400px] items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <h2 className="text-lg font-semibold">
            Unable to load service
          </h2>

          <p className="mt-2 text-sm text-muted-foreground">
            {error}
          </p>
        </div>
      </div>
    );
  }

  /* ==========================================================
     NOT FOUND
  ========================================================== */

  if (!service) {
    return (
      <div className="flex min-h-[400px] items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">
          Service not found.
        </p>
      </div>
    );
  }

  /* ==========================================================
     CURRENT ROLE
  ========================================================== */

  const isFreelancer =
    currentUserRole ===
    "freelancer";

  /* ==========================================================
     SERVICE TYPE
  ========================================================== */

  const isMilestone =
    service.service_type ===
    "milestone";

  /* ==========================================================
     RETURN
  ========================================================== */

  return (
    <>
      <div className="w-full px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto w-full max-w-4xl">
          {/* =====================================================
              SERVICE IMAGE
          ===================================================== */}

          <div className="overflow-hidden rounded-xl border bg-muted sm:rounded-2xl">
            {service.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={
                  service.cover_image_url
                }
                alt={
                  service.title ||
                  "Service"
                }
                className="aspect-video w-full object-cover"
              />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center">
                <span className="text-sm text-muted-foreground">
                  Service Thumbnail
                </span>
              </div>
            )}
          </div>

          {/* =====================================================
              SERVICE HEADER
          ===================================================== */}

          <div className="mt-5 sm:mt-6">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">
              {service.title ||
                "Untitled Service"}
            </h1>

            {service.category?.name && (
              <p className="mt-2 text-sm text-muted-foreground">
                {
                  service.category
                    .name
                }
              </p>
            )}
          </div>

          {/* =====================================================
              DESCRIPTION
          ===================================================== */}

          <section className="mt-7 sm:mt-8">
            <h2 className="text-lg font-semibold">
              About this service
            </h2>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {service.description ||
                "No description provided."}
            </p>
          </section>

          {/* =====================================================
              SERVICE INFORMATION
          ===================================================== */}

          <section className="mt-7 overflow-hidden rounded-xl border bg-background sm:mt-8 sm:rounded-2xl">
            {/* ===================================================
                PRICE
            =================================================== */}

            <div className="border-b p-5 sm:p-6">
              <p className="text-sm text-muted-foreground">
                Service price
              </p>

              <p className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                ₱
                {Number(
                  service.price ?? 0,
                ).toLocaleString(
                  "en-PH",
                  {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  },
                )}
              </p>
            </div>

            {/* ===================================================
                DETAILS
            =================================================== */}

            <div className="p-5 sm:p-6">
              <h2 className="text-base font-semibold">
                Service details
              </h2>

              <div className="mt-5 space-y-5">
                {/* DELIVERY */}

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">
                    Delivery
                  </span>

                  <span className="text-right text-sm font-medium">
                    {
                      service.delivery_time_days
                    }{" "}
                    {service.delivery_time_days ===
                    1
                      ? "day"
                      : "days"}
                  </span>
                </div>

                {/* REVISIONS */}

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">
                    Revisions
                  </span>

                  <span className="text-right text-sm font-medium">
                    {
                      service.revisions_count
                    }
                  </span>
                </div>

                {/* SERVICE TYPE */}

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">
                    Service type
                  </span>

                  <span className="text-right text-sm font-medium">
                    {isMilestone
                      ? "Milestone"
                      : "Standard"}
                  </span>
                </div>

                {/* PRICING MODE */}

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">
                    Pricing
                  </span>

                  <span className="text-right text-sm font-medium capitalize">
                    {service.pricing_mode ||
                      "Fixed"}
                  </span>
                </div>

                {/* CATEGORY */}

                {service.category
                  ?.name && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">
                      Category
                    </span>

                    <span className="max-w-[60%] text-right text-sm font-medium">
                      {
                        service
                          .category
                          .name
                      }
                    </span>
                  </div>
                )}

                {/* STATUS */}

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">
                    Status
                  </span>

                  <span className="text-right text-sm font-medium capitalize">
                    {service.status ||
                      "Active"}
                  </span>
                </div>
              </div>
            </div>

            {/* ===================================================
                ACTION
            =================================================== */}

            <div className="border-t p-5 sm:p-6">
              <button
                type="button"
                onClick={
                  handleServiceAction
                }
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
                  active:opacity-80
                "
              >
                Buy
              </button>

              <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
                {isFreelancer
                  ? "Switch to a Client account to purchase this service."
                  : "Purchase this service from the freelancer."}
              </p>
            </div>
          </section>

          {/* =====================================================
              REVIEWS
          ===================================================== */}

          {service.freelancer_id && (
            <section className="mt-7 sm:mt-8">
              <ServiceReviews
                freelancerId={
                  service.freelancer_id
                }
              />
            </section>
          )}
        </div>
      </div>

      {/* ==========================================================
          SWITCH TO CLIENT DIALOG
      ========================================================== */}

      {showRoleDialog && (
        <div
          className="
            fixed inset-0 z-[200]
            flex items-center justify-center
            bg-black/50
            p-4
          "
        >
          <div
            className="
              w-full
              max-w-md
              rounded-xl
              border
              bg-background
              p-5
              shadow-xl
              sm:p-6
            "
          >
            {/* ===================================================
                HEADER
            =================================================== */}

            <div className="flex items-start gap-3">
              <div
                className="
                  flex
                  h-10
                  w-10
                  shrink-0
                  items-center
                  justify-center
                  rounded-full
                  bg-yellow-500/10
                "
              >
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              </div>

              <div className="min-w-0">
                <h2 className="text-lg font-semibold">
                  Switch to Client?
                </h2>

                <p className="mt-2 text-sm leading-5 text-muted-foreground">
                  This service can only
                  be purchased by
                  clients. Switch to
                  your Client account
                  to continue?
                </p>
              </div>
            </div>

            {/* ===================================================
                ACTIONS
            =================================================== */}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={
                  switchingRole
                }
                onClick={() =>
                  setShowRoleDialog(
                    false,
                  )
                }
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
                disabled={
                  switchingRole
                }
                onClick={
                  handleSwitchToClient
                }
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
                {switchingRole
                  ? "Switching..."
                  : "Switch to Client"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

