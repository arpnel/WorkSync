"use client";

import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import ProjectMeetings from "./ProjectMeetings";

export function ProjectMeetingsDialog({
  projectId,
  active,
}: {
  projectId: string;
  active: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarDays className="h-4 w-4" />
          Meetings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Project meetings</DialogTitle>
          <DialogDescription>
            View meeting times and links
            {active
              ? ", or schedule a conversation with your project partner."
              : " for this project."}
          </DialogDescription>
        </DialogHeader>
        <ProjectMeetings projectId={projectId} active={active} />
      </DialogContent>
    </Dialog>
  );
}
