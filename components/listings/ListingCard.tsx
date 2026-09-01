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
} from "@/services/marketplace/MarketplaceServices";

interface ListingCardProps {
  listing: MarketplaceItem;

  onDelete?: (
    listingId: string,
  ) => void;

  onEdit?: (
    listingId: string,
  ) => void;
}

export function ListingCard({
  listing,
  onDelete,
  onEdit,
}: ListingCardProps) {
  const isService =
    listing.listing_type ===
    "service";

  const isJob =
    listing.listing_type ===
    "job";

  const listingId = isService
    ? listing.service_id
    : listing.job_id;

  const profile = isService
    ? listing.freelancer?.profile
    : listing.client?.profile;

  const displayName =
    profile?.display_name ||
    `${profile?.first_name ?? ""} ${
      profile?.last_name ?? ""
    }`.trim() ||
    (isService
      ? "Freelancer"
      : "Client");

  return (
    <Card className="mx-auto w-full overflow-hidden rounded-3xl border bg-background shadow-md transition hover:-translate-y-1 hover:shadow-lg">
      {/* ==================================================
          MEDIA
      ================================================== */}

      <div className="relative flex h-44 items-center justify-center overflow-hidden border-b bg-muted">
        {isService &&
        listing.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={
              listing.cover_image_url
            }
            alt={
              listing.title
            }
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-sm text-muted-foreground">
            {isJob
              ? "Job Posting"
              : "Service Thumbnail"}
          </span>
        )}

        <Badge
          variant="secondary"
          className="absolute right-3 top-3 bg-background/90"
        >
          {listing.status}
        </Badge>
      </div>

      <div className="space-y-3 p-4">
        {/* ==================================================
            OWNER
        ================================================== */}

        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage
              src={
                profile?.avatar_url ??
                undefined
              }
              alt={
                displayName
              }
            />

            <AvatarFallback>
              {displayName[0]?.toUpperCase() ??
                "U"}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {displayName}
            </p>

            <p className="text-xs text-muted-foreground">
              {isService
                ? "Freelancer"
                : "Client"}
            </p>
          </div>
        </div>

        {/* ==================================================
            TITLE
        ================================================== */}

        <h3 className="line-clamp-2 text-sm font-medium leading-5">
          {listing.title}
        </h3>

        {/* ==================================================
            CATEGORY + TYPE
        ================================================== */}

        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px]">
            {listing.category
              ?.name ??
              "Category"}
          </span>

          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
            {isService
              ? listing.service_type ===
                "milestone"
                ? "Milestone"
                : "Standard"
              : "Job"}
          </span>
        </div>

        {/* ==================================================
            DETAILS
        ================================================== */}

        <div className="flex flex-wrap gap-1.5">
          {isService ? (
            <>
              <span className="rounded-md bg-muted px-2 py-1 text-[11px]">
                {
                  listing.delivery_time_days
                }{" "}
                Days
              </span>

              <span className="rounded-md bg-muted px-2 py-1 text-[11px]">
                {
                  listing.revisions_count
                }{" "}
                Revision
                {listing.revisions_count !==
                  1 &&
                  "s"}
              </span>
            </>
          ) : (
            <>
              <span className="rounded-md bg-muted px-2 py-1 text-[11px]">
                {
                  listing.pricing_type
                }
              </span>

              {listing.deadline && (
                <span className="rounded-md bg-muted px-2 py-1 text-[11px]">
                  Deadline:{" "}
                  {new Date(
                    listing.deadline,
                  ).toLocaleDateString(
                    "en-PH",
                  )}
                </span>
              )}
            </>
          )}
        </div>

        {/* ==================================================
            FOOTER
        ================================================== */}

        <div className="flex items-end justify-between border-t pt-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {isService
                ? "Starting From"
                : "Budget"}
            </p>

            {isService ? (
              <p className="text-xl font-bold text-primary">
                ₱
                {Number(
                  listing.price,
                ).toLocaleString()}
              </p>
            ) : (
              <p className="text-xl font-bold text-primary">
                ₱
                {Number(
                  listing.budget_min,
                ).toLocaleString()}
                {listing.budget_max !==
                  listing.budget_min &&
                  ` - ₱${Number(
                    listing.budget_max,
                  ).toLocaleString()}`}
              </p>
            )}
          </div>

          {/* ==================================================
              ACTIONS
          ================================================== */}

          <div className="flex gap-2">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-md border bg-background transition hover:bg-muted"
              onClick={(
                event,
              ) => {
                event.stopPropagation();

                onEdit?.(
                  listingId,
                );
              }}
            >
              <Pencil className="h-4 w-4" />
            </button>

            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-destructive text-destructive transition hover:bg-destructive hover:text-destructive-foreground"
              onClick={(
                event,
              ) => {
                event.stopPropagation();

                onDelete?.(
                  listingId,
                );
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}