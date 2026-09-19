"use client";
import { useState } from "react";
import { LayoutTemplate, Plus, Search, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ScheduleBoard } from "@/types/schedule/schedule";
interface Props {
  boards: ScheduleBoard[];
  board: ScheduleBoard;
  search: string;
  priority: string;
  onSearch: (value: string) => void;
  onPriority: (value: string) => void;
  onSelect: (id: string) => void;
  onCreate: (title: string) => boolean;
  onRename: (title: string) => boolean;
}
export default function ScheduleToolbar({
  boards,
  board,
  search,
  priority,
  onSearch,
  onPriority,
  onSelect,
  onCreate,
  onRename,
}: Props) {
  const [mode, setMode] = useState<"create" | "rename" | null>(null);
  const [title, setTitle] = useState("");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LayoutTemplate className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Your boards
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Turn your plans into progress, one card at a time.
            </p>
          </div>
        </div>
        <span className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground">
          Personal board &middot; Saved in this browser
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm">
        <select
          aria-label="Current board"
          className="h-9 max-w-full min-w-40 rounded-lg border bg-background px-3 text-sm font-semibold sm:max-w-60"
          value={board.id}
          onChange={(event) => {
            setMode(null);
            onSelect(event.target.value);
          }}
        >
          {boards.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Rename board"
          onClick={() => {
            setTitle(board.title);
            setMode("rename");
          }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setTitle("");
            setMode("create");
          }}
        >
          <Plus className="h-4 w-4" />
          New board
        </Button>
        <div className="relative w-full sm:ml-auto sm:w-56">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search cards"
            placeholder="Search cards..."
            className="pl-9"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
        <select
          aria-label="Filter by priority"
          className="h-9 rounded-lg border bg-background px-2 text-sm"
          value={priority}
          onChange={(event) => onPriority(event.target.value)}
        >
          <option value="all">All priorities</option>
          <option value="high">High priority</option>
          <option value="medium">Medium priority</option>
          <option value="low">Low priority</option>
        </select>
      </div>
      {mode && (
        <form
          className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            if ((mode === "create" ? onCreate : onRename)(title)) setMode(null);
          }}
        >
          <Input
            autoFocus
            aria-label={mode === "create" ? "New board name" : "Board name"}
            placeholder="Board name"
            className="w-full sm:w-72"
            value={title}
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={!title.trim()}>
            {mode === "create" ? "Create board" : "Save name"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMode(null)}
          >
            Cancel
          </Button>
        </form>
      )}
    </div>
  );
}
