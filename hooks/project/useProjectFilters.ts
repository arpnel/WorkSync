"use client";

import * as React from "react";

import type { Project } from "@/components/project/ProjectCard";
import type { FilterType } from "@/components/project/ProjectTabs";
import type { SortMode } from "@/components/project/ProjectToolbar";

export function useProjectFilters(
  projects: Project[]
) {
  // Active status filter
  const [activeFilter, setActiveFilter] =
    React.useState<FilterType>("All");

  // Search
  const [search, setSearch] = React.useState("");

  // Date sorting
  const [dateAscending, setDateAscending] =
    React.useState(false);

  // Name sorting
  const [nameAscending, setNameAscending] =
    React.useState(true);

  // Budget sorting
  const [budgetAscending, setBudgetAscending] =
    React.useState(false);

  // Currently selected sort
  const [sortMode, setSortMode] =
    React.useState<SortMode>("date");

  const filteredProjects = React.useMemo(() => {
    let result = [...projects];

    /*
     * Status filter
     */
    if (activeFilter !== "All") {
      result = result.filter(
        (project) => project.status === activeFilter
      );
    }

    /*
     * Search
     */
    if (search.trim()) {
      const query = search.toLowerCase().trim();

      result = result.filter(
        (project) =>
          project.title
            .toLowerCase()
            .includes(query) ||
          project.client
            .toLowerCase()
            .includes(query)
      );
    }

    /*
     * Sorting
     */
    result.sort((a, b) => {
      /*
       * Date
       */
      if (sortMode === "date") {
        const comparison =
          new Date(a.createdAt).getTime() -
          new Date(b.createdAt).getTime();

        return dateAscending
          ? comparison
          : -comparison;
      }

      /*
       * Name
       */
      if (sortMode === "name") {
        const comparison = a.title.localeCompare(
          b.title
        );

        return nameAscending
          ? comparison
          : -comparison;
      }

      /*
       * Budget
       */
      if (sortMode === "budget") {
        const comparison =
          a.budget - b.budget;

        return budgetAscending
          ? comparison
          : -comparison;
      }

      return 0;
    });

    return result;
  }, [
    projects,
    activeFilter,
    search,
    dateAscending,
    nameAscending,
    budgetAscending,
    sortMode,
  ]);

  return {
    // Filter
    activeFilter,
    setActiveFilter,

    // Search
    search,
    setSearch,

    // Sorting
    sortMode,
    setSortMode,

    dateAscending,
    setDateAscending,

    nameAscending,
    setNameAscending,

    budgetAscending,
    setBudgetAscending,

    // Final result
    filteredProjects,
  };
}