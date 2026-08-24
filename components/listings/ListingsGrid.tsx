import type { MarketplaceService } from "@/services/marketplace/MarketplaceServices";

import { ListingCard } from "./ListingCard";

interface ListingsGridProps {
  services: MarketplaceService[];
  onDelete?: (serviceId: string) => void;
}


export function ListingsGrid({
  services,
  onDelete,
}: ListingsGridProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {services.map((service) => (
        <ListingCard
          key={service.service_id}
          service={service}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}