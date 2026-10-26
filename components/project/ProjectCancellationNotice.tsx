"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { getCancellationHistory, type Cancellation } from "@/services/project/resolutionService";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";

export function ProjectCancellationNotice({ project, onReview }: { project: ProjectWorkspace; onReview: () => void }) {
  const [pending, setPending] = useState<Cancellation | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const rows = await getCancellationHistory(project.orderId);
      setPending(rows.find(row => row.status === "requested") ?? null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cancellation request status is unavailable.");
    }
  }, [project.orderId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const channel = supabase.channel(`project-cancellation-notice:${project.orderId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_cancellations", filter: `order_id=eq.${project.orderId}` }, () => void load())
      .subscribe();
    return () => { window.clearTimeout(initialLoad); void supabase.removeChannel(channel); };
  }, [load, project.orderId]);

  if (!pending && !error) return null;
  const received = pending?.requested_by !== project.currentUserId;
  const requesterName = project.currentParty === "client" ? project.freelancerName : project.clientName;
  const counterpartName = project.currentParty === "client" ? project.freelancerName : project.clientName;

  return (
    <section role={pending ? "status" : "alert"} className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 sm:p-5">
      {pending ? <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <BellRing className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="min-w-0 space-y-1">
            <h2 className="font-semibold">Cancellation request</h2>
            <p className="text-sm">{received ? `${requesterName} is asking to cancel this project.` : `Your request to cancel is waiting for ${counterpartName} to respond.`}</p>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{pending.reason}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="size-3.5" aria-hidden="true" />{new Date(pending.created_at).toLocaleString()}</p>
          </div>
        </div>
        {received && <Button onClick={onReview} className="shrink-0">Review request</Button>}
      </div> : <div className="flex items-center justify-between gap-3 text-sm text-destructive"><span>{error}</span><Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button></div>}
    </section>
  );
}
