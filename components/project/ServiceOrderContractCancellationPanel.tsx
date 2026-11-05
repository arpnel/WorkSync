"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Clock3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  getCancellationHistory,
  requestCancellation,
  respondCancellation,
  type Cancellation,
} from "@/services/project/resolutionService";

export function ServiceOrderContractCancellationPanel({
  orderId,
  currentUserId,
  otherParticipantName,
  onStateChange,
}: {
  orderId: string;
  currentUserId: string;
  otherParticipantName: string;
  onStateChange: (locked: boolean, accepted?: boolean) => void;
}) {
  const [cancellation, setCancellation] = useState<Cancellation | null>(null);
  const [reason, setReason] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const cancellations = await getCancellationHistory(orderId);
      const latest = cancellations[0] ?? null;
      setCancellation(latest);
      onStateChange(latest?.status === "requested" || latest?.status === "accepted", latest?.status === "accepted");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cancellation status could not be loaded.");
      onStateChange(false);
    } finally {
      setLoading(false);
    }
  }, [onStateChange, orderId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitRequest = async () => {
    if (!reason.trim() || reason.length > 5000) {
      setError("Enter a cancellation reason of up to 5,000 characters.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await requestCancellation(orderId, reason);
      setReason("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cancellation request could not be sent.");
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const respond = async (accept: boolean) => {
    if (!cancellation) return;
    const reply = response.trim() || (accept ? "Cancellation accepted." : "");
    if (!reply) {
      setError("Add a short response before declining the request.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await respondCancellation(cancellation.cancellation_id, accept, reply);
      setResponse("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cancellation response could not be saved.");
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const pending = cancellation?.status === "requested";
  const requestedByMe = cancellation?.requested_by === currentUserId;

  return (
    <section className="w-full" aria-label="Contract cancellation">
      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h2 className="font-semibold">Cancel this contract negotiation</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Either participant can request cancellation. The negotiation ends only after the other participant accepts.
              </p>
            </div>

            {loading && <p className="text-sm text-muted-foreground">Checking cancellation status...</p>}

            {cancellation?.status === "accepted" && (
              <div role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
                <p className="flex items-center gap-2 font-medium"><Check className="size-4" />Negotiation cancelled</p>
                <p className="mt-1 text-muted-foreground">This order has been cancelled and the contract can no longer be finalized.</p>
              </div>
            )}

            {pending && requestedByMe && (
              <div role="status" className="rounded-lg border border-border/80 bg-card/50 p-3 text-sm">
                <p className="flex items-center gap-2 font-medium"><Clock3 className="size-4" />Waiting for {otherParticipantName}</p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{cancellation.reason}</p>
              </div>
            )}

            {pending && !requestedByMe && (
              <div className="space-y-3">
                <div className="space-y-1 rounded-lg border border-border/80 bg-card/50 p-3 text-sm">
                  <p className="font-medium">The other participant requested cancellation.</p>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{cancellation.reason}</p>
                </div>
                <div className="space-y-3 rounded-lg border p-3">
                  <Textarea
                    value={response}
                    onChange={(event) => setResponse(event.target.value.slice(0, 5000))}
                    maxLength={5000}
                    rows={2}
                    placeholder="Add a response if declining (optional when accepting)"
                    aria-label="Cancellation response"
                    disabled={saving}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" disabled={saving} onClick={() => void respond(true)}><Check className="size-4" />Accept cancellation</Button>
                    <Button type="button" variant="outline" disabled={saving} onClick={() => void respond(false)}><X className="size-4" />Decline</Button>
                  </div>
                </div>
              </div>
            )}

            {!loading && !pending && cancellation?.status !== "accepted" && (
              <div className="space-y-3">
                {cancellation?.status === "rejected" && (
                  <div role="status" className="rounded-lg border p-3 text-sm">
                    <p className="flex items-center gap-2 font-medium"><X className="size-4" />Previous request declined</p>
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{cancellation.response || "The other participant declined the request."}</p>
                  </div>
                )}
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value.slice(0, 5000))}
                  maxLength={5000}
                  rows={2}
                  placeholder="Explain why you want to cancel"
                  aria-label="Cancellation reason"
                  disabled={saving}
                />
                <Button type="button" variant="outline" disabled={saving || !reason.trim()} onClick={() => void submitRequest()}>
                  {saving ? "Sending request..." : "Request cancellation"}
                </Button>
              </div>
            )}

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
