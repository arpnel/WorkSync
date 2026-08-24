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
  createMarketplaceOrder,
  getCurrentClientProfileId,
} from "@/services/marketplace/MarketplaceServices";

import type { MarketplaceService } from "@/services/marketplace/MarketplaceServices";

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

  const [loading, setLoading] = useState(true);

  const [roleLoading, setRoleLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [showRoleDialog, setShowRoleDialog] =
    useState(false);

  const [switchingRole, setSwitchingRole] =
    useState(false);

  const [actionLoading, setActionLoading] =
    useState(false);

  const [actionError, setActionError] =
    useState<string | null>(null);

  const [actionSuccess, setActionSuccess] =
    useState<string | null>(null);

  /* ==========================================================
     LOAD CURRENT USER ROLE + LISTEN FOR ROLE CHANGES
  ========================================================== */

  useEffect(() => {
    async function loadUserRole() {
      try {
        setRoleLoading(true);

        const role = await getCurrentUserRole();

        console.log(
          "Marketplace listing current role:",
          role,
        );

        setCurrentUserRole(role);
      } catch (err) {
        console.error(
          "Failed to load current user role:",
          err,
        );

        setCurrentUserRole(null);
      } finally {
        setRoleLoading(false);
      }
    }

    loadUserRole();

    function handleRoleChanged(event: Event) {
      const customEvent =
        event as CustomEvent<{
          role: UserRole;
        }>;

      const role = customEvent.detail?.role;

      if (
        role !== "client" &&
        role !== "freelancer"
      ) {
        return;
      }

      console.log(
        "Marketplace role changed:",
        role,
      );

      setCurrentUserRole(role);
    }

    window.addEventListener(
      "account-role-changed",
      handleRoleChanged,
    );

    return () => {
      window.removeEventListener(
        "account-role-changed",
        handleRoleChanged,
      );
    };
  }, []);

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

      try {
        console.log(
          "Loading marketplace listing:",
          serviceId,
        );

        const data =
          await getMarketplaceService(serviceId);

        if (!data) {
          setError("Listing not found.");
          setService(null);
          return;
        }

        setService(data);
      } catch (err) {
        console.error(
          "Failed to load marketplace listing:",
          err,
        );

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

    try {
  setActionLoading(true);
  setActionError(null);
  setActionSuccess(null);

  /*
   * Get the currently authenticated
   * user's client profile.
   */
  const clientId =
    await getCurrentClientProfileId();

  if (!clientId) {
    throw new Error(
      "Client profile not found. Please complete your client profile first.",
    );
  }

  /*
   * The marketplace service must have
   * an assigned freelancer before an
   * order can be created.
   */
  if (!service.freelancer_id) {
    throw new Error(
      "This service does not have a freelancer assigned.",
    );
  }

  /*
   * Create the pending marketplace order.
   */
  const order =
    await createMarketplaceOrder(
      service.service_id,
      clientId,
      service.freelancer_id,
    );

  console.log(
    "Marketplace order created:",
    order,
  );

  setActionSuccess(
    "Your service request has been submitted successfully.",
  );
} catch (error) {
  console.error(
    "Failed to purchase service:",
    error,
  );

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
    } catch (error) {
      console.error(
        "Failed to switch to client:",
        error,
      );

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
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-muted-foreground">
          Loading listing...
        </p>
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
          <h2 className="text-lg font-semibold">
            Unable to load listing
          </h2>

          <p className="mt-2 text-sm text-muted-foreground">
            {error}
          </p>
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
        <p className="text-muted-foreground">
          Listing not found.
        </p>
      </div>
    );
  }

  /* ==========================================================
     LISTING TYPE
  ========================================================== */

  const isService =
    service.listing_type === "service";

  const isFreelancer =
    currentUserRole === "freelancer";

  const actionLabel = isService
    ? "Buy"
    : "Apply";

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
                  {isService
                    ? "Service Thumbnail"
                    : "Job Thumbnail"}
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
              {isService
                ? "About this service"
                : "About this job"}
            </h2>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {service.description}
            </p>
          </section>

          {/* =====================================================
              SERVICE DETAILS
          ===================================================== */}

          {isService && (
            <section className="mt-8 rounded-2xl border bg-background">
              {/* PRICE */}

              <div className="border-b p-6">
                <p className="text-sm text-muted-foreground">
                  Service price
                </p>

                <p className="mt-1 text-3xl font-bold tracking-tight">
                  ₱
                  {Number(
                    service.price,
                  ).toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>

              {/* DETAILS */}

              <div className="p-6">
                <h2 className="text-base font-semibold">
                  Service details
                </h2>

                <div className="mt-5 space-y-5">
                  {/* DELIVERY */}

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">
                      Delivery
                    </span>

                    <span className="text-sm font-medium">
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
                      {service.service_type ===
                      "milestone"
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
                        {
                          service.category.name
                        }
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ACTION */}

              <div className="border-t p-6">
                <button
                  type="button"
                  onClick={handleServiceAction}
                  disabled={actionLoading}
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
                  {actionLoading
                    ? "Submitting..."
                    : actionLabel}
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

                {!actionError &&
                  !actionSuccess && (
                    <p className="mt-3 text-center text-xs text-muted-foreground">
                      {isFreelancer
                        ? "Switch to a Client account to purchase this service."
                        : "Purchase this service from the freelancer."}
                    </p>
                  )}
              </div>
            </section>
          )}

          {/* =====================================================
              JOB DETAILS
          ===================================================== */}

          {!isService && (
            <section className="mt-8 rounded-2xl border bg-background">
              {/* BUDGET */}

              <div className="border-b p-6">
                <p className="text-sm text-muted-foreground">
                  Job budget
                </p>

                <p className="mt-1 text-3xl font-bold tracking-tight">
                  ₱
                  {Number(
                    service.price,
                  ).toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>

              {/* DETAILS */}

              <div className="p-6">
                <h2 className="text-base font-semibold">
                  Job details
                </h2>

                <div className="mt-5 space-y-5">
                  {/* DEADLINE */}

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">
                      Deadline
                    </span>

                    <span className="text-sm font-medium">
                      {
                        service.delivery_time_days
                      }{" "}
                      {service.delivery_time_days ===
                      1
                        ? "day"
                        : "days"}
                    </span>
                  </div>

                  {/* CATEGORY */}

                  {service.category?.name && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">
                        Category
                      </span>

                      <span className="text-right text-sm font-medium">
                        {
                          service.category.name
                        }
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

          {/* =====================================================
              REVIEWS
              SERVICE ONLY
          ===================================================== */}

          {isService &&
            service.freelancer_id && (
              <section className="mt-8">
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
                <h2 className="text-lg font-semibold">
                  Switch to Client?
                </h2>

                <p className="mt-2 text-sm text-muted-foreground">
                  This service can only be
                  purchased by clients. Switch
                  to your Client account to
                  continue?
                </p>
              </div>
            </div>

            {/* DIALOG ACTIONS */}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={switchingRole}
                onClick={() =>
                  setShowRoleDialog(false)
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
                disabled={switchingRole}
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