"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import MarketplaceFilters, {
  type MarketplaceFiltersValue,
} from "./MarketplaceFilters";

interface MarketplaceFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  onApply: (
    filters: MarketplaceFiltersValue,
  ) => void;

  initialFilters?: MarketplaceFiltersValue;
}

export default function MarketplaceFilterSheet({
  open,
  onOpenChange,
  onApply,
  initialFilters,
}: MarketplaceFilterSheetProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
    >
      <SheetContent className="w-[420px] overflow-hidden p-0 sm:w-[480px]">
        <div className="flex h-full flex-col">

          {/* ==================================================
              HEADER
          ================================================== */}

          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle>
              Refine Results
            </SheetTitle>

            <SheetDescription>
              Adjust filters to improve your
              marketplace results.
            </SheetDescription>
          </SheetHeader>

          {/* ==================================================
              BODY
          ================================================== */}

          <div className="flex-1 overflow-y-auto px-6 py-6">
            <MarketplaceFilters
              initialFilters={initialFilters}
              onApply={onApply}
            />
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}