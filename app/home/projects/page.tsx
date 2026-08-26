"use client";

import { ProjectList } from "@/components/project/ProjectList";
import { ProjectTabs } from "@/components/project/ProjectTabs";
import { ProjectToolbar } from "@/components/project/ProjectToolbar";
import { useProjectFilters } from "@/hooks/project/useProjectFilters";
import { useProjects } from "@/hooks/project/useProjects";

export default function Page() {
  const {
    projects,
    loading,
    error,
  } = useProjects();

  const {
    activeFilter,
    setActiveFilter,

    search,
    setSearch,

    sortMode,
    setSortMode,

    dateAscending,
    setDateAscending,

    nameAscending,
    setNameAscending,

    budgetAscending,
    setBudgetAscending,

    filteredProjects,
  } = useProjectFilters(projects);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">
          Loading projects...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-destructive">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProjectTabs
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />

      <ProjectToolbar
        search={search}
        onSearchChange={setSearch}
        sortMode={sortMode}
        setSortMode={setSortMode}
        dateAscending={dateAscending}
        setDateAscending={setDateAscending}
        nameAscending={nameAscending}
        setNameAscending={setNameAscending}
        budgetAscending={budgetAscending}
        setBudgetAscending={setBudgetAscending}
      />

      <ProjectList
        projects={filteredProjects}
      />
    </div>
  );
}