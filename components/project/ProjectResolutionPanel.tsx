"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabaseClient";
import { openProjectAttachment } from "@/services/project/projectDeliveryService";
import {
  getResolutionHistory,
  requestCancellation,
  respondCancellation,
  openDispute,
  canOpenDispute,
  canRequestCancellation,
} from "@/services/project/resolutionService";
export function ProjectResolutionPanel({
  orderId,
  orderStatus,
  projectId,
  status,
  userId,
  milestones = [],
  onRefresh,
}: {
  orderId: string;
  orderStatus?: string;
  projectId: string | null;
  status: string;
  userId: string;
  milestones?: { id: string; title: string }[];
  onRefresh: () => Promise<void>;
}) {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof getResolutionHistory>
  > | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<
    "cancel" | "dispute" | "accept" | "reject" | null
  >(null);
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState("delivery");
  const [milestone, setMilestone] = useState("");
  const [file, setFile] = useState<File>();
  const load = useCallback(async () => {
    try {
      const next = await getResolutionHistory(orderId, projectId);
      setData(next);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load resolution history.",
      );
    }
  }, [orderId, projectId]);
  useEffect(() => {
    void load();
    const channel = supabase.channel("resolution:" + orderId).on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "project_cancellations",
        filter: "order_id=eq." + orderId,
      },
      () => void load(),
    );
    if (projectId)
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_disputes",
          filter: "project_id=eq." + projectId,
        },
        () => void load(),
      );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, orderId, projectId]);
  const pending = data?.cancellations.find((r) => r.status === "requested");
  const held = !!pending || data?.disputes.some((d) => d.status !== "resolved");
  const begin = (next: typeof mode) => {
    setMode(next);
    setReason("");
    setError("");
    setFile(undefined);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Project resolution</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {held && (
          <p className="text-sm">
            Delivery decisions are paused until the open resolution request is
            settled.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
            <Button variant="ghost" onClick={() => void load()}>
              Retry
            </Button>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {canRequestCancellation(
            orderStatus ?? status,
            projectId ? status : null,
          ) && (
            <Button
              variant="outline"
              disabled={busy || !!held || !data}
              onClick={() => begin("cancel")}
            >
              Request cancellation
            </Button>
          )}
          {projectId && canOpenDispute(status) && (
            <Button
              variant="outline"
              disabled={busy || !!held || !data}
              onClick={() => begin("dispute")}
            >
              Open dispute
            </Button>
          )}
        </div>
        {data?.cancellations.map((r) => (
          <div
            key={r.cancellation_id}
            className="rounded-md border p-3 text-sm"
          >
            <strong className="capitalize">Cancellation · {r.status}</strong>
            <p>{r.reason}</p>
            <time className="text-xs text-muted-foreground">
              {new Date(r.created_at).toLocaleString()}
            </time>
            {r.response && <p>Response: {r.response}</p>}
            {r.status === "requested" && r.requested_by !== userId && (
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => begin("accept")}>
                  Accept cancellation
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => begin("reject")}
                >
                  Decline
                </Button>
              </div>
            )}
          </div>
        ))}
        {data?.disputes.map((d) => (
          <div key={d.dispute_id} className="rounded-md border p-3 text-sm">
            <strong className="capitalize">
              Dispute · {d.status.replaceAll("_", " ")}
            </strong>
            <p>{d.description}</p>
            {d.evidence_path && (
              <Button
                variant="link"
                onClick={() =>
                  void openProjectAttachment(d.evidence_path!).catch((e) =>
                    setError(e.message),
                  )
                }
              >
                Open evidence
              </Button>
            )}
            {d.admin_notes && <p>Admin: {d.admin_notes}</p>}
            {d.resolution && <p>Resolution: {d.resolution}</p>}
          </div>
        ))}
        {!held &&
          data &&
          !data.disputes.length &&
          !data.cancellations.length && (
            <p className="text-xs text-muted-foreground">
              No disputes or cancellations.
            </p>
          )}
        <Dialog
          open={!!mode}
          onOpenChange={(open) => {
            if (!open && !busy) setMode(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {mode === "dispute"
                  ? "Open a dispute"
                  : mode === "cancel"
                    ? "Request cancellation"
                    : "Respond to cancellation"}
              </DialogTitle>
              <DialogDescription>
                Unconfirmed requests can end immediately. Signed work requires
                the other participant&apos;s approval. No refund or payment
                release occurs here.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                setBusy(true);
                setError("");
                try {
                  if (mode === "cancel")
                    await requestCancellation(orderId, reason);
                  else if (mode === "dispute" && projectId)
                    await openDispute(
                      projectId,
                      milestone || null,
                      category,
                      reason,
                      file,
                    );
                  else if (pending)
                    await respondCancellation(
                      pending.cancellation_id,
                      mode === "accept",
                      reason,
                    );
                  setMode(null);
                  await load();
                  await onRefresh();
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Unable to save resolution request.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {mode === "dispute" && (
                <>
                  <label className="block text-sm">
                    Category
                    <select
                      className="w-full rounded-md border bg-background p-2"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      {[
                        "delivery",
                        "scope",
                        "quality",
                        "communication",
                        "other",
                      ].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  {milestones.length > 0 && (
                    <label className="block text-sm">
                      Related milestone
                      <select
                        className="w-full rounded-md border bg-background p-2"
                        value={milestone}
                        onChange={(e) => setMilestone(e.target.value)}
                      >
                        <option value="">Overall project</option>
                        {milestones.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="block text-sm">
                    Evidence (optional, 10 MB)
                    <Input
                      type="file"
                      onChange={(e) => setFile(e.target.files?.[0])}
                    />
                  </label>
                </>
              )}
              <label className="block text-sm">
                Reason / response
                <Textarea
                  required
                  maxLength={5000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button disabled={busy || !reason.trim()}>Confirm</Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
