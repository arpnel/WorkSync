"use client";
import { useEffect, useState } from "react";
import { clearProjectReadCache } from "@/lib/projectReadCache";
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
    const onProjectActivityChanged = () => {
      // Task status changes create/update deadline_at. Reload the project
      // deadlines so an open Schedule page reflects the new task deadline.
      void refresh();
    };
    window.addEventListener(
      "worksync:project-activity-changed",
      onProjectActivityChanged,
    );
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") {
        version++;
        setDeadlines([]);
        clearProjectReadCache();
        window.setTimeout(() => {
          if (alive) void refresh();
        }, 0);
      }
    });
    const onRoleChanged = () => {
      version++;
      clearProjectReadCache();
      setDeadlines([]);
      setLoading(true);
      window.setTimeout(() => {
        if (alive) void refresh();
      }, 0);
    };
    window.addEventListener("account-role-changed", onRoleChanged);
    return () => {
      alive = false;
      window.removeEventListener(
        "worksync:project-activity-changed",
        onProjectActivityChanged,
      );
      window.removeEventListener("account-role-changed", onRoleChanged);
      subscription.unsubscribe();
    };
  }, []);
  return { deadlines, error, loading };
}
