"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  Clock3,
  FileText,
  MoreHorizontal,
} from "lucide-react";

interface ProjectHeaderProps {
  projectName?: string;
  status?: string;
  onAgreementClick?: () => void;
  onMoreClick?: () => void;
}

export default function ProjectHeader({
  projectName = "E-commerce Website",
  status = "Awaiting Agreement",
  onAgreementClick,
  onMoreClick,
}: ProjectHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
            {projectName}
          </h1>

          <Badge
            variant="secondary"
            className="shrink-0 gap-1"
          >
            <Clock3 className="h-3.5 w-3.5" />
            {status}
          </Badge>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Project collaboration and milestone planning
        </p>
      </div>

      <div className="flex w-full items-center gap-2 sm:w-auto sm:self-auto">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-2 sm:flex-none"
          onClick={onAgreementClick}
        >
          <FileText className="h-4 w-4" />
          <span>Agreement</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={onMoreClick}
        >
          <MoreHorizontal className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}