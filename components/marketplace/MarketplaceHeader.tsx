"use client";

import * as React from "react";
import {
  Search,
  SlidersHorizontal,
  Plus,
  ChevronDown,
  Check,
  LayoutGrid,
  Palette,
  Code,
  Video,
  PenTool,
  Megaphone,
  Brain,
  Music,
  BriefcaseBusiness,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { marketplaceCategories } from "../../types/marketplace/marketplace-categories";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  "Creative & Design": Palette,
  "Development & IT": Code,
  "Video & Animation": Video,
  "Writing & Translation": PenTool,
  Marketing: Megaphone,
  "AI & Data": Brain,
  "Audio & Music": Music,
  Business: BriefcaseBusiness,
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
  onServiceChange,
}: MarketplaceHeaderProps) {
  return (
    <Card className="w-full rounded-2xl border p-6 shadow-sm">
      <div className="space-y-5">
        {/* ==================================================
            SEARCH + ACTIONS
        ================================================== */}

        <Field>
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
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
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search freelancers, services, jobs, or skills..."
                className="h-11 rounded-xl pl-11"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    onSearch();
                  }
                }}
              />
            </div>

            <Button
              type="button"
              onClick={onSearch}
              className="h-11 rounded-xl px-6"
            >
              <Search className="mr-2 h-4 w-4" />
              Search
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={onFilterClick}
              className="
                h-11
                rounded-xl
                border-border
                bg-background
                hover:bg-accent
              "
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Filters
            </Button>

            <Button
              type="button"
              onClick={onCreateClick}
              className="h-11 rounded-xl"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create
            </Button>
          </div>
        </Field>

        {/* ==================================================
            MARKETPLACE CATEGORIES
        ================================================== */}

        <div className="relative w-full">
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
                      variant={selectedService === null ? "default" : "outline"}
                      className="shrink-0 rounded-full"
                      onClick={() => {
                        onServiceChange(null);
                        onSearch();
                      }}
                    >
                      <LayoutGrid className="mr-2 h-4 w-4" />
                      All Listings
                      {selectedService === null && (
                        <Check className="ml-2 h-4 w-4" />
                      )}
                    </Button>
                  </CarouselItem>

                  {/* ==================================================
                      CATEGORIES
                  ================================================== */}

                  {marketplaceCategories.map((category) => {
                    const CategoryIcon = categoryIcons[category.name];

                    const categorySelected = category.services.some(
                      (service) => service === selectedService,
                    );

                    return (
                      <CarouselItem
                        key={category.name}
                        className="basis-auto pl-2"
                      >
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant={categorySelected ? "default" : "outline"}
                              className="shrink-0 rounded-full"
                            >
                              {CategoryIcon && (
                                <CategoryIcon className="mr-2 h-4 w-4" />
                              )}

                              {category.name}

                              <ChevronDown className="ml-2 h-4 w-4" />

                              {categorySelected && (
                                <Check className="ml-1 h-4 w-4" />
                              )}
                            </Button>
                          </PopoverTrigger>

                          {/* ==================================================
                              CATEGORY POPOVER
                          ================================================== */}

                          <PopoverContent
                            align="start"
                            className="w-[320px] p-3"
                          >
                            <div className="space-y-3">
                              <div>
                                <h4 className="font-semibold">
                                  {category.name}
                                </h4>

                                <p className="text-xs text-muted-foreground">
                                  Select a category service
                                </p>
                              </div>

                              {/* ==================================================
                                  ALL SERVICES IN CATEGORY
                              ================================================== */}

                              <Button
                                type="button"
                                variant={categorySelected ? "outline" : "ghost"}
                                className="w-full justify-between"
                                onClick={() => {
                                  onServiceChange(null);
                                  onSearch();
                                }}
                              >
                                <span>All {category.name}</span>
                              </Button>

                              {/* ==================================================
                                  SERVICES
                              ================================================== */}

                              <div className="grid grid-cols-1 gap-1">
                                {category.services.map((service) => {
                                  const selected = selectedService === service;

                                  return (
                                    <Button
                                      key={service}
                                      type="button"
                                      variant={selected ? "default" : "ghost"}
                                      className="justify-between"
                                      onClick={() => {
                                        onServiceChange(service);

                                        /*
                                         * Search is triggered after
                                         * the selected service state
                                         * is changed. The parent can
                                         * use selectedService to
                                         * perform the actual query.
                                         */
                                        onSearch();
                                      }}
                                    >
                                      <span>{service}</span>

                                      {selected && (
                                        <Check className="h-4 w-4" />
                                      )}
                                    </Button>
                                  );
                                })}
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </CarouselItem>
                    );
                  })}
                </CarouselContent>
              </div>

              <CarouselNext
                className="
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
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
