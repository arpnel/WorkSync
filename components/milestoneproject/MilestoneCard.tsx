"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  Check,
  Trash2,
  X,
} from "lucide-react";

export interface Milestone {
  id: number;
  title: string;
  description: string;
  budget: number;
  dueDate: string;
  status: string;
}

interface MilestoneCardProps {
  milestone: Milestone;
  index: number;
  onUpdate: (
    id: number,
    updates: Partial<Milestone>
  ) => void;
  onDelete: (id: number) => void;
}

export default function MilestoneCard({
  milestone,
  index,
  onUpdate,
  onDelete,
}: MilestoneCardProps) {
  const [editing, setEditing] =
    React.useState(false);

  const [draft, setDraft] =
    React.useState(milestone);

  React.useEffect(() => {
    setDraft(milestone);
  }, [milestone]);

  const handleSave = () => {
    onUpdate(milestone.id, {
      title: draft.title.trim() || "Untitled Milestone",
      description: draft.description.trim(),
      budget: Math.max(0, Number(draft.budget) || 0),
      dueDate: draft.dueDate,
    });

    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(milestone);
    setEditing(false);
  };

  return (
    <Card className="rounded-xl border bg-background shadow-none">
      <CardContent className="p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {index + 1}
            </div>

            <div className="min-w-0 flex-1">
              {editing ? (
                <Input
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  className="h-9 text-sm font-medium sm:text-base"
                  placeholder="Milestone title"
                />
              ) : (
                <h3 className="break-words text-sm font-medium sm:text-base">
                  {milestone.title}
                </h3>
              )}

              {editing ? (
                <Textarea
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className="mt-2 min-h-[80px] resize-none text-sm"
                  placeholder="Describe the work..."
                />
              ) : (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  {milestone.description}
                </p>
              )}
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(milestone.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Budget
            </label>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                ₱
              </span>

              <Input
                type="number"
                min={0}
                value={
                  editing
                    ? draft.budget
                    : milestone.budget
                }
                readOnly={!editing}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    budget: Number(event.target.value),
                  }))
                }
                className="pl-7"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Proposed Due Date
            </label>

            <Input
              type={editing ? "date" : "text"}
              value={milestone.dueDate}
              readOnly={!editing}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dueDate: event.target.value,
                }))
              }
            />
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Badge
            variant="outline"
            className="w-fit text-xs"
          >
            {milestone.status}
          </Badge>

          {editing ? (
            <div className="flex gap-2 sm:ml-auto">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1"
                onClick={handleCancel}
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>

              <Button
                size="sm"
                className="h-8 gap-1"
                onClick={handleSave}
              >
                <Check className="h-3.5 w-3.5" />
                Save
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full sm:w-auto"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}