"use client";
import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ScheduleBoard } from "@/types/schedule/schedule";
interface Props {
  boards: ScheduleBoard[];
  board: ScheduleBoard;
  onSelect: (id: string) => void;
  onCreate: (title: string) => boolean;
  onRename: (title: string) => boolean;
  readOnly?: boolean;
}
export default function ScheduleToolbar({
  boards,
  board,
  onSelect,
  onCreate,
  onRename,
  readOnly = false,
}: Props) {
  const [mode, setMode] = useState<"create" | "rename" | null>(null);
  const [title, setTitle] = useState("");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b pb-4">
        <label htmlFor="planner-board" className="text-sm font-medium">
          Board
        </label>
        <select
          id="planner-board"
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
        {!readOnly && (
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
        )}
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
