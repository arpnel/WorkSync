"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Briefcase, MoreVertical } from "lucide-react";

interface ChatHeaderProps {
  name: string;
  role?: string;
  project?: string;
  avatar?: string;
  online?: boolean;
  onViewProject?: () => void;
}

export default function ChatHeader({
  name,
  role,
  project,
  avatar,
  online = false,
  onViewProject,
}: ChatHeaderProps) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="flex shrink-0 items-center justify-between border-b px-6 py-4">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar className="h-12 w-12">
            <AvatarImage src={avatar} alt={name} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>

          <span
            className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background ${
              online ? "bg-green-500" : "bg-gray-400"
            }`}
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{name}</h2>

            <Badge
              variant={online ? "default" : "secondary"}
              className="rounded-full"
            >
              {online ? "Online" : "Offline"}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {role && <span>{role}</span>}

            {role && project && (
              <span className="text-muted-foreground">•</span>
            )}

            {project && (
              <>
                <Briefcase className="h-4 w-4" />
                <span>{project}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {project && (
          <Button variant="outline" onClick={onViewProject}>
            View Project
          </Button>
        )}

        <Button variant="ghost" size="icon">
          <MoreVertical className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
