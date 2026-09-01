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

/*
 * WorkSync no longer uses marketplace_listings.
 *
 * The marketplace now uses:
 *
 * services
 * jobs
 *
 * This helper allows this component to recognize a job
 * without requiring listing_type or job_id to exist on
 * MarketplaceService.
 */
function isJobListing(service: MarketplaceService): boolean {
  const record = service as MarketplaceService & Record<string, unknown>;

  return typeof record.job_id === "string" || typeof record.jobId === "string";
}

export default function MarketplaceServiceDetails({
  serviceId,
}: MarketplaceServiceDetailsProps) {
  const [service, setService] = useState<MarketplaceService | null>(null);

  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);

  const [loading, setLoading] = useState(true);

  const [roleLoading, setRoleLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [showRoleDialog, setShowRoleDialog] = useState(false);

  const [switchingRole, setSwitchingRole] = useState(false);

  /* ==========================================================
     LOAD CURRENT USER ROLE
  ========================================================== */

  useEffect(() => {
    async function loadUserRole() {
      try {
        setRoleLoading(true);

        const role = await getCurrentUserRole();

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

      setCurrentUserRole(role);
    }

    window.addEventListener("account-role-changed", handleRoleChanged);

    return () => {
      window.removeEventListener("account-role-changed", handleRoleChanged);
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

      try {
        setLoading(true);
        setError(null);

        const data = await getMarketplaceService(serviceId);

        if (!data) {
          setService(null);

          setError("Listing not found.");

          return;
        }

        setService(data);
      } catch (err) {
        console.error("Failed to load marketplace listing:", err);

        setService(null);

        setError(
          err instanceof Error ? err.message : "Failed to load listing.",
        );
      } finally {
        setLoading(false);
      }
    }

    loadService();
  }, [serviceId]);

  /* ==========================================================
     LISTING ACTION
  ========================================================== */

  function handleServiceAction() {
    if (!service) {
      return;
    }

    /*
     * Jobs use the Apply flow.
     */
    if (isJobListing(service)) {
      console.log("Continue with job application flow.");

      return;
    }

    /*
     * Services are purchased by clients.
     */
    if (currentUserRole === "freelancer") {
      setShowRoleDialog(true);

      return;
    }

    if (currentUserRole !== "client") {
      console.error("Client role is required to purchase a service.");

      return;
    }

    /*
     * Connect the service-order creation
     * flow here.
     */
    console.log("Continue with service purchase:", service.service_id);
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
      <div
        className="
        flex
        min-h-[400px]
        items-center
        justify-center
        px-4
      "
      >
        <p
          className="
          text-sm
          text-muted-foreground
        "
        >
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
      <div
        className="
        flex
        min-h-[400px]
        items-center
        justify-center
        px-4
      "
      >
        <div
          className="
          max-w-md
          text-center
        "
        >
          <h2
            className="
            text-lg
            font-semibold
          "
          >
            Unable to load listing
          </h2>

          <p
            className="
            mt-2
            text-sm
            text-muted-foreground
          "
          >
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
      <div
        className="
        flex
        min-h-[400px]
        items-center
        justify-center
        px-4
      "
      >
        <p
          className="
          text-sm
          text-muted-foreground
        "
        >
          Listing not found.
        </p>
      </div>
    );
  }

  /* ==========================================================
     LISTING TYPE
  ========================================================== */

  const isJob = isJobListing(service);

  const isService = !isJob;

  /* ==========================================================
     CURRENT ROLE
  ========================================================== */

  const isFreelancer = currentUserRole === "freelancer";

  /* ==========================================================
     DISPLAY VALUES
  ========================================================== */

  const title = service.title || (isJob ? "Untitled Job" : "Untitled Service");

  const description = service.description || "No description provided.";

  const categoryName = service.category?.name || "Category";

  const price = Number(service.price ?? 0);

  const deliveryDays = Number(service.delivery_time_days ?? 0);

  const revisions = Number(service.revisions_count ?? 0);

  const serviceType =
    service.service_type === "milestone" ? "Milestone" : "Standard";

  const actionLabel = isJob ? "Apply" : "Buy";

  /* ==========================================================
     RETURN
  ========================================================== */

  return (
    <>
      <div
        className="
        w-full
        px-4
        py-5
        sm:px-6
        sm:py-6
      "
      >
        <div
          className="
          mx-auto
          w-full
          max-w-4xl
        "
        >
          {/* ==================================================
              IMAGE
          ================================================== */}

          <div
            className="
            overflow-hidden
            rounded-xl
            border
            bg-muted
            sm:rounded-2xl
          "
          >
            {service.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={service.cover_image_url}
                alt={title}
                className="
                  aspect-[16/9]
                  w-full
                  object-cover
                  sm:aspect-[1.8/1]
                  sm:max-h-[500px]
                "
              />
            ) : (
              <div
                className="
                flex
                aspect-[16/9]
                w-full
                items-center
                justify-center
                sm:aspect-[1.8/1]
                sm:h-[400px]
              "
              >
                <span
                  className="
                  text-sm
                  text-muted-foreground
                "
                >
                  {isJob ? "Job Thumbnail" : "Service Thumbnail"}
                </span>
              </div>
            )}
          </div>

          {/* ==================================================
              TITLE
          ================================================== */}

          <div
            className="
            mt-5
            sm:mt-6
          "
          >
            <div
              className="
              flex
              flex-wrap
              items-center
              gap-2
            "
            >
              <span
                className="
                rounded-md
                bg-primary/10
                px-2.5
                py-1
                text-[11px]
                font-medium
                text-primary
              "
              >
                {isJob ? "Job" : "Service"}
              </span>

              {isService && (
                <span
                  className="
                  rounded-md
                  bg-muted
                  px-2.5
                  py-1
                  text-[11px]
                  font-medium
                  text-muted-foreground
                "
                >
                  {serviceType}
                </span>
              )}
            </div>

            <h1
              className="
              mt-3
              text-xl
              font-bold
              tracking-tight
              sm:text-2xl
              md:text-3xl
            "
            >
              {title}
            </h1>

            {service.category?.name && (
              <p
                className="
                mt-2
                text-sm
                text-muted-foreground
              "
              >
                {service.category.name}
              </p>
            )}
          </div>

          {/* ==================================================
              DESCRIPTION
          ================================================== */}

          <section
            className="
            mt-7
            sm:mt-8
          "
          >
            <h2
              className="
              text-lg
              font-semibold
            "
            >
              {isJob ? "About this job" : "About this service"}
            </h2>

            <p
              className="
              mt-3
              whitespace-pre-wrap
              text-sm
              leading-6
              text-muted-foreground
            "
            >
              {description}
            </p>
          </section>

          {/* ==================================================
              DETAILS CARD
          ================================================== */}

          <section
            className="
            mt-7
            overflow-hidden
            rounded-xl
            border
            bg-background
            sm:mt-8
            sm:rounded-2xl
          "
          >
            {/* =================================================
                PRICE
            ================================================= */}

            <div
              className="
              border-b
              p-5
              sm:p-6
            "
            >
              <p
                className="
                text-sm
                text-muted-foreground
              "
              >
                {isJob ? "Job budget" : "Service price"}
              </p>

              <p
                className="
                mt-1
                text-2xl
                font-bold
                tracking-tight
                sm:text-3xl
              "
              >
                ₱
                {price.toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>

            {/* =================================================
                DETAILS
            ================================================= */}

            <div
              className="
              p-5
              sm:p-6
            "
            >
              <h2
                className="
                text-base
                font-semibold
              "
              >
                {isJob ? "Job details" : "Service details"}
              </h2>

              <div
                className="
                mt-5
                space-y-4
                sm:space-y-5
              "
              >
                {/* DELIVERY / DEADLINE */}

                <div
                  className="
                  flex
                  items-start
                  justify-between
                  gap-4
                "
                >
                  <span
                    className="
                    text-sm
                    text-muted-foreground
                  "
                  >
                    {isJob ? "Deadline" : "Delivery"}
                  </span>

                  <span
                    className="
                    text-right
                    text-sm
                    font-medium
                  "
                  >
                    {deliveryDays > 0
                      ? `${deliveryDays} ${deliveryDays === 1 ? "day" : "days"}`
                      : "Not specified"}
                  </span>
                </div>

                {/* REVISIONS */}

                {isService && (
                  <div
                    className="
                    flex
                    items-start
                    justify-between
                    gap-4
                  "
                  >
                    <span
                      className="
                      text-sm
                      text-muted-foreground
                    "
                    >
                      Revisions
                    </span>

                    <span
                      className="
                      text-right
                      text-sm
                      font-medium
                    "
                    >
                      {revisions}
                    </span>
                  </div>
                )}

                {/* SERVICE TYPE */}

                {isService && (
                  <div
                    className="
                    flex
                    items-start
                    justify-between
                    gap-4
                  "
                  >
                    <span
                      className="
                      text-sm
                      text-muted-foreground
                    "
                    >
                      Service type
                    </span>

                    <span
                      className="
                      text-right
                      text-sm
                      font-medium
                    "
                    >
                      {serviceType}
                    </span>
                  </div>
                )}

                {/* LISTING TYPE */}

                <div
                  className="
                  flex
                  items-start
                  justify-between
                  gap-4
                "
                >
                  <span
                    className="
                    text-sm
                    text-muted-foreground
                  "
                  >
                    Listing type
                  </span>

                  <span
                    className="
                    text-right
                    text-sm
                    font-medium
                  "
                  >
                    {isJob ? "Job" : "Service"}
                  </span>
                </div>

                {/* CATEGORY */}

                {service.category?.name && (
                  <div
                    className="
                    flex
                    items-start
                    justify-between
                    gap-4
                  "
                  >
                    <span
                      className="
                      text-sm
                      text-muted-foreground
                    "
                    >
                      Category
                    </span>

                    <span
                      className="
                      max-w-[60%]
                      text-right
                      text-sm
                      font-medium
                    "
                    >
                      {service.category.name}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* =================================================
                ACTION
            ================================================= */}

            <div
              className="
              border-t
              p-5
              sm:p-6
            "
            >
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
                  active:opacity-80
                "
              >
                {actionLabel}
              </button>

              <p
                className="
                mt-3
                text-center
                text-xs
                leading-5
                text-muted-foreground
              "
              >
                {isJob
                  ? "Apply to this job and discuss the project with the client."
                  : isFreelancer
                    ? "Switch to a Client account to purchase this service."
                    : "Purchase this service from the freelancer."}
              </p>
            </div>
          </section>

          {/* ==================================================
              REVIEWS
          ================================================== */}

          {isService && service.freelancer_id && (
            <section
              className="
                mt-7
                sm:mt-8
              "
            >
              <ServiceReviews freelancerId={service.freelancer_id} />
            </section>
          )}
        </div>
      </div>

      {/* ========================================================
          SWITCH TO CLIENT DIALOG
      ======================================================== */}

      {showRoleDialog && isService && (
        <div
          className="
            fixed
            inset-0
            z-[200]
            flex
            items-center
            justify-center
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
            {/* HEADER */}

            <div
              className="
                flex
                items-start
                gap-3
              "
            >
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
                <AlertTriangle
                  className="
                    h-5
                    w-5
                    text-yellow-600
                  "
                />
              </div>

              <div className="min-w-0">
                <h2
                  className="
                    text-lg
                    font-semibold
                  "
                >
                  Switch to Client?
                </h2>

                <p
                  className="
                    mt-2
                    text-sm
                    leading-5
                    text-muted-foreground
                  "
                >
                  This service can only be purchased by clients. Switch to your
                  Client account to continue?
                </p>
              </div>
            </div>

            {/* ACTIONS */}

            <div
              className="
                mt-6
                flex
                flex-col-reverse
                gap-2
                sm:flex-row
                sm:justify-end
              "
            >
              <button
                type="button"
                disabled={switchingRole}
                onClick={() => setShowRoleDialog(false)}
                className="
                    w-full
                    rounded-md
                    border
                    px-4
                    py-2
                    text-sm
                    transition
                    hover:bg-accent
                    disabled:opacity-50
                    sm:w-auto
                  "
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={switchingRole}
                onClick={handleSwitchToClient}
                className="
                    w-full
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
                    sm:w-auto
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
