"use client";

import * as React from "react";

export type FilterType =
  | "All"
  | "Request"
  | "In Discussion"
  | "Active"
  | "Completed";

interface ProjectTabsProps {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
}

export function ProjectTabs({
  activeFilter,
  onFilterChange,
}: ProjectTabsProps) {
  const filters: FilterType[] = [
    "All",
    "Request",
    "In Discussion",
    "Active",
    "Completed",
  ];

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-center gap-6 border-b">
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => onFilterChange(filter)}
            className={`pb-3 text-sm transition-colors ${
              activeFilter === filter
                ? "border-b-2 border-primary font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {filter === "Request" ? "Requests" : filter}
          </button>
        ))}
      </div>
    </div>
  );
}