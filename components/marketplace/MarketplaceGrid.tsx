"use client";

import { Card, CardContent } from "@/components/ui/card";
import MarketplaceCard from "./MarketplaceCard";
import type { MarketplaceItem } from "@/services/marketplace/MarketplaceServices";

import { Bookmark, BookmarkCheck, Search } from "lucide-react";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { Button } from "@/components/ui/button";
import { listingKey } from "@/services/marketplace/listingActions";

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

            return (
              <div
                key={`${listing.listing_type}-${id}`}
                className="relative min-w-0"
              >
                <MarketplaceCard
                  listing={listing}
                  rating={ratings?.get(listing.freelancer_id ?? "")}
                  onClick={() => onCardClick?.(listing)}
                />
                {onSave && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="absolute right-2.5 top-2.5 rounded-full bg-background/95 shadow-sm"
                    aria-label={
                      saved.has(listingKey(listing.listing_type, id))
                        ? "Remove from saved listings"
                        : "Save listing"
                    }
                    aria-pressed={saved.has(
                      listingKey(listing.listing_type, id),
                    )}
                    disabled={!!saving}
                    onClick={() => onSave(listing)}
                  >
                    {saved.has(listingKey(listing.listing_type, id)) ? (
                      <BookmarkCheck className="text-primary" />
                    ) : (
                      <Bookmark />
                    )}
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
