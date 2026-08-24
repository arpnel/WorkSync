"use client";

import { Card } from "@/components/ui/card";
import { Button as CardButton } from "@/components/ui/CardButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Rating } from "@/components/ui/rating";

import type { MarketplaceService } from "@/services/marketplace/MarketplaceServices";

interface MarketplaceCardProps {
  service: MarketplaceService;
  onClick?: (serviceId: string) => void;
}

export default function MarketplaceCard({
  service,
  onClick,
}: MarketplaceCardProps) {
  /* ==========================================================
     LISTING TYPE
  ========================================================== */

  const isJob = service.listing_type === "job";
  const isService = service.listing_type === "service";

  /* ==========================================================
     OWNER PROFILE

     Service -> Freelancer
     Job     -> Client
  ========================================================== */

  const profile = isJob ? service.client?.profile : service.freelancer?.profile;

  /* ==========================================================
     OWNER NAME
  ========================================================== */

  const ownerName =
    profile?.display_name ||
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
    (isJob ? "Client" : "Freelancer");

  /* ==========================================================
     OWNER INITIAL
  ========================================================== */

  const initials =
    profile?.display_name?.[0] ||
    profile?.first_name?.[0] ||
    (isJob ? "C" : "F");

  /* ==========================================================
     OWNER SUBTITLE

     Service -> Freelancer headline
     Job     -> Client
  ========================================================== */

  const ownerSubtitle = isJob
    ? "Client"
    : service.freelancer?.headline || "Freelancer";

  return (
    <CardButton
      onClick={() => onClick?.(service.service_id)}
      className="block w-full text-left"
    >
      <Card className="w-full overflow-hidden rounded-xl border bg-background transition hover:-translate-y-0.5 hover:shadow-md">
        {/* ======================================================
            THUMBNAIL
        ====================================================== */}

        <div className="relative aspect-[1.7/1] w-full overflow-hidden bg-muted">
          {service.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={service.cover_image_url}
              alt={service.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              {isJob ? "Job Thumbnail" : "Service Thumbnail"}
            </div>
          )}

          {/* Listing Type Badge */}

          <div className="absolute right-2.5 top-2.5">
            <span className="rounded-md bg-background/90 px-2 py-1 text-[10px] font-medium shadow-sm backdrop-blur">
              {isJob ? "Job" : "Service"}
            </span>
          </div>
        </div>

        <div className="px-3.5 pb-3.5 pt-3">
          {/* ====================================================
              OWNER
          ==================================================== */}

          <div className="flex items-center gap-2.5">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage
                src={profile?.avatar_url ?? undefined}
                alt={ownerName}
              />

              <AvatarFallback className="text-xs">
                {initials.toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{ownerName}</p>

              <p className="truncate text-[11px] text-muted-foreground">
                {ownerSubtitle}
              </p>
            </div>
          </div>

          {/* ====================================================
              TITLE
          ==================================================== */}

          <div className="mt-2.5">
            <h3 className="line-clamp-2 text-sm font-medium leading-[1.35]">
              {service.title || (isJob ? "Untitled Job" : "Untitled Service")}
            </h3>
          </div>

          {/* ====================================================
              CATEGORY + TYPE
          ==================================================== */}

          <div className="mt-2 flex items-center gap-1.5 overflow-hidden">
            {service.category?.name && (
              <span className="truncate rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                {service.category.name}
              </span>
            )}

            {isJob ? (
              <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                Job
              </span>
            ) : (
              service.service_type && (
                <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                  {service.service_type === "milestone"
                    ? "Milestone"
                    : "Standard"}
                </span>
              )
            )}
          </div>

          {/* ====================================================
              RATING

              Services -> Freelancer rating
              Jobs     -> No rating
          ==================================================== */}

          {isService ? (
            <div className="mt-2 flex items-center gap-1.5">
              <Rating rating={4.8} showValue />

              <span className="text-[10px] text-muted-foreground">New</span>
            </div>
          ) : (
            <div className="mt-2 h-[18px]" />
          )}

          {/* ====================================================
              FOOTER
          ==================================================== */}

          <div className="mt-3 flex items-end justify-between border-t pt-2.5">
            {/* ==================================================
                PRICE / BUDGET
            ================================================== */}

            <div>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                {isJob ? "Budget" : "Starting at"}
              </p>

              <p className="text-lg font-bold leading-tight">
                ₱{Number(service.price).toLocaleString()}
              </p>
            </div>

            {/* ==================================================
                DETAILS
            ================================================== */}

            <div className="text-right text-[10px] leading-4 text-muted-foreground">
              {isService ? (
                <>
                  <p>
                    {service.delivery_time_days}{" "}
                    {service.delivery_time_days === 1 ? "day" : "days"}
                  </p>

                  <p>
                    {service.revisions_count}{" "}
                    {service.revisions_count === 1 ? "revision" : "revisions"}
                  </p>
                </>
              ) : (
                <p>Job Posting</p>
              )}
            </div>
          </div>
        </div>
      </Card>
    </CardButton>
  );
}
