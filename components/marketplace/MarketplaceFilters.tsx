"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SortOption = "latest" | "lowestPrice" | "highestRated";
export type ListingType = "freelancer" | "client";
export interface MarketplaceFiltersValue {
  sort: SortOption[];
  listingType: ListingType;
  minPrice: string;
  maxPrice: string;
  rating: number;
  savedOnly: boolean;
}
interface MarketplaceFiltersProps {
  filters: MarketplaceFiltersValue;
  onChange: (filters: MarketplaceFiltersValue) => void;
}

export default function MarketplaceFilters({
  filters,
  onChange,
}: MarketplaceFiltersProps) {
  const services = filters.listingType === "freelancer";
  const hasFilters = Boolean(
    filters.savedOnly ||
    filters.listingType !== "freelancer" ||
    filters.minPrice ||
    filters.maxPrice ||
    filters.rating,
  );
  return (
    <div aria-label="Marketplace filters" className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">Listing type</legend>
        {[
          { value: "freelancer", label: "Services" },
          { value: "client", label: "Jobs" },
        ].map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm"
          >
            <input
              type="radio"
              name="marketplace-listing-type"
              value={option.value}
              checked={filters.listingType === option.value}
              onChange={() =>
                onChange({
                  ...filters,
                  listingType: option.value as ListingType,
                })
              }
              className="size-4 accent-primary"
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm">
        <input
          type="checkbox"
          checked={filters.savedOnly}
          onChange={(event) =>
            onChange({ ...filters, savedOnly: event.target.checked })
          }
          className="size-4 accent-primary"
        />
        Saved listings only
      </label>
      <fieldset className="grid min-w-0 grid-cols-2 gap-2">
        <legend className="mb-2 text-xs font-medium text-muted-foreground">
          {services ? "Price" : "Budget"} range (PHP)
        </legend>
        <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
          <span>Minimum</span>
          <Input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            placeholder="No minimum"
            value={filters.minPrice}
            onChange={(event) =>
              onChange({ ...filters, minPrice: event.target.value })
            }
            className="bg-card"
          />
        </label>
        <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
          <span>Maximum</span>
          <Input
            type="number"
            min={filters.minPrice || "0"}
            step="any"
            inputMode="decimal"
            placeholder="No maximum"
            value={filters.maxPrice}
            onChange={(event) =>
              onChange({ ...filters, maxPrice: event.target.value })
            }
            className="bg-card"
          />
        </label>
      </fieldset>
      {services && (
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
          <span>Minimum rating</span>
          <select
            className="h-11 w-full rounded-lg border bg-card px-3 text-sm text-foreground"
            value={filters.rating}
            onChange={(event) =>
              onChange({ ...filters, rating: Number(event.target.value) })
            }
          >
            <option value="0">Any rating</option>
            {[1, 2, 3, 4, 5].map((rating) => (
              <option key={rating} value={rating}>
                {rating} {rating === 1 ? "star" : "stars"}
                {rating < 5 ? " & up" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {hasFilters && (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() =>
            onChange({
              ...filters,
              listingType: "freelancer",
              savedOnly: false,
              minPrice: "",
              maxPrice: "",
              rating: 0,
            })
          }
        >
          <RotateCcw className="size-4" />
          Reset filters
        </Button>
      )}
    </div>
  );
}
