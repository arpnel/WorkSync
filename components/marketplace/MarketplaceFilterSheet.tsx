"use client";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import MarketplaceFilters, {
  type MarketplaceFiltersValue,
} from "./MarketplaceFilters";
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFilters: MarketplaceFiltersValue;
  onApply: (filters: MarketplaceFiltersValue) => void;
}
function FilterForm({
  initialFilters,
  onApply,
}: Pick<Props, "initialFilters" | "onApply">) {
  const [draft, setDraft] = useState(initialFilters);
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(draft);
      }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <MarketplaceFilters filters={draft} onChange={setDraft} />
      </div>
      <div className="shrink-0 border-t p-5">
        <Button type="submit" className="w-full">
          Apply filters
        </Button>
      </div>
    </form>
  );
}
export default function MarketplaceFilterSheet({
  open,
  onOpenChange,
  initialFilters,
  onApply,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[420px]">
        <SheetHeader className="border-b px-5 py-5">
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>
            Choose listing type, saved listings, price, and rating.
          </SheetDescription>
        </SheetHeader>
        {open && (
          <FilterForm initialFilters={initialFilters} onApply={onApply} />
        )}
      </SheetContent>
    </Sheet>
  );
}
