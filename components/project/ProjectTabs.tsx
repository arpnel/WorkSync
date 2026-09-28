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
      <label className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2 md:hidden">
        <span className="text-sm text-muted-foreground">Show projects</span>
        <select
          aria-label="Project status"
          value={activeFilter}
          onChange={(event) => onFilterChange(event.target.value as FilterType)}
          className="min-h-11 min-w-0 max-w-[65%] bg-transparent text-base font-medium"
        >
          {filters.map((filter) => (
            <option key={filter} value={filter}>
              {filter === "Request" ? "Requests" : filter}
            </option>
          ))}
        </select>
      </label>
      <div className="hidden gap-1 border-b pb-2 md:flex md:flex-wrap md:items-center">
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            aria-pressed={activeFilter === filter}
            onClick={() => onFilterChange(filter)}
            className={`min-h-10 rounded-md px-4 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
              activeFilter === filter
                ? "bg-primary/10 text-primary font-semibold"
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
