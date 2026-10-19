"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import {
  BriefcaseBusiness,
  CalendarDays,
  Wallet,
  Star,
  ShieldCheck,
  MapPin,
} from "lucide-react";
import type { MarketplaceItem } from "@/services/marketplace/MarketplaceServices";
import { FreelancerAvailability } from "./FreelancerAvailability";

interface Props {
  available?: boolean;
  freelancerMode?: boolean;
  listing: MarketplaceItem;
  rating?: number;
  onClick?: () => void;
}

export default function MarketplaceCard({ listing, onClick, rating, available, freelancerMode = false }: Props) {
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

  if (freelancerMode && isService) {
    const hourlyRate = listing.freelancer?.hourly_rate;
    const hourlyLabel = hourlyRate == null
      ? "Hourly rate not listed"
      : `${new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(hourlyRate)}/hr`;
    return (
      <button
        type="button"
        className="block h-full w-full rounded-xl text-left focus-visible:outline-2 focus-visible:outline-primary"
        onClick={onClick}
        disabled={!onClick}
      >
        <Card className="flex h-full min-h-[300px] flex-col gap-0 rounded-xl border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
          <div className="flex items-center gap-3">
            <Avatar className="size-14 shrink-0">
              <AvatarImage src={profile?.avatar_url ?? undefined} alt={ownerName} />
              <AvatarFallback>{ownerName.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{ownerName}</p>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {listing.freelancer?.headline || "Freelancer"}
              </p>
            </div>
            {listing.freelancer?.verification_status === "approved" && (
              <ShieldCheck className="size-5 shrink-0 text-primary" aria-label="Verified freelancer" />
            )}
          </div>
          {profile?.location && (
            <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5" />{profile.location}
            </p>
          )}
          <div className="mt-4 flex items-center justify-between border-y py-3 text-sm">
            <span className="flex items-center gap-1.5">
              <Star className="size-4 fill-amber-400 text-amber-500" />
              {rating == null ? "New freelancer" : `${rating.toFixed(1)} rating`}
            </span>
            <span className="font-medium">{hourlyLabel}</span>
          </div>
          <div className="mt-4 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Specialty</p>
            <p className="mt-1 truncate font-medium">{listing.category?.name ?? "Freelance services"}</p>
          </div>
          {(listing.freelancer?.skills?.length || listing.freelancer?.has_portfolio) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {listing.freelancer?.skills?.slice(0, 3).map((skill) => (
                <span key={skill} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                  {skill}
                </span>
              ))}
              {listing.freelancer?.has_portfolio && (
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  Portfolio
                </span>
              )}
            </div>
          )}
          <div className="mt-auto pt-5">
            <p className="text-xs text-muted-foreground">Featured service</p>
            <p className="mt-1 line-clamp-2 font-semibold">{listing.title}</p>
            <p className="mt-2 text-sm text-muted-foreground">Starting at {priceLabel}</p>
          </div>
        </Card>
      </button>
    );
  }

  if (!isService) {
    return (
      <button
        type="button"
        className="block h-full w-full rounded-lg text-left focus-visible:outline-2 focus-visible:outline-primary"
        onClick={onClick}
        disabled={!onClick}
      >
        <Card className="flex h-full min-h-[280px] w-full flex-col gap-0 overflow-hidden rounded-lg border border-border bg-card p-0 shadow-sm transition hover:border-primary/40 hover:shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b bg-muted/35 p-4">
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
            <div className="w-9 shrink-0" />
          </div>

          <div className="flex flex-1 flex-col p-4">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                {listing.category?.name ?? "Uncategorized"}
              </span>
              <span className="rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">
                {listing.pricing_type === "hourly" ? "Hourly" : "Fixed price"}
              </span>
            </div>

            <h3 className="mt-3 line-clamp-2 text-base font-semibold leading-6">
              {listing.title}
            </h3>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {listing.description}
            </p>

            <div className="mt-auto grid grid-cols-1 sm:grid-cols-2 gap-3 border-t pt-4">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs uppercase text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5" />
                  Budget
                </p>
                <p className="mt-1 break-words text-sm font-semibold">
                  {priceLabel}
                </p>
              </div>
              <div className="min-w-0 sm:text-right">
                <p className="flex items-center sm:justify-end gap-1.5 text-xs uppercase text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Deadline
                </p>
                <p className="mt-1 break-words text-sm font-medium">
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
      className="block h-full w-full rounded-lg text-left focus-visible:outline-2 focus-visible:outline-primary"
      onClick={onClick}
      disabled={!onClick}
    >
      <Card className="w-full gap-0 overflow-hidden rounded-lg border bg-card p-0 transition hover:-translate-y-0.5 hover:shadow-md">
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
        </div>

        <div className="space-y-4 p-4">
          <FreelancerAvailability available={available} />
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

          <h3 className="line-clamp-2 text-base font-semibold leading-snug">
            {listing.title}
          </h3>

          {listing.freelancer?.verification_status === "approved" && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Verified freelancer
            </p>
          )}
          {rating != null && (
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <Star
                className="size-3.5 fill-amber-400 text-amber-600"
                aria-hidden="true"
              />
              <span>{rating.toFixed(1)} rating</span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {listing.category?.name ?? "Category"}
            </span>
            <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">
              {listing.service_type === "milestone" ? "Milestone" : "Standard"}
            </span>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-3">
            <div>
              <p className="text-[11px] uppercase text-muted-foreground">
                Starting at
              </p>
              <p className="text-lg font-bold leading-tight">{priceLabel}</p>
            </div>

            <div className="text-right text-xs text-muted-foreground">
              <p className="font-medium capitalize">{listing.pricing_mode}</p>
              <p>{listing.delivery_time_days} days</p>
              <p>{listing.revisions_count} revisions</p>
            </div>
          </div>
        </div>
      </Card>
    </button>
  );
}
