"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ShieldCheck,
  MessageSquareWarning,
  CircleX,
  Loader2,
  Paperclip,
} from "lucide-react";
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
  compact = false,
  orderId,
  orderStatus,
  projectId,
  status,
  userId,
  milestones = [],
  onRefresh,
}: {
  compact?: boolean;
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
    setCategory("delivery");
    setMilestone("");
  };
  const Container = compact ? "div" : Card;
  const Content = compact ? "div" : CardContent;
  return (
    <Container
      className={compact ? undefined : "border-0 bg-transparent shadow-none"}
    >
      {!compact && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-5 text-primary" /> Find a way forward
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Discuss an issue or agree to end the project. Your request and
            responses stay in the project history.
          </p>
        </CardHeader>
      )}
      <Content className="space-y-3">
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
        <div
          className={
            compact
              ? "flex flex-wrap justify-end gap-2"
              : "grid gap-3 sm:grid-cols-2"
          }
        >
          {canRequestCancellation(
            orderStatus ?? status,
            projectId ? status : null,
          ) && (
            <Button
              variant={compact ? "destructive" : "outline"}
              disabled={busy || !!held || !data}
              className={
                compact
                  ? "h-9 gap-2 text-sm"
                  : "h-auto items-start justify-start gap-3 whitespace-normal rounded-xl p-4 text-left"
              }
              onClick={() => begin("cancel")}
            >
              <CircleX
                className={
                  compact
                    ? "size-4 shrink-0"
                    : "mt-0.5 size-5 shrink-0 text-muted-foreground"
                }
              />
              <span>
                Request cancellation
                <span
                  className={
                    compact
                      ? "hidden"
                      : "mt-1 block text-xs font-normal text-muted-foreground"
                  }
                >
                  Ask the other participant to end the agreement.
                </span>
              </span>
            </Button>
          )}
          {projectId && canOpenDispute(status) && (
            <Button
              variant="outline"
              disabled={busy || !!held || !data}
              className={
                compact
                  ? "h-9 gap-2 text-sm"
                  : "h-auto items-start justify-start gap-3 whitespace-normal rounded-xl p-4 text-left"
              }
              onClick={() => begin("dispute")}
            >
              <MessageSquareWarning className="mt-0.5 size-5 shrink-0 text-primary" />
              <span>
                Open dispute
                <span
                  className={
                    compact
                      ? "hidden"
                      : "mt-1 block text-xs font-normal text-muted-foreground"
                  }
                >
                  Ask for help resolving a delivery or agreement issue.
                </span>
              </span>
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
        {!compact &&
          !held &&
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
          <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
            <DialogHeader className="shrink-0 border-b bg-muted/20 px-6 py-5 pr-12">
              <DialogTitle>
                {mode === "dispute"
                  ? "Open a dispute"
                  : mode === "cancel"
                    ? "Request cancellation"
                    : "Respond to cancellation"}
              </DialogTitle>
              <DialogDescription>
                {mode === "dispute"
                  ? "Tell us what happened and what would help resolve it. Delivery decisions and automatic release eligibility pause while the dispute is open."
                  : "Signed work requires the other participant’s approval to cancel. Requesting cancellation pauses delivery decisions and automatic release eligibility. After acceptance, eligible uncommitted funds are refunded when automatic settlement is enabled. Already reserved transfers and refund exceptions require support."}
              </DialogDescription>
            </DialogHeader>
            <form
              className="min-h-0 space-y-5 overflow-y-auto overscroll-contain p-6"
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
                  <fieldset disabled={busy} className="space-y-3">
                    <legend className="text-sm font-medium">
                      What is the issue?
                    </legend>
                    <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:grid-cols-3">
                      {[
                        "delivery",
                        "scope",
                        "quality",
                        "communication",
                        "other",
                      ].map((c) => (
                        <label
                          key={c}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-3 text-sm capitalize transition-colors has-checked:border-primary has-checked:bg-primary/5 has-checked:text-primary"
                        >
                          <input
                            type="radio"
                            name="dispute-category"
                            value={c}
                            checked={category === c}
                            onChange={() => setCategory(c)}
                            className="accent-primary"
                          />
                          {c}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {milestones.length > 0 && (
                    <fieldset disabled={busy} className="space-y-2">
                      <legend className="text-sm font-medium">
                        Related work
                      </legend>
                      <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border p-2">
                        {[
                          { id: "", title: "Overall project" },
                          ...milestones,
                        ].map((m) => (
                          <label
                            key={m.id}
                            className="flex cursor-pointer items-start gap-3 rounded-lg p-2 text-sm has-checked:bg-primary/5"
                          >
                            <input
                              type="radio"
                              name="dispute-milestone"
                              checked={milestone === m.id}
                              onChange={() => setMilestone(m.id)}
                              className="mt-1 accent-primary"
                            />
                            <span className="min-w-0 break-words">
                              {m.title}
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  <label className="block text-sm">
                    <span className="mb-2 flex items-center gap-2 font-medium">
                      <Paperclip className="size-4" />
                      Evidence{" "}
                      <span className="font-normal text-muted-foreground">
                        Optional, up to 10 MB
                      </span>
                    </span>
                    <Input
                      type="file"
                      disabled={busy}
                      onChange={(e) => setFile(e.target.files?.[0])}
                    />
                  </label>
                </>
              )}
              <label className="block text-sm">
                Reason / response
                <Textarea
                  required
                  disabled={busy}
                  rows={5}
                  className="mt-2 resize-y"
                  placeholder="Describe the issue, what you have tried, and the outcome you are asking for."
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
              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setMode(null)}
                >
                  Back
                </Button>
                <Button disabled={busy || !reason.trim()}>
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  {busy
                    ? "Sending..."
                    : mode === "dispute"
                      ? "Submit dispute"
                      : mode === "cancel"
                        ? "Send cancellation request"
                        : mode === "accept"
                          ? "Accept cancellation"
                          : "Decline cancellation"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </Content>
    </Container>
  );
}
