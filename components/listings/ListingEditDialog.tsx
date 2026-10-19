"use client";

import { ServiceDialog } from "@/components/services/ServiceDialog";
import type { MarketplaceItem } from "@/services/marketplace/MarketplaceServices";

export function ListingEditDialog({
  listing,
  onClose,
  onSaved,
}: {
  listing: MarketplaceItem;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  return (
    <ServiceDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      listing={listing}
      onCreated={onSaved}
    />
  );
}
