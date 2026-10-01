"use client";
import { useEffect, useState } from "react";
import { getFreelancerAvailability } from "@/services/marketplace/freelancerAvailability";

// One batch per surface, separate from cached listing content. Never guess green on errors.
export function useFreelancerAvailability(ids: string[]) {
  const key = [...new Set(ids.filter(Boolean))].sort().join(",");
  const [state, setState] = useState<{ key: string; values: Map<string, boolean> }>({ key: "", values: new Map() });
  useEffect(() => {
    let alive = true;
    let busy = false;
    async function refresh() {
      if (busy) return;
      busy = true;
      try {
        const values = await getFreelancerAvailability(key ? key.split(",") : []);
        if (alive) setState({ key, values });
      } catch {
        if (alive) setState({ key, values: new Map() });
      } finally { busy = false; }
    }
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30000);
    window.addEventListener("focus", refresh);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [key]);
  return state.key === key ? state.values : new Map<string, boolean>();
}
