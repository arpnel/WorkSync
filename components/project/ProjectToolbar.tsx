"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowDownAZ,
  ArrowDownUp,
  ArrowUpAZ,
  BriefcaseBusiness,
  Search,
} from "lucide-react";

export type SortMode = "date" | "name" | "budget";

interface ProjectToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;

  sortMode: SortMode;
  setSortMode: React.Dispatch<React.SetStateAction<SortMode>>;

  dateAscending: boolean;
  setDateAscending: React.Dispatch<React.SetStateAction<boolean>>;

  nameAscending: boolean;
  setNameAscending: React.Dispatch<React.SetStateAction<boolean>>;

  budgetAscending: boolean;
  setBudgetAscending: React.Dispatch<React.SetStateAction<boolean>>;
}

export function ProjectToolbar({
  search,
  onSearchChange,
  sortMode,
  setSortMode,
  dateAscending,
  setDateAscending,
  nameAscending,
  setNameAscending,
  budgetAscending,
  setBudgetAscending,
}: ProjectToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Search */}
      <div className="relative w-full sm:max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
          placeholder="Search projects..."
        />
      </div>

      {/* Sort Buttons */}
      <div className="flex w-full gap-2 sm:w-auto">
        {/* Date */}
        <Button
          variant={sortMode === "date" ? "secondary" : "outline"}
          size="sm"
          onClick={() => {
            setSortMode("date");
            setDateAscending((value) => !value);
          }}
          className="flex-1 gap-1.5 sm:flex-none"
        >
          <ArrowDownUp className="h-4 w-4" />

          {dateAscending ? "Oldest" : "Newest"}
        </Button>

        {/* Name */}
        <Button
          variant={sortMode === "name" ? "secondary" : "outline"}
          size="sm"
          onClick={() => {
            setSortMode("name");
            setNameAscending((value) => !value);
          }}
          className="flex-1 gap-1.5 sm:flex-none"
        >
          {nameAscending ? (
            <ArrowDownAZ className="h-4 w-4" />
          ) : (
            <ArrowUpAZ className="h-4 w-4" />
          )}

          {nameAscending ? "A-Z" : "Z-A"}
        </Button>

        {/* Budget */}
        <Button
          variant={sortMode === "budget" ? "secondary" : "outline"}
          size="sm"
          onClick={() => {
            setSortMode("budget");
            setBudgetAscending((value) => !value);
          }}
          className="flex-1 gap-1.5 sm:flex-none"
        >
          <BriefcaseBusiness className="h-4 w-4" />

          {budgetAscending ? "Lowest" : "Highest"}
        </Button>
      </div>
    </div>
  );
}