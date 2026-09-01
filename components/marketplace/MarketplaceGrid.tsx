"use client";

import { Card, CardContent } from "@/components/ui/card";
import MarketplaceCard from "./MarketplaceCard";
import type { MarketplaceItem } from "@/services/marketplace/MarketplaceServices";

interface Props {
  services: MarketplaceItem[];
  loading?: boolean;
  onCardClick?: (listing: MarketplaceItem) => void;
}

export default function MarketplaceGrid({
  services,
  loading = false,
  onCardClick,
}: Props) {
  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="py-10 text-center text-muted-foreground">
          Loading marketplace...
        </CardContent>
      </Card>
    );
  }

  if (services.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="py-10 text-center text-muted-foreground">
          No marketplace listings found.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {services.map((listing) => {
            const id =
              listing.listing_type === "service"
                ? listing.service_id
                : listing.job_id;

            return (
              <MarketplaceCard
                key={`${listing.listing_type}-${id}`}
                listing={listing}
                onClick={() => onCardClick?.(listing)}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
