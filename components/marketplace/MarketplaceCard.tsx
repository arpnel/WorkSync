"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { BriefcaseBusiness, CalendarDays, Wallet } from "lucide-react";
import type { MarketplaceItem } from "@/services/marketplace/MarketplaceServices";

interface Props {
  listing: MarketplaceItem;
  onClick?: () => void;
}

export default function MarketplaceCard({ listing, onClick }: Props) {
  const isService = listing.listing_type === "service";
  const profile = isService
    ? listing.freelancer?.profile
    : listing.client?.profile;
  const ownerName =
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    (isService ? "Freelancer" : "Client");
  const priceLabel = isService
    ? new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        maximumFractionDigits: 2,
      }).format(listing.price)
    : new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        maximumFractionDigits: 0,
      }).format(listing.budget_max);

  if (!isService) {
    return (
      <button
        type="button"
        className="block w-full text-left"
        onClick={onClick}
        disabled={!onClick}
      >
        <Card className="flex min-h-[280px] w-full flex-col gap-0 overflow-hidden rounded-lg border bg-background p-0 transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-start justify-between gap-3 border-b bg-muted/30 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage
                  src={profile?.avatar_url ?? undefined}
                  alt={ownerName}
                />
                <AvatarFallback>
                  {(ownerName[0] ?? "C").toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{ownerName}</p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BriefcaseBusiness className="h-3.5 w-3.5" />
                  Job opportunity
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded-md border bg-background px-2 py-1 text-[10px] font-medium capitalize">
              {listing.status}
            </span>
          </div>

          <div className="flex flex-1 flex-col p-4">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                {listing.category?.name ?? "Uncategorized"}
              </span>
              <span className="rounded-md bg-primary/10 px-2 py-1 text-[10px] text-primary">
                {listing.pricing_type === "hourly" ? "Hourly" : "Fixed price"}
              </span>
            </div>

            <h3 className="mt-3 line-clamp-2 text-base font-semibold leading-6">
              {listing.title}
            </h3>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {listing.description}
            </p>

            <div className="mt-auto grid grid-cols-2 gap-3 border-t pt-4">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5" />
                  Budget
                </p>
                <p className="mt-1 truncate text-sm font-semibold">
                  {priceLabel}
                </p>
              </div>
              <div className="min-w-0 text-right">
                <p className="flex items-center justify-end gap-1.5 text-[10px] uppercase text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Deadline
                </p>
                <p className="mt-1 truncate text-sm font-medium">
                  {listing.deadline
                    ? new Date(listing.deadline).toLocaleDateString("en-PH")
                    : "Flexible"}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="block w-full text-left"
      onClick={onClick}
      disabled={!onClick}
    >
      <Card className="w-full overflow-hidden rounded-xl border bg-background transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="relative aspect-[1.7/1] w-full overflow-hidden bg-muted">
          {isService && listing.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={listing.cover_image_url}
              alt={listing.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {isService ? "Service Thumbnail" : "Job Posting"}
            </div>
          )}

          <span className="absolute right-2.5 top-2.5 rounded-md bg-background/90 px-2 py-1 text-[10px] font-medium shadow-sm">
            {isService ? "Service" : "Job"}
          </span>
        </div>

        <div className="space-y-3 p-3.5">
          <div className="flex items-center gap-2.5">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage
                src={profile?.avatar_url ?? undefined}
                alt={ownerName}
              />
              <AvatarFallback className="text-xs">
                {(ownerName[0] ?? "U").toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{ownerName}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {listing.freelancer?.headline || "Freelancer"}
              </p>
            </div>
          </div>

          <h3 className="line-clamp-2 text-sm font-medium leading-[1.35]">
            {listing.title}
          </h3>

          <div className="flex items-center gap-1.5 overflow-hidden">
            <span className="truncate rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {listing.category?.name ?? "Category"}
            </span>
            <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
              {listing.service_type === "milestone" ? "Milestone" : "Standard"}
            </span>
          </div>

          <div className="flex items-end justify-between border-t pt-2.5">
            <div>
              <p className="text-[9px] uppercase text-muted-foreground">
                Starting at
              </p>
              <p className="text-lg font-bold leading-tight">{priceLabel}</p>
            </div>

            <div className="text-right text-[10px] text-muted-foreground">
              <p>{listing.delivery_time_days} days</p>
              <p>{listing.revisions_count} revisions</p>
            </div>
          </div>
        </div>
      </Card>
    </button>
  );
}
