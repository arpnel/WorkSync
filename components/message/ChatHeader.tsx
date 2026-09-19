"use client";

import type { ReactNode } from "react";
import { ArrowLeft, Briefcase } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ChatHeaderProps {
  actions?: ReactNode;
  name: string;
  role?: string;
  project?: string;
  avatar?: string;
  online?: boolean;
  onBack?: () => void;
  onViewProject?: () => void;
}

export default function ChatHeader({
  actions,
  name,
  role,
  project,
  avatar,
  online,
  onViewProject,
  onBack,
}: ChatHeaderProps) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 md:hidden"
            aria-label="Back to conversations"
            onClick={onBack}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="relative">
          <Avatar className="h-12 w-12">
            <AvatarImage src={avatar} alt={name} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>

          {online === true && (
            <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background bg-green-500" />
          )}
        </div>

        <div className="min-w-0 space-y-1">
          <div className="flex shrink-0 items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{name}</h2>

            {typeof online === "boolean" && (
              <Badge
                variant={online ? "default" : "secondary"}
                className="rounded-full"
              >
                {online ? "Online" : "Offline"}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {role && <span>{role}</span>}
            {role && project && <span aria-hidden="true">/</span>}

            {project && (
              <>
                <Briefcase className="h-4 w-4" />
                <span>{project}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {project && onViewProject && (
          <Button variant="outline" onClick={onViewProject}>
            View Project
          </Button>
        )}
        {actions}
      </div>
    </header>
  );
}
