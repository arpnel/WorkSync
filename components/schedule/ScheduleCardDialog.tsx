"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  ScheduleCard,
  ScheduleCardDraft,
  ScheduleList,
  SchedulePriority,
} from "@/types/schedule/schedule";
export default function ScheduleCardDialog({
  card,
  listId,
  lists,
  onClose,
  onSave,
  onDelete,
}: {
  card?: ScheduleCard;
  listId: string;
  lists: ScheduleList[];
  onClose: () => void;
  onSave: (draft: ScheduleCardDraft, id?: string) => boolean;
  onDelete: (id: string) => boolean;
}) {
  const [draft, setDraft] = useState<ScheduleCardDraft>(
    card ?? {
      listId,
      title: "",
      description: "",
      dueDate: "",
      dueTime: "",
      priority: "medium",
    },
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveError, setSaveError] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{card ? "Card details" : "Add a card"}</DialogTitle>
          <DialogDescription>
            Plan the work, set a deadline, and choose its list.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (onSave(draft, card?.id)) onClose();
            else setSaveError(true);
          }}
        >
          <label className="block space-y-2 text-sm font-medium">
            <span>Title</span>
            <Input
              autoFocus
              required
              maxLength={160}
              placeholder="What needs to get done?"
              value={draft.title}
              onChange={(event) =>
                setDraft({ ...draft, title: event.target.value })
              }
            />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Description</span>
            <Textarea
              rows={4}
              maxLength={5000}
              placeholder="Add notes, details, or next steps..."
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block space-y-2 text-sm font-medium">
              <span>Due date</span>
              <Input
                type="date"
                value={draft.dueDate}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    dueDate: event.target.value,
                    dueTime: event.target.value ? draft.dueTime : "",
                  })
                }
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Deadline time</span>
              <Input
                type="time"
                value={draft.dueTime ?? ""}
                disabled={!draft.dueDate}
                onChange={(event) =>
                  setDraft({ ...draft, dueTime: event.target.value })
                }
              />
              <span className="block text-xs font-normal text-muted-foreground">
                Optional, in your local time.
              </span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block space-y-2 text-sm font-medium">
              <span>Priority</span>
              <select
                className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
                value={draft.priority}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    priority: event.target.value as SchedulePriority,
                  })
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
          <label className="block space-y-2 text-sm font-medium">
            <span>List</span>
            <select
              className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
              value={draft.listId}
              onChange={(event) =>
                setDraft({ ...draft, listId: event.target.value })
              }
            >
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.title}
                </option>
              ))}
            </select>
            <span className="block text-xs font-normal text-muted-foreground">
              Change the list to move this card on any device.
            </span>
          </label>
          {saveError && (
            <p role="alert" className="text-sm text-destructive">
              Unable to save this change in your browser. Please free up storage
              and try again.
            </p>
          )}
          <DialogFooter className="gap-2">
            {card && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                Delete card
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!draft.title.trim()}>
              Save card
            </Button>
          </DialogFooter>
          {confirmDelete && card && (
            <div
              className="space-y-2 rounded-lg border border-destructive/30 p-3"
              role="alert"
            >
              <p className="text-sm">Delete this card permanently?</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (onDelete(card.id)) onClose();
                    else setSaveError(true);
                  }}
                >
                  Delete
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep card
                </Button>
              </div>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
