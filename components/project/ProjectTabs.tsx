"use client";

import { ChevronDown } from "lucide-react";

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

const filters: FilterType[] = [
  "All",
  "Request",
  "In Discussion",
  "Active",
  "Completed",
  "Cancelled",
];

export function ProjectTabs({
  activeFilter,
  onFilterChange,
}: ProjectTabsProps) {
  return (
    <div className="min-w-0">
      <label className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2 md:hidden">
        <span className="text-sm text-muted-foreground">Show projects</span>
        <div className="relative min-w-0 max-w-[65%]">
          <select
            aria-label="Project status"
            value={activeFilter}
            onChange={(event) => onFilterChange(event.target.value as FilterType)}
            className="min-h-11 w-full appearance-none bg-transparent pr-7 text-right text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {filters.map((value) => (
              <option key={value} value={value}>
                {value === "Request" ? "Requests" : value}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-0 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
      </label>
      <div className="hidden gap-1 border-b pb-2 md:flex md:flex-wrap md:items-center">
        {filters.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={activeFilter === value}
            onClick={() => onFilterChange(value)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-md px-4 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
              activeFilter === value
                ? "bg-primary/10 font-semibold text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {value === "Request" ? "Requests" : value}
          </button>
        ))}
      </div>
    </div>
  );
}
