"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Search } from "lucide-react";

import { Project, ProjectCard } from "./ProjectCard";

interface ProjectListProps {
  projects: Project[];
}

export function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="mb-3 h-8 w-8 text-muted-foreground" />

          <p className="font-medium">No projects found</p>

          <p className="mt-1 text-sm text-muted-foreground">
            Try changing your search or status filter.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {projects.map((project) => (
        <ProjectCard key={project.orderId} project={project} />
      ))}
    </div>
  );
}
