"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Archive,
  BriefcaseBusiness,
  CalendarDays,
  Pencil,
  Wallet,
} from "lucide-react";

import type {
  MarketplaceItem,
  MarketplaceService,
  MarketplaceJob,
} from "@/services/marketplace/MarketplaceServices";

interface ListingCardProps {
  listing: MarketplaceItem;
  onArchive?: (listingId: string) => void;
}

export function ListingCard({ listing, onArchive }: ListingCardProps) {
  const isService = listing.listing_type === "service";
  const isJob = listing.listing_type === "job";

  /* ==========================================================
     SERVICE DATA
  ========================================================== */

  const service = isService ? (listing as MarketplaceService) : null;

  /* ==========================================================
     JOB DATA
  ========================================================== */

  const job = isJob ? (listing as MarketplaceJob) : null;

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

  const listingId = isService ? service?.service_id : job?.job_id;

  /* ==========================================================
     IMAGE
  ========================================================== */

  const coverImage = isService ? service?.cover_image_url : null;

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

  const price = isService ? service?.price : null;

  /* ==========================================================
     ARCHIVE
  ========================================================== */

  const handleArchive = () => {
    if (!listingId) {
      return;
    }

    onArchive?.(listingId);
  };

  if (job) {
    const clientProfile = job.client?.profile;
    const clientName =
      clientProfile?.display_name ||
      [clientProfile?.first_name, clientProfile?.last_name]
        .filter(Boolean)
        .join(" ") ||
      "Client";
    const clientInitial = (clientName[0] ?? "C").toUpperCase();

    return (
      <Card className="mx-auto flex min-h-[300px] w-full flex-col gap-0 overflow-hidden rounded-lg border bg-background p-0 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-start justify-between gap-3 border-b bg-muted/30 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage
                src={clientProfile?.avatar_url ?? undefined}
                alt={clientName}
              />
              <AvatarFallback>{clientInitial}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{clientName}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <BriefcaseBusiness className="h-3.5 w-3.5" />
                Your job post
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0 capitalize">
            {job.status}
          </Badge>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground">
              {job.category?.name ?? "Uncategorized"}
            </span>
            <span className="rounded-md bg-primary/10 px-2 py-1 text-[10px] text-primary">
              {job.pricing_type === "hourly" ? "Hourly" : "Fixed price"}
            </span>
          </div>

          <h3 className="mt-3 line-clamp-2 text-base font-semibold leading-6">
            {title}
          </h3>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {job.description}
          </p>

          <div className="mt-auto grid grid-cols-2 gap-3 border-t pt-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" />
                Maximum budget
              </p>
              <p className="mt-1 truncate text-sm font-semibold">
                PHP {Number(job.budget_max).toLocaleString("en-PH")}
              </p>
            </div>
            <div className="min-w-0 text-right">
              <p className="flex items-center justify-end gap-1.5 text-[10px] uppercase text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                Deadline
              </p>
              <p className="mt-1 truncate text-sm font-medium">
                {job.deadline
                  ? new Date(job.deadline).toLocaleDateString("en-PH")
                  : "Flexible"}
              </p>
            </div>
          </div>

          <div className="mt-4 flex justify-end border-t pt-3">
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition hover:bg-muted"
              onClick={(event) => {
                event.stopPropagation();
                handleArchive();
              }}
            >
              <Archive className="h-4 w-4" />
              Archive
            </button>
          </div>
        </div>
      </Card>
    );
  }

  /* ==========================================================
     SERVICE CARD
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
            {isService ? "Service Thumbnail" : "Job Thumbnail"}
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
                src={service?.freelancer?.profile?.avatar_url ?? undefined}
                alt={displayName}
              />

              <AvatarFallback>{initials.toUpperCase()}</AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{displayName}</p>

              <p className="truncate text-xs text-muted-foreground">
                {service?.freelancer?.headline || "Freelancer"}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarFallback>C</AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Client Job</p>

              <p className="truncate text-xs text-muted-foreground">
                Job posting
              </p>
            </div>
          </div>
        )}

        {/* ===================================================
            TITLE
        =================================================== */}

        <h3 className="line-clamp-2 text-sm font-medium leading-5">{title}</h3>

        {/* ===================================================
            CATEGORY
        =================================================== */}

        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px]">
            {listing.category?.name ?? "Category"}
          </span>

          {isService && (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
              {service?.service_type === "milestone" ? "Milestone" : "Standard"}
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
              {service?.delivery_time_days === 1 ? "Day" : "Days"}
            </span>

            <span className="rounded-md bg-muted px-2 py-1 text-[11px]">
              {service?.revisions_count}{" "}
              {service?.revisions_count === 1 ? "Revision" : "Revisions"}
            </span>
          </div>
        )}

        {/* ===================================================
            FOOTER
        =================================================== */}

        <div className="flex items-end justify-between gap-3 border-t pt-3">
          {/* PRICE */}

          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {isService ? "Starting From" : "Budget"}
            </p>

            <p className="truncate text-xl font-bold text-primary">
              ₱
              {Number(price ?? 0).toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
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
              aria-label={isService ? "Edit service" : "Edit job"}
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
                handleArchive();
              }}
              aria-label={isService ? "Archive service" : "Archive job"}
            >
              <Archive className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
