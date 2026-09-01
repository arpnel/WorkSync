"use client";

import { ArrowLeft, BriefcaseBusiness, ListChecks, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  const isMilestone = type === "milestone";

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="border-b px-4 py-2 sm:px-5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 text-muted-foreground"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
            Projects
          </Button>
        </div>

        <div className="space-y-4 px-4 py-5 sm:px-6">
          <div className="space-y-3">
            <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {isMilestone ? (
                  <ListChecks className="mr-1 h-3.5 w-3.5" />
                ) : (
                  <BriefcaseBusiness className="mr-1 h-3.5 w-3.5" />
                )}
                {isMilestone ? "Milestone project" : "Standard project"}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {status}
              </Badge>
              {categoryName && (
                <Badge variant="outline">
                  <Tag className="mr-1 h-3.5 w-3.5" />
                  {categoryName}
                </Badge>
              )}
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs font-medium text-muted-foreground">
              Description
            </p>
            <p className="mt-1.5 max-w-4xl text-sm leading-6">
              {description || "No project description was provided."}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
