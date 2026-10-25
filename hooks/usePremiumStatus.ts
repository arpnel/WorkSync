"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type PremiumStatus = {
  active: boolean;
  claimed: boolean;
  accessType: "free" | "trial" | "paid";
  periodEndsAt: string | null;
};

const emptyStatus: PremiumStatus = {
  active: false,
  claimed: false,
  accessType: "free",
  periodEndsAt: null,
};

export function usePremiumStatus() {
  const [status, setStatus] = useState(emptyStatus);

  const refresh = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setStatus(emptyStatus);
      return;
    }

    const { data, error } = await supabase
      .from("user_subscriptions")
      .select("plan_code,period_ends_at,access_type,trial_claimed_at")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error || !data) {
      setStatus(emptyStatus);
      return;
    }

    setStatus({
      active:
        data.plan_code === "pro" &&
        Date.parse(data.period_ends_at) > Date.now(),
      claimed: data.trial_claimed_at != null,
      accessType: data.access_type,
      periodEndsAt: data.period_ends_at,
    });
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const handleChange = () => void refresh();
    window.addEventListener("worksync:subscription-updated", handleChange);
    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener("worksync:subscription-updated", handleChange);
    };
  }, [refresh]);

  return status;
}
