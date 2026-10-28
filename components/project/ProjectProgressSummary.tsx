"use client";

import { useCallback, useEffect, useState } from "react";
import { projectProgress } from "@/lib/projectProgress";
import { readProjectCache } from "@/lib/projectReadCache";
import { supabase } from "@/lib/supabaseClient";
import { getDeliveryHistory } from "@/services/project/projectDeliveryService";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";

export function ProjectProgressSummary({ project }: { project: ProjectWorkspace }) {
  const [submissions, setSubmissions] = useState<Awaited<ReturnType<typeof getDeliveryHistory>>["submissions"]>([]);
  const load = useCallback(async () => {
    if (!project.projectId) return;
    try {
      const history = await readProjectCache(
        `delivery:${project.projectId}`,
        () => getDeliveryHistory(project.projectId!),
        true,
      );
      setSubmissions(history.submissions);
    } catch {
      // Keep the last known progress while the shared delivery data is unavailable.
    }
  }, [project.projectId]);

  useEffect(() => {
    if (!project.projectId) return;
    const initialLoad = window.setTimeout(() => void load(), 0);
    const channel = supabase.channel(`project-progress:${project.projectId}`);
    channel.on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "project_submissions",
      filter: `project_id=eq.${project.projectId}`,
    }, () => void load());
    for (const table of ["milestones", "projects"])
      channel.on("postgres_changes", {
        event: "*",
        schema: "public",
        table,
        filter: `project_id=eq.${project.projectId}`,
      }, () => void load());
    channel.subscribe();
    window.addEventListener("focus", load);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("focus", load);
      void supabase.removeChannel(channel);
    };
  }, [load, project.projectId]);

  const completed = project.status.toLowerCase() === "completed";
  const progress = projectProgress({
    completed,
    milestone: project.type === "milestone",
    milestones: project.milestones,
    submissions,
  });
  return (
    <section aria-label="Project progress" className="space-y-2 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="text-sm font-medium">{completed ? "Project completion" : project.type === "milestone" ? "Approved milestones" : "Work activity"}</div>
          <div role="progressbar" aria-label="Project progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <strong aria-live="polite" className="shrink-0 text-sm">{progress}%</strong>
      </div>
      <p className="text-xs text-muted-foreground">
        {completed ? "The project was completed through the existing approval workflow." : project.type === "milestone" ? "Progress counts approved milestones only." : "Saved progress updates show activity up to 90%; final project completion still requires client approval."}
      </p>
    </section>
  );
}
