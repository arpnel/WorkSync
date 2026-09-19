"use client";
import { useState } from "react";
import { MoreHorizontal, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import ScheduleCard from "./ScheduleCard";
import type {
  ScheduleCard as Card,
  ScheduleList as List,
} from "@/types/schedule/schedule";
export default function ScheduleList({
  list,
  cards,
  total,
  onAdd,
  onOpen,
  onMove,
  onRename,
  onDelete,
}: {
  list: List;
  cards: Card[];
  total: number;
  onAdd: () => void;
  onOpen: (card: Card) => void;
  onMove: (id: string, beforeId?: string) => void;
  onRename: (title: string) => boolean;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(list.title);
  return (
    <section
      aria-label={list.title}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const id = event.dataTransfer.getData("application/worksync-card");
        if (id) onMove(id);
      }}
      className="flex w-full min-w-0 flex-col rounded-2xl border border-border/60 bg-muted/50 p-2.5"
    >
      <div className="flex items-center justify-between gap-2 px-2 py-2">
        {editing ? (
          <form
            className="flex min-w-0 flex-1 flex-wrap gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (onRename(title)) setEditing(false);
            }}
          >
            <Input
              autoFocus
              aria-label="List name"
              value={title}
              maxLength={60}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setEditing(false);
              }}
            />
            <Button type="submit" size="sm" disabled={!title.trim()}>
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <>
            <h2 className="min-w-0 truncate text-sm font-semibold">
              {list.title}
            </h2>
            <span className="mr-auto rounded-md bg-card px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
              {total}
            </span>
          </>
        )}
        {!editing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={"Options for " + list.title}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  setTitle(list.title);
                  setEditing(true);
                }}
              >
                <Pencil className="h-4 w-4" />
                Rename list
              </DropdownMenuItem>
              <DropdownMenuItem disabled={total > 0} onSelect={onDelete}>
                <Trash2 className="h-4 w-4" />
                {total > 0 ? "Move cards before deleting" : "Delete empty list"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="min-h-16 min-w-0 space-y-2 p-1">
        {cards.map((card) => (
          <ScheduleCard
            key={card.id}
            card={card}
            onOpen={() => onOpen(card)}
            onMove={onMove}
          />
        ))}
        {cards.length === 0 && (
          <p className="rounded-xl border border-dashed px-4 py-7 text-center text-xs leading-5 text-muted-foreground">
            {total
              ? "No cards match your filters."
              : "Add your first card or drop one here."}
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        className="mt-1 w-full shrink-0 justify-start text-muted-foreground"
        onClick={onAdd}
      >
        <Plus className="h-4 w-4" />
        Add a card
      </Button>
    </section>
  );
}
