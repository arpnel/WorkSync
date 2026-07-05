"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Rating } from "@/components/reui/rating";
import { cn } from "@/lib/utils";

type SortOption =
  | "latest"
  | "lowestPrice"
  | "highestRated";

export interface MarketplaceFiltersProps {
  onApply?: (filters: {
    sort: SortOption[];
    showFreelancers: boolean;
    showClientJobs: boolean;
    minPrice: string;
    maxPrice: string;
    rating: number;
  }) => void;
}

export default function MarketplaceFilters({
  onApply,
}: MarketplaceFiltersProps) {
  const [rating, setRating] = useState(0);

  const [filters, setFilters] = useState({
    sort: ["latest"] as SortOption[],

    showFreelancers: true,
    showClientJobs: true,

    minPrice: "",
    maxPrice: "",
  });

  function apply(updated = filters, currentRating = rating) {
    onApply?.({
      ...updated,
      rating: currentRating,
    });
  }

  function toggleSort(option: SortOption) {
    setFilters((prev) => {
      const exists = prev.sort.includes(option);

      const updated = {
        ...prev,
        sort: exists
          ? prev.sort.filter((s) => s !== option)
          : [...prev.sort, option],
      };

      apply(updated);
      return updated;
    });
  }

  return (
    <div className="space-y-6 py-2">
      {/* SORT (chips style) */}
      <div>
        <h3 className="mb-3 text-sm font-semibold">
          Sort & Refine
        </h3>

        <div className="flex flex-wrap gap-2">
          {[
            { key: "latest", label: "Latest" },
            { key: "lowestPrice", label: "Lowest Price" },
            { key: "highestRated", label: "Highest Rated" },
          ].map((item) => {
            const active = filters.sort.includes(
              item.key as SortOption
            );

            return (
              <button
                key={item.key}
                onClick={() =>
                  toggleSort(item.key as SortOption)
                }
                className={cn(
                  "px-3 py-1 rounded-full text-xs border transition",
                  active
                    ? "bg-black text-white"
                    : "bg-transparent hover:bg-muted"
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <hr />

      {/* LISTING TYPE */}
      <div>
        <h3 className="mb-3 text-sm font-semibold">
          Listing Type
        </h3>

        <div className="space-y-3">
          <Field orientation="horizontal">
            <Checkbox
              checked={filters.showFreelancers}
              onCheckedChange={(checked) => {
                const updated = {
                  ...filters,
                  showFreelancers: checked === true,
                };

                setFilters(updated);
                apply(updated);
              }}
            />
            <FieldLabel>Freelancer Services</FieldLabel>
          </Field>

          <Field orientation="horizontal">
            <Checkbox
              checked={filters.showClientJobs}
              onCheckedChange={(checked) => {
                const updated = {
                  ...filters,
                  showClientJobs: checked === true,
                };

                setFilters(updated);
                apply(updated);
              }}
            />
            <FieldLabel>Client Job Posts</FieldLabel>
          </Field>
        </div>
      </div>

      <hr />

      {/* PRICE */}
      <div>
        <h3 className="mb-3 text-sm font-semibold">
          Price Range
        </h3>

        <FieldGroup className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>Minimum</FieldLabel>
            <Input
              value={filters.minPrice}
              onChange={(e) => {
                const updated = {
                  ...filters,
                  minPrice: e.target.value,
                };

                setFilters(updated);
              }}
              placeholder="0"
            />
          </Field>

          <Field>
            <FieldLabel>Maximum</FieldLabel>
            <Input
              value={filters.maxPrice}
              onChange={(e) => {
                const updated = {
                  ...filters,
                  maxPrice: e.target.value,
                };

                setFilters(updated);
              }}
              placeholder="10000"
            />
          </Field>
        </FieldGroup>
      </div>

      <hr />

      {/* RATING */}
      <div>
        <h3 className="mb-3 text-sm font-semibold">
          Minimum Rating
        </h3>

        <Rating
          rating={rating}
          editable
          showValue
          onRatingChange={(value) => {
            setRating(value);
            apply(filters, value);
          }}
        />
      </div>

      <hr />

      {/* ACTIONS */}
      <div className="flex gap-3">
        <Button
          className="flex-1"
          onClick={() => apply()}
        >
          Apply
        </Button>

        <Button
          variant="outline"
          className="flex-1"
          onClick={() => {
            const reset = {
              sort: ["latest"] as SortOption[],
              showFreelancers: true,
              showClientJobs: true,
              minPrice: "",
              maxPrice: "",
            };

            setFilters(reset);
            setRating(0);

            apply(reset, 0);
          }}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}