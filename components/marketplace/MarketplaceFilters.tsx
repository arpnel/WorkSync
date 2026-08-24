"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Rating } from "@/components/ui/rating";
import { cn } from "@/lib/utils";

/* ==========================================================
   TYPES
========================================================== */

export type SortOption = "latest" | "lowestPrice" | "highestRated";

export type ListingType = "freelancer" | "client";

export interface MarketplaceFiltersValue {
  sort: SortOption[];
  listingType: ListingType;
  minPrice: string;
  maxPrice: string;
  rating: number;
}

export interface MarketplaceFiltersProps {
  initialFilters?: MarketplaceFiltersValue;

  onApply?: (filters: MarketplaceFiltersValue) => void;
}

/* ==========================================================
   DEFAULT FILTERS
========================================================== */

const DEFAULT_FILTERS: MarketplaceFiltersValue = {
  sort: ["latest"],
  listingType: "freelancer",
  minPrice: "",
  maxPrice: "",
  rating: 0,
};

/* ==========================================================
   COMPONENT
========================================================== */

export default function MarketplaceFilters({
  initialFilters,
  onApply,
}: MarketplaceFiltersProps) {
  const [filters, setFilters] = useState<MarketplaceFiltersValue>(
    initialFilters ?? DEFAULT_FILTERS,
  );

  const [rating, setRating] = useState<number>(initialFilters?.rating ?? 0);

  /* ========================================================
     APPLY
  ======================================================== */

  function handleApply() {
    onApply?.({
      ...filters,
      rating,
    });
  }

  /* ========================================================
     SORT
  ======================================================== */

  function toggleSort(option: SortOption) {
    setFilters((previous: MarketplaceFiltersValue) => {
      const exists = previous.sort.includes(option);

      return {
        ...previous,
        sort: exists
          ? previous.sort.filter((item: SortOption) => item !== option)
          : [...previous.sort, option],
      };
    });
  }

  /* ========================================================
     LISTING TYPE
  ======================================================== */

  function selectListingType(listingType: ListingType) {
    setFilters((previous: MarketplaceFiltersValue) => ({
      ...previous,
      listingType,
    }));
  }

  /* ========================================================
     RESET
  ======================================================== */

  function handleReset() {
    const reset: MarketplaceFiltersValue = {
      ...DEFAULT_FILTERS,
      sort: [...DEFAULT_FILTERS.sort],
    };

    setFilters(reset);
    setRating(0);

    onApply?.(reset);
  }

  /* ========================================================
     RENDER
  ======================================================== */

  return (
    <div className="space-y-6 py-2">
      {/* ====================================================
          SORT
      ==================================================== */}

      <div>
        <h3 className="mb-3 text-sm font-semibold">Sort & Refine</h3>

        <div className="flex flex-wrap gap-2">
          {[
            {
              key: "latest" as SortOption,
              label: "Latest",
            },
            {
              key: "lowestPrice" as SortOption,
              label: "Lowest Price",
            },
            {
              key: "highestRated" as SortOption,
              label: "Highest Rated",
            },
          ].map((item) => {
            const active = filters.sort.includes(item.key);

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => toggleSort(item.key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition",
                  active
                    ? "bg-black text-white"
                    : "bg-background hover:bg-muted",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <hr />

      {/* ====================================================
          LISTING TYPE
      ==================================================== */}

      <div>
        <h3 className="mb-3 text-sm font-semibold">Listing Type</h3>

        <div role="radiogroup" aria-label="Listing Type" className="space-y-3">
          {/* Freelancer Services */}

          <label
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 transition",
              filters.listingType === "freelancer"
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50",
            )}
          >
            <input
              type="radio"
              name="listingType"
              value="freelancer"
              checked={filters.listingType === "freelancer"}
              onChange={() => selectListingType("freelancer")}
              className="h-4 w-4 accent-primary"
            />

            <div className="min-w-0">
              <p className="text-sm font-medium">Freelancer Services</p>

              <p className="text-xs text-muted-foreground">
                Browse services offered by freelancers.
              </p>
            </div>
          </label>

          {/* Client Jobs */}

          <label
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 transition",
              filters.listingType === "client"
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50",
            )}
          >
            <input
              type="radio"
              name="listingType"
              value="client"
              checked={filters.listingType === "client"}
              onChange={() => selectListingType("client")}
              className="h-4 w-4 accent-primary"
            />

            <div className="min-w-0">
              <p className="text-sm font-medium">Client Job Posts</p>

              <p className="text-xs text-muted-foreground">
                Browse jobs posted by clients.
              </p>
            </div>
          </label>
        </div>
      </div>

      <hr />

      {/* ====================================================
          PRICE
      ==================================================== */}

      <div>
        <h3 className="mb-3 text-sm font-semibold">Price Range</h3>

        <FieldGroup className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>Minimum</FieldLabel>

            <Input
              type="number"
              min="0"
              value={filters.minPrice}
              onChange={(event) => {
                const value = event.target.value;

                setFilters((previous: MarketplaceFiltersValue) => ({
                  ...previous,
                  minPrice: value,
                }));
              }}
              placeholder="0"
            />
          </Field>

          <Field>
            <FieldLabel>Maximum</FieldLabel>

            <Input
              type="number"
              min="0"
              value={filters.maxPrice}
              onChange={(event) => {
                const value = event.target.value;

                setFilters((previous: MarketplaceFiltersValue) => ({
                  ...previous,
                  maxPrice: value,
                }));
              }}
              placeholder="10000"
            />
          </Field>
        </FieldGroup>
      </div>

      <hr />

      {/* ====================================================
          RATING
      ==================================================== */}

      <div>
        <h3 className="mb-3 text-sm font-semibold">Minimum Rating</h3>

        <Rating
          rating={rating}
          editable
          showValue
          onRatingChange={(value) => {
            setRating(value);
          }}
        />
      </div>

      <hr />

      {/* ====================================================
          ACTIONS
      ==================================================== */}

      <div className="flex gap-3">
        <Button className="flex-1" type="button" onClick={handleApply}>
          Apply
        </Button>

        <Button
          variant="outline"
          className="flex-1"
          type="button"
          onClick={handleReset}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
