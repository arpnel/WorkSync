import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Pencil, Trash2 } from "lucide-react";

import type { MarketplaceService } from "@/services/marketplace/MarketplaceServices";

interface ListingCardProps {
  service: MarketplaceService;
  onDelete?: (serviceId: string) => void;
}

export function ListingCard({
  service,
  onDelete,
}: ListingCardProps) {
  const isJob = service.listing_type === "job";

  /*
   * My Listings already filters the listings based on
   * the user's CURRENT role:
   *
   * freelancer -> service
   * client     -> job
   *
   * Therefore, we only need to display the correct owner
   * information based on the listing itself.
   */

  const profile = isJob
    ? service.client?.profile
    : service.freelancer?.profile;

  const displayName =
    profile?.display_name ||
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
    (isJob ? "Client" : "Freelancer");

  return (
    <Card className="mx-auto w-full overflow-hidden rounded-3xl border bg-background shadow-md transition hover:-translate-y-1 hover:shadow-lg">
      {/* Listing Media */}
      <div className="relative flex h-44 items-center justify-center overflow-hidden border-b bg-muted">
        {service.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={service.cover_image_url}
            alt={service.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-sm text-muted-foreground">
            {isJob ? "Job Thumbnail" : "Service Thumbnail"}
          </span>
        )}

        <Badge
          variant="secondary"
          className="absolute right-3 top-3 bg-background/90"
        >
          {service.status}
        </Badge>
      </div>

      <div className="space-y-3 p-4">
        {/* Owner */}
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage
              src={profile?.avatar_url ?? undefined}
              alt={displayName}
            />

            <AvatarFallback>
              {displayName[0]?.toUpperCase() ?? "U"}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {displayName}
            </p>

            <p className="text-xs text-muted-foreground">
              {isJob ? "Client" : "Freelancer"}
            </p>
          </div>
        </div>

        {/* Listing Title */}
        <h3 className="line-clamp-2 text-sm font-medium leading-5">
          {service.title}
        </h3>

        {/* Category + Type */}
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px]">
            {service.category?.name ?? "Category"}
          </span>

          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
            {isJob
              ? "Job"
              : service.service_type === "milestone"
                ? "Milestone"
                : "Standard"}
          </span>
        </div>

        {/* Details */}
        <div className="flex flex-wrap gap-1.5">
          {isJob ? (
            <span className="rounded-md bg-muted px-2 py-1 text-[11px]">
              Job Posting
            </span>
          ) : (
            <>
              <span className="rounded-md bg-muted px-2 py-1 text-[11px]">
                {service.delivery_time_days} Days
              </span>

              <span className="rounded-md bg-muted px-2 py-1 text-[11px]">
                {service.revisions_count} Revision
                {service.revisions_count !== 1 && "s"}
              </span>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-end justify-between border-t pt-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {isJob ? "Budget" : "Starting From"}
            </p>

            <p className="text-xl font-bold text-primary">
              ₱{Number(service.price).toLocaleString()}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {/* Edit */}
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-md border bg-background transition hover:bg-muted"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <Pencil className="h-4 w-4" />
            </button>

            {/* Delete */}
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-destructive text-destructive transition hover:bg-destructive hover:text-destructive-foreground"
              onClick={(event) => {
                event.stopPropagation();

                onDelete?.(service.service_id);
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