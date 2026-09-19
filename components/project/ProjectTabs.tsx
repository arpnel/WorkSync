"use client";

import * as React from "react";

export type FilterType =
  | "All"
  | "Request"
  | "In Discussion"
  | "Active"
  | "Completed"
  | "Cancelled";

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
    "Cancelled",
  ];

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            aria-pressed={activeFilter === filter}
            onClick={() => onFilterChange(filter)}
            className={`min-h-11 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
              activeFilter === filter
                ? "bg-primary text-primary-foreground font-medium"
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
