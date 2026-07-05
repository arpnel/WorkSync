"use client";

import * as React from "react";
import {Search, SlidersHorizontal, Plus, ChevronDown} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { marketplaceCategories } from "../components/marketplace-categories";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";


interface MarketplaceHeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  onFilterClick: () => void;
  onCreateClick: () => void;

  view: string;
  onViewChange: (value: string) => void;
}

export default function MarketplaceHeader({
  search,
  onSearchChange,
  onSearch,
  onFilterClick,
  onCreateClick,
  view,
  onViewChange,
}: MarketplaceHeaderProps) {
  return (
    <Card className="w-full rounded-2xl border p-6 shadow-sm">
      <div className="space-y-5">
        {/* Search + Actions */}
        <Field>
          <div className="flex flex-col gap-3 lg:flex-row">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search freelancers, services, or skills..."
                className="h-11 rounded-xl pl-11"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onSearch();
                  }
                }}
              />
            </div>

            {/* Search Button */}
            <Button
              onClick={onSearch}
              className="h-11 px-6 rounded-xl"
            >
              <Search className="mr-2 h-4 w-4" />
              Search
            </Button>

            {/* Filter */}
            <Button
              variant="outline"
              onClick={onFilterClick}
              className="h-11 rounded-xl border-border bg-background hover:bg-accent"
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Filters
            </Button>

            {/* Create */}
            <Button
              onClick={onCreateClick}
              className="h-11 rounded-xl"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create
            </Button>
          </div>
        </Field>

        {/* Marketplace Categories */}
        <div className=" flex gap-2  overflow-x-auto  pb-1  scrollbar-none  [-ms-overflow-style:none]  [scrollbar-width:none]  [&::-webkit-scrollbar]:hidden">
          {marketplaceCategories.map((category) => (
            <Popover key={category.name}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="shrink-0 rounded-full"
                >
                  {category.name}
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </PopoverTrigger>

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
                      Select a service
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-1">
                    {category.services.map((service) => (
                      <Button
                        key={service}
                        variant={
                          view === service
                            ? "default"
                            : "ghost"
                        }
                        className="justify-start"
                        onClick={() => onViewChange(service)}
                      >
                        {service}
                      </Button>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          ))}
        </div>

      </div>
    </Card>
  );
}