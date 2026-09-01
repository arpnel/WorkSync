"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Pencil,
  Trash2,
} from "lucide-react";

import type {
  MarketplaceItem,
  MarketplaceService,
  MarketplaceJob,
} from "@/services/marketplace/MarketplaceServices";

interface ListingCardProps {
  listing: MarketplaceItem;
  onDelete?: (listingId: string) => void;
}

export function ListingCard({
  listing,
  onDelete,
}: ListingCardProps) {
  const isService = listing.listing_type === "service";
  const isJob = listing.listing_type === "job";

  /* ==========================================================
     SERVICE DATA
  ========================================================== */

  const service = isService
    ? (listing as MarketplaceService)
    : null;

  /* ==========================================================
     JOB DATA
  ========================================================== */

  const job = isJob
    ? (listing as MarketplaceJob)
    : null;

  /* ==========================================================
     OWNER / FREELANCER
  ========================================================== */

  const displayName =
    service?.freelancer?.profile?.display_name ||
    `${service?.freelancer?.profile?.first_name ?? ""} ${
      service?.freelancer?.profile?.last_name ?? ""
    }`.trim() ||
    "Freelancer";

  const initials =
    service?.freelancer?.profile?.display_name?.slice(0, 2) ||
    `${service?.freelancer?.profile?.first_name?.[0] ?? ""}${
      service?.freelancer?.profile?.last_name?.[0] ?? ""
    }` ||
    "F";

  /* ==========================================================
     ID
  ========================================================== */

  const listingId = isService
    ? service?.service_id
    : job?.job_id;

  /* ==========================================================
     IMAGE
  ========================================================== */

  const coverImage = isService
    ? service?.cover_image_url
      : null;

  /* ==========================================================
     TITLE
  ========================================================== */

  const title = listing.title || "Untitled Listing";

  /* ==========================================================
     STATUS
  ========================================================== */

  const status = listing.status;

  /* ==========================================================
     PRICE
  ========================================================== */

  const price = isService
    ? service?.price
      : null;

  /* ==========================================================
     DELETE
  ========================================================== */

  const handleDelete = () => {
    if (!listingId) {
      return;
    }

    onDelete?.(listingId);
  };

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <Card
      className="
        mx-auto
        w-full
        overflow-hidden
        rounded-3xl
        border
        bg-background
        shadow-md
        transition
        hover:-translate-y-1
        hover:shadow-lg
      "
    >
      {/* =====================================================
          IMAGE
      ===================================================== */}

      <div className="relative flex h-44 items-center justify-center overflow-hidden border-b bg-muted">
        {coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImage}
            alt={title}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-sm text-muted-foreground">
            {isService
              ? "Service Thumbnail"
              : "Job Thumbnail"}
          </span>
        )}

        <Badge
          variant="secondary"
          className="absolute right-3 top-3 bg-background/90"
        >
          {status}
        </Badge>

        {/* LISTING TYPE */}

        <Badge
          variant="outline"
          className="absolute left-3 top-3 bg-background/90"
        >
          {isService ? "Service" : "Job"}
        </Badge>
      </div>

      {/* =====================================================
          CONTENT
      ===================================================== */}

      <div className="space-y-3 p-4">

        {/* ===================================================
            OWNER
        =================================================== */}

        {isService ? (
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarImage
                src={
                  service?.freelancer?.profile?.avatar_url ??
                  undefined
                }
                alt={displayName}
              />

              <AvatarFallback>
                {initials.toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {displayName}
              </p>

              <p className="truncate text-xs text-muted-foreground">
                {service?.freelancer?.headline ||
                  "Freelancer"}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarFallback>
                C
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                Client Job
              </p>

              <p className="truncate text-xs text-muted-foreground">
                Job posting
              </p>
            </div>
          </div>
        )}

        {/* ===================================================
            TITLE
        =================================================== */}

        <h3 className="line-clamp-2 text-sm font-medium leading-5">
          {title}
        </h3>

        {/* ===================================================
            CATEGORY
        =================================================== */}

        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px]">
            {listing.category?.name ?? "Category"}
          </span>

          {isService && (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
              {service?.service_type === "milestone"
                ? "Milestone"
                : "Standard"}
            </span>
          )}

          {isJob && (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
              {job?.pricing_type === "hourly"
                ? "Hourly"
                : "Fixed"}
            </span>
          )}
        </div>

        {/* ===================================================
            SERVICE DETAILS
        =================================================== */}

        {isService && (
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-md bg-muted px-2 py-1 text-[11px]">
              {service?.delivery_time_days}{" "}
              {service?.delivery_time_days === 1
                ? "Day"
                : "Days"}
            </span>

            <span className="rounded-md bg-muted px-2 py-1 text-[11px]">
              {service?.revisions_count}{" "}
              {service?.revisions_count === 1
                ? "Revision"
                : "Revisions"}
            </span>
          </div>
        )}

        {/* ===================================================
            JOB DETAILS
        =================================================== */}

        {isJob && (
          <div className="flex flex-wrap gap-1.5">
            {job?.pricing_type && (
              <span className="rounded-md bg-muted px-2 py-1 text-[11px]">
                {job.pricing_type === "hourly"
                  ? "Hourly"
                  : "Fixed Price"}
              </span>
            )}
          </div>
        )}

        {/* ===================================================
            FOOTER
        =================================================== */}

        <div className="flex items-end justify-between gap-3 border-t pt-3">

          {/* PRICE */}

          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {isService
                ? "Starting From"
                : "Budget"}
            </p>

            <p className="truncate text-xl font-bold text-primary">
              ₱
              {Number(price ?? 0).toLocaleString(
                "en-PH",
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                },
              )}
            </p>
          </div>

          {/* =================================================
              ACTIONS
          ================================================= */}

          <div className="flex shrink-0 gap-2">

            {/* EDIT */}

            <button
              type="button"
              className="
                flex
                h-9
                w-9
                items-center
                justify-center
                rounded-md
                border
                bg-background
                transition
                hover:bg-muted
              "
              onClick={(event) => {
                event.stopPropagation();
              }}
              aria-label={
                isService
                  ? "Edit service"
                  : "Edit job"
              }
            >
              <Pencil className="h-4 w-4" />
            </button>

            {/* DELETE */}

            <button
              type="button"
              className="
                flex
                h-9
                w-9
                items-center
                justify-center
                rounded-md
                border
                border-destructive
                text-destructive
                transition
                hover:bg-destructive
                hover:text-destructive-foreground
              "
              onClick={(event) => {
                event.stopPropagation();
                handleDelete();
              }}
              aria-label={
                isService
                  ? "Delete service"
                  : "Delete job"
              }
            >
              <Trash2 className="h-4 w-4" />
            </button>

          </div>
        </div>
      </div>
    </Card>
  );
}