"use client";

import { Card, CardContent } from "@/components/ui/card";

import MarketplaceCard from "./MarketplaceCard";

import type { MarketplaceService } from "@/services/marketplace/MarketplaceServices";

interface MarketplaceGridProps {
  services: MarketplaceService[];
  loading?: boolean;
  onCardClick?: (serviceId: string) => void;
}

export default function MarketplaceGrid({
  services,
  loading = false,
  onCardClick,
}: MarketplaceGridProps) {
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
          {services.map((service) => (
            <MarketplaceCard
              key={`${service.listing_type}-${service.service_id}`}
              service={service}
              onClick={() => {
                if (!service.service_id) {
                  console.error(
                    "MarketplaceGrid: service_id is undefined.",
                  );
                  return;
                }

                onCardClick?.(service.service_id);
              }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}