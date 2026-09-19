"use client";
import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  reportListing,
  reportReasons,
  type ListingKind,
} from "@/services/marketplace/listingActions";
export function ListingActions({
  kind,
  id,
}: {
  kind: ListingKind;
  id: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(reportReasons[0]);
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm">
            <Flag />
            Report
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report {kind}</DialogTitle>
            <DialogDescription>
              Tell the moderation team what needs review.
            </DialogDescription>
          </DialogHeader>
          {feedback ? (
            <p role="status">{feedback}</p>
          ) : (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (sending) return;
                setSending(true);
                setError("");
                try {
                  await reportListing(kind, id, reason, description);
                  setFeedback("Report sent to the moderation team.");
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Unable to send report.",
                  );
                } finally {
                  setSending(false);
                }
              }}
            >
              <label className="block text-sm">
                Reason
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background p-2"
                >
                  {reportReasons.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Additional details (optional)
                <Textarea
                  maxLength={5000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button disabled={sending}>
                {sending ? "Sending…" : "Send report"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
