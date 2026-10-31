"use client";
import { StyledSelect } from "@/components/ui/styled-select";


import * as React from "react";
import {
  Search,
  SlidersHorizontal,
  Plus,
  Check,
  LayoutGrid,
  Palette,
  Code,
  Video,
  Gamepad2,
  Smartphone,
  ClipboardCheck,
  Database,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { marketplaceCategories } from "../../types/marketplace/marketplace-categories";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

/* ==========================================================
   CATEGORY ICONS
========================================================== */

const categoryIcons: Record<string, React.ElementType> = {
  "Game Development": Gamepad2,
  "UI/UX Design & Prototyping": Palette,
  "Mobile App Development": Smartphone,
  Animation: Video,
  "Software Testing & QA": ClipboardCheck,
  "Database Development": Database,
  "Web Development": Code,
};

/* ==========================================================
   PROPS
========================================================== */

interface MarketplaceHeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
  onSearch: () => void;

  onFilterClick: () => void;
  onCreateClick: () => void;

  selectedService: string | null;
  hasExternalFilter?: boolean;
  externalFilterLabel?: string;
  onServiceChange: (service: string | null) => void;
}

/* ==========================================================
   COMPONENT
========================================================== */

export default function MarketplaceHeader({
  search,
  onSearchChange,
  onSearch,
  onFilterClick,
  onCreateClick,
  selectedService,
  hasExternalFilter = false,
  externalFilterLabel = "Selected category",
  onServiceChange,
}: MarketplaceHeaderProps) {
  return (
    <Card className="w-full rounded-lg border-0 bg-transparent p-0 shadow-none md:border md:bg-card md:p-5">
      <div className="space-y-5">
        {/* ==================================================
            SEARCH + ACTIONS
        ================================================== */}

        <Field>
          <div className="grid grid-cols-2 gap-2 lg:flex lg:gap-3">
            <div className="relative col-span-2 min-w-0 flex-1">
              <Search
                className="
                  absolute
                  left-4
                  top-1/2
                  h-4
                  w-4
                  -translate-y-1/2
                  text-muted-foreground
                "
              />

              <Input
                aria-label="Search marketplace"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search services, jobs, or skills..."
                className="h-12 rounded-xl pl-11 pr-14 lg:pr-3"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    onSearch();
                  }
                }}
              />
              <Button
                type="button"
                size="icon"
                onClick={onSearch}
                aria-label="Search marketplace"
                className="absolute right-1 top-1 size-10 rounded-lg lg:hidden"
              >
                <Search className="size-4" />
              </Button>
            </div>

            <Button
              type="button"
              onClick={onSearch}
              className="hidden h-12 rounded-xl px-6 lg:inline-flex"
            >
              <Search className="h-4 w-4" />
              Search
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={onFilterClick}
              className="h-10 rounded-md lg:h-12"
            >
              <SlidersHorizontal className="size-4" />
              Filters
            </Button>
            <Button
              type="button"
              onClick={onCreateClick}
              variant="outline"
              className="h-10 rounded-md lg:h-12"
            >
              <Plus className="h-4 w-4" />
              Create
            </Button>
          </div>
        </Field>

        {/* ==================================================
            MARKETPLACE CATEGORIES
        ================================================== */}

        <label className="block min-w-0 space-y-2 md:hidden">
          <span className="text-sm font-medium">Browse categories</span>
          <StyledSelect
            aria-label="Browse marketplace categories"
            value={hasExternalFilter ? "__external__" : (selectedService ?? "")}
            onChange={(event) => onServiceChange(event.target.value || null)}
            className="h-12 w-full min-w-0 rounded-xl border bg-card px-3 text-base"
          >
            <option value="">All listings</option>
            {hasExternalFilter && (
              <option value="__external__">{externalFilterLabel}</option>
            )}
            {marketplaceCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </StyledSelect>
        </label>
        <div className="relative hidden w-full min-w-0 md:block">
          <Carousel
            opts={{
              align: "start",
              dragFree: true,
            }}
            className="w-full"
          >
            <div className="flex items-center gap-2">
              <CarouselPrevious
                className="
                  hidden md:flex
                  static
                  translate-y-0
                  shrink-0
                "
              />

              <div className="min-w-0 flex-1">
                <CarouselContent className="-ml-2">
                  {/* ==================================================
                      ALL LISTINGS
                  ================================================== */}

                  <CarouselItem className="basis-auto pl-2">
                    <Button
                      type="button"
                      variant={
                        selectedService === null && !hasExternalFilter
                          ? "default"
                          : "outline"
                      }
                      className="shrink-0 rounded-full"
                      onClick={() => {
                        onServiceChange(null);
                        onSearch();
                      }}
                    >
                      <LayoutGrid className="h-4 w-4" />
                      All Listings
                      {selectedService === null && !hasExternalFilter && (
                        <Check className="ml-2 h-4 w-4" />
                      )}
                    </Button>
                  </CarouselItem>

                  {/* ==================================================
                      CATEGORIES
                  ================================================== */}

                  {marketplaceCategories.map((category) => {
                    const CategoryIcon = categoryIcons[category];
                    const categorySelected = category === selectedService;
                    return (
                      <CarouselItem
                        key={category}
                        className="basis-auto pl-2"
                      >
                        <Button
                          type="button"
                          aria-pressed={categorySelected}
                          variant={categorySelected ? "default" : "outline"}
                          className="shrink-0 rounded-full"
                          onClick={() => {
                            onServiceChange(categorySelected ? null : category);
                            onSearch();
                          }}
                        >
                          {CategoryIcon && <CategoryIcon className="h-4 w-4" />}
                          {category}
                          {categorySelected && <Check className="ml-1 h-4 w-4" />}
                        </Button>
                      </CarouselItem>
                    );
                  })}
                </CarouselContent>
              </div>

              <CarouselNext
                className="
                  hidden md:flex
                  static
                  translate-y-0
                  shrink-0
                "
              />
            </div>
          </Carousel>
        </div>

        {/* ==================================================
            ACTIVE SERVICE INDICATOR
        ================================================== */}

        {selectedService && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Selected service:</span>

            <span
              className="
                rounded-full
                bg-primary/10
                px-2.5
                py-1
                font-medium
                text-primary
              "
            >
              {selectedService}
            </span>

            <button
              type="button"
              onClick={() => {
                onServiceChange(null);
                onSearch();
              }}
              className="font-medium hover:text-foreground"
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
