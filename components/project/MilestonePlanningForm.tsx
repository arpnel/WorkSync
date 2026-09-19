"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { platformAction } from "@/services/platform/platformService";
export function MilestonePlanningForm({
  orderId,
  onRefresh,
  milestones,
}: {
  orderId: string;
  milestones: { id: string; title: string }[];
  onRefresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="rounded-lg border p-4">
      <Button
        variant="outline"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        Add milestone
      </Button>
      {milestones.map((item) => (
        <div
          key={item.id}
          className="mt-2 flex items-center justify-between gap-3 text-sm"
        >
          <span>{item.title}</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={async () => {
              if (
                !window.confirm(
                  "Remove this draft milestone? Both participants will need to confirm the final agreement again.",
                )
              )
                return;
              setBusy(true);
              setError("");
              try {
                await platformAction("worksync_remove_milestone", {
                  p_milestone: item.id,
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
            Remove draft
          </Button>
        </div>
      ))}
      {error && !open && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {open && (
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              await platformAction("worksync_add_milestone", {
                p_order: orderId,
                p_title: title.trim(),
                p_description: description.trim(),
                p_amount: Number(amount),
                p_due: new Date(due).toISOString(),
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
            Plan milestones before signing the final agreement. Adding a
            milestone clears final signatures so both participants can review
            the plan.
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
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Deadline
            <Input
              type="datetime-local"
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
          <Button disabled={busy}>Save milestone</Button>
        </form>
      )}
    </div>
  );
}
