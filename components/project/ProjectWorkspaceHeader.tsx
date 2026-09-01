"use client";

import { Activity, ArrowLeft, FolderKanban, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { WorkspaceProjectType } from "@/types/project/projectWorkspace";

type Props = {
  title: string;
  description: string;
  categoryName: string | null;
  status: string;
  type: WorkspaceProjectType;
  onBack: () => void;
};

export function ProjectWorkspaceHeader({
  title,
  description,
  categoryName,
  status,
  type,
  onBack,
}: Props) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardContent className="p-0">
        <div className="flex min-w-0 items-center gap-1.5 border-b px-3 py-2.5 sm:px-5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Back to projects"
            onClick={onBack}
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Button>
          <h1 className="min-w-0 truncate text-xl font-semibold sm:text-2xl">
            {title}
          </h1>
        </div>

        <div className="grid gap-3 px-4 py-3 sm:grid-cols-3 sm:gap-0 sm:px-5">
          <div className="min-w-0 sm:pr-5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <FolderKanban className="h-3.5 w-3.5" />
              Project type
            </p>
            <p className="mt-1 truncate text-sm font-medium">
              {type === "milestone" ? "Milestone project" : "Standard project"}
            </p>
          </div>
          <div className="min-w-0 sm:border-l sm:px-5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
              Process
            </p>
            <p className="mt-1 truncate text-sm font-medium capitalize">
              {status}
            </p>
          </div>
          <div className="min-w-0 sm:border-l sm:pl-5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Tag className="h-3.5 w-3.5" />
              Work category
            </p>
            <p className="mt-1 truncate text-sm font-medium">
              {categoryName || "Not specified"}
            </p>
          </div>
        </div>

        <div className="border-t px-4 py-3 sm:px-5">
          <p className="text-xs font-medium text-muted-foreground">
            Description
          </p>
          <p className="mt-1.5 max-w-4xl text-sm leading-6">
            {description || "No project description was provided."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
