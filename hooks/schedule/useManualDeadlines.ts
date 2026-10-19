"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  manualDeadlineStorageKey,
  readManualDeadlines,
  writeManualDeadlines,
  type ManualDeadline,
} from "@/services/schedule/manualDeadlines";

export function useManualDeadlines() {
  const [deadlines, setDeadlines] = useState<ManualDeadline[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const owner = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    const initialize = (id: string | null) => {
      owner.current = id;
      setUserId(id);
      try {
        setDeadlines(id ? readManualDeadlines(id) : []);
        setError("");
      } catch {
        setDeadlines([]);
        setError("Saved personal deadlines could not be read in this browser.");
      }
      setLoading(false);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) initialize(session?.user.id ?? null);
    });
    void supabase.auth.getUser().then(({ data, error: authError }) => {
      if (!alive) return;
      if (authError) {
        setError("Unable to load personal deadlines.");
        setLoading(false);
      } else if (owner.current === null) initialize(data.user?.id ?? null);
    });
    const refresh = () => {
      const id = owner.current;
      if (!alive || !id) return;
      try {
        setDeadlines(readManualDeadlines(id));
        setError("");
      } catch {
        setError("Saved personal deadlines could not be read in this browser.");
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === manualDeadlineStorageKey(owner.current ?? "")) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("worksync:deadlines-updated", refresh);
    return () => {
      alive = false;
      subscription.unsubscribe();
      owner.current = null;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("worksync:deadlines-updated", refresh);
    };
  }, []);

  const saveDeadline = useCallback((draft: Omit<ManualDeadline, "id">, id?: string) => {
    if (!userId) return null;
    try {
      const current = readManualDeadlines(userId);
      const deadline = { ...draft, id: id ?? crypto.randomUUID() };
      const next = id ? current.map((item) => item.id === id ? deadline : item) : [...current, deadline];
      writeManualDeadlines(userId, next);
      setDeadlines(next);
      setError("");
      window.dispatchEvent(new Event("worksync:deadlines-updated"));
      return deadline.id;
    } catch {
      setError("This deadline could not be saved in this browser.");
      return null;
    }
  }, [userId]);

  const deleteDeadline = useCallback((id: string) => {
    if (!userId) return false;
    try {
      const next = readManualDeadlines(userId).filter((item) => item.id !== id);
      writeManualDeadlines(userId, next);
      setDeadlines(next);
      setError("");
      window.dispatchEvent(new Event("worksync:deadlines-updated"));
      return true;
    } catch {
      setError("This deadline could not be removed in this browser.");
      return false;
    }
  }, [userId]);

  return { deadlines, loading, error, saveDeadline, deleteDeadline };
}