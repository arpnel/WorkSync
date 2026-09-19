"use client";
import { CalendarDays, AlignLeft, GripVertical } from "lucide-react";
import { deadlineTime } from "./schedule-time";
import { cn } from "@/lib/utils";
import type { ScheduleCard as Card } from "@/types/schedule/schedule";
const priorityStyles = {
  low: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  medium:
    "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  high: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
};
export default function ScheduleCard({
  card,
  onOpen,
  onMove,
}: {
  card: Card;
  onOpen: () => void;
  onMove: (id: string, beforeId?: string) => void;
}) {
  const due = card.dueDate ? new Date(card.dueDate + "T00:00:00") : null;
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("application/worksync-card", card.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = event.dataTransfer.getData("application/worksync-card");
        if (id) onMove(id, card.id);
      }}
      onClick={onOpen}
      className="group w-full cursor-grab space-y-3 rounded-xl border border-border/60 bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing"
      aria-label={"Edit task: " + card.title}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-xs font-medium capitalize",
            priorityStyles[card.priority],
          )}
        >
          {card.priority} priority
        </span>
        <GripVertical
          className="h-3.5 w-3.5 text-muted-foreground/50"
          aria-hidden="true"
        />
      </div>
      <p className="text-sm leading-6 font-medium break-words">{card.title}</p>
      {(due || card.description) && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {due && (
            <span className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {new Intl.DateTimeFormat("en", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }).format(due)}
              {card.dueTime && <> &middot; {deadlineTime(card.dueTime)}</>}
            </span>
          )}
          {card.description && (
            <span title="Has a description" aria-label="Has a description">
              <AlignLeft className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      )}
    </button>
  );
}
