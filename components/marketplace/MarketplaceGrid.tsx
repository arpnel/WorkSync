"use client";

import { Card, CardContent } from "@/components/ui/card";
import MarketplaceCard from "./MarketplaceCard";
import type { MarketplaceItem } from "@/services/marketplace/MarketplaceServices";

import { Bookmark, BookmarkCheck, Search } from "lucide-react";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { Button } from "@/components/ui/button";
import { listingKey } from "@/services/marketplace/listingActions";
import { useFreelancerAvailability } from "@/hooks/useFreelancerAvailability";

interface Props {
  ratings?: Map<string, number>;
  saved?: Set<string>;
  saving?: string | null;
  onSave?: (listing: MarketplaceItem) => void;
  services: MarketplaceItem[];
  loading?: boolean;
  onCardClick?: (listing: MarketplaceItem) => void;
}

export default function MarketplaceGrid({
  services,
  ratings,
  loading = false,
  onCardClick,
  saved = new Set(),
  saving = null,
  onSave,
}: Props) {
  const availability = useFreelancerAvailability(services.flatMap(item => item.freelancer_id ? [item.freelancer_id] : []));
  if (loading)
    return (
      <ContentSkeleton label="Loading marketplace" variant="marketplace" />
    );

  if (services.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="py-10 text-center text-muted-foreground">
          <Search className="mx-auto mb-3 size-8" aria-hidden="true" />
          <p className="font-semibold text-foreground">No matching listings</p>
          <p className="mt-1">Try another search or adjust your filters.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="min-w-0">
      <div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {services.map((listing) => {
            const id =
              listing.listing_type === "service"
                ? listing.service_id
                : listing.job_id;
            const isSaved = saved.has(listingKey(listing.listing_type, id));

            return (
              <div
                key={`${listing.listing_type}-${id}`}
                className="relative min-w-0"
              >
                <MarketplaceCard
                  available={availability.get(listing.freelancer_id ?? "")}
                  listing={listing}
                  rating={ratings?.get(listing.freelancer_id ?? "")}
                  onClick={() => onCardClick?.(listing)}
                />
                {onSave && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={`absolute right-2.5 top-2.5 size-11 rounded-full shadow-sm transition-colors ${isSaved
                      ? "border-emerald-600 bg-emerald-600 text-white hover:border-emerald-700 hover:bg-emerald-700 hover:text-white dark:border-emerald-400 dark:bg-emerald-700 dark:text-white dark:hover:border-emerald-300 dark:hover:bg-emerald-600"
                      : "border-emerald-600 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 dark:border-emerald-500 dark:bg-emerald-950/70 dark:text-emerald-300 dark:hover:bg-emerald-900 dark:hover:text-emerald-200"}`}
                    aria-label={isSaved ? "Remove from saved listings" : "Save listing"}
                    aria-pressed={isSaved}
                    disabled={!!saving}
                    onClick={() => onSave(listing)}
                  >
                    {isSaved ? <BookmarkCheck /> : <Bookmark />}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
