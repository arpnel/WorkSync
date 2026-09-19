"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  getProjectDeadlines,
  type LinkedDeadline,
} from "@/services/schedule/projectDeadlines";
export function useProjectSchedule() {
  const [deadlines, setDeadlines] = useState<LinkedDeadline[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true,
      version = 0;
    const refresh = async () => {
      const request = ++version;
      try {
        const rows = await getProjectDeadlines();
        if (alive && request === version) {
          setDeadlines(rows.deadlines);
          setError(rows.warning);
        }
      } catch (cause) {
        if (alive && request === version)
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load project schedule.",
          );
      } finally {
        if (alive && request === version) setLoading(false);
      }
    };
    void refresh();
    const channel = supabase.channel("project-schedule:" + crypto.randomUUID());
    for (const table of [
      "projects",
      "milestones",
      "contracts",
      "project_meetings",
      "service_orders",
    ])
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => void refresh(),
      );
    channel.subscribe();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60000);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") {
        version++;
        setDeadlines([]);
        window.setTimeout(() => {
          if (alive) void refresh();
        }, 0);
      }
    });
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      subscription.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, []);
  return { deadlines, error, loading };
}
