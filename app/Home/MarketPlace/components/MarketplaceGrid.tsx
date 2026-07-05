"use client";

import { Card, CardContent } from "@/components/ui/card";

import MarketplaceCard from "./MarketplaceCard";
import type { Freelancer } from "./types";

interface MarketplaceGridProps {
  freelancers: Freelancer[];
  loading?: boolean;
  onCardClick?: (freelancer: Freelancer) => void;
}

export default function MarketplaceGrid({
  freelancers,
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

  if (freelancers.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="py-10 text-center text-muted-foreground">
          No freelancers found.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
          {freelancers.map((freelancer) => (
            <MarketplaceCard
              key={freelancer.freelancerid}
              freelancer={freelancer}
              onClick={() => onCardClick?.(freelancer)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}