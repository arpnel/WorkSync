"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { platformAction } from "@/services/platform/platformService";
function todayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function MilestonePlanningForm({
  orderId,
  onRefresh,
  remainingBudget,
}: {
  orderId: string;
  remainingBudget: number;
  onRefresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const maximum = Number.isFinite(remainingBudget)
    ? Math.max(0, Math.round(remainingBudget * 100) / 100)
    : 0;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) setOpen(next);
      }}
    >
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        disabled={busy}
        aria-expanded={open}
      >
        <Plus className="size-4" /> Add milestone
      </Button>
      {error && !open && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add milestone</DialogTitle>
          <DialogDescription>
            Set the scope, amount, and deadline for this part of the project.
          </DialogDescription>
        </DialogHeader>
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            if (
              !Number.isFinite(Number(amount)) ||
              Number(amount) <= 0 ||
              Number(amount) > maximum
            ) {
              setError("Enter an amount within the remaining agreed budget.");
              return;
            }
            if (!due || due < todayDate()) {
              setError("Choose today or a future deadline.");
              return;
            }
            setBusy(true);
            setError("");
            try {
              await platformAction("worksync_draft_milestones", {
                p_action: "add",
                p_order: orderId,
                p_title: title.trim(),
                p_description: description.trim(),
                p_amount: Number(amount),
                p_due: due,
              });
              setTitle("");
              setDescription("");
              setAmount("");
              setDue("");
              setOpen(false);
              await onRefresh();
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Unable to add milestone.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="text-xs text-muted-foreground">
            Plan milestones before signing the final agreement. Withdraw any
            final confirmations before changing the plan.
          </p>
          <label className="block text-sm">
            Title
            <Input
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Description
            <Textarea
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Amount (PHP)
            <Input
              type="number"
              min="0.01"
              max={maximum}
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Remaining agreed budget: PHP{" "}
              {maximum.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </label>
          <label className="block text-sm">
            Deadline
            <Input
              type="date"
              min={todayDate()}
              required
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button disabled={busy || maximum < 0.01}>Save milestone</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveDraftMilestone({
  compact = false,
  id,
  orderId,
  onRefresh,
}: {
  compact?: boolean;
  id: string;
  orderId: string;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className={compact ? "ml-auto" : "mt-3 border-t pt-2"}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={async () => {
          if (
            !window.confirm(
              "Remove this draft milestone? Any final confirmations must be withdrawn before changing the plan.",
            )
          )
            return;
          setBusy(true);
          setError("");
          try {
            await platformAction("worksync_draft_milestones", {
              p_order: orderId,
              p_action: "remove",
              p_milestone: id,
            });
            await onRefresh();
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Unable to remove milestone.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Removing?" : "Remove draft"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
