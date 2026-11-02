"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  getUnreadMessageCount,
  subscribeToUnreadMessageChanges,
} from "@/services/message/messageService";

export function useUnreadMessageCount() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;
    let request = 0;
    const refresh = async () => {
      const currentRequest = ++request;
      try {
        const count = await getUnreadMessageCount();
        if (active && currentRequest === request) setUnreadCount(count);
      } catch {
        if (active && currentRequest === request) setUnreadCount(0);
      }
    };
    let refreshTimer: number | null = null;
    const scheduleRefresh = () => {
      if (document.visibilityState !== "visible") return;
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        if (active) void refresh();
      }, 200);
    };
    const unsubscribe = subscribeToUnreadMessageChanges((change) => {
      if (change)
        window.dispatchEvent(new CustomEvent("worksync-message-change", { detail: change }));
      scheduleRefresh();
    });
    window.addEventListener("focus", scheduleRefresh);
    document.addEventListener("visibilitychange", scheduleRefresh);
    const auth = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        ++request;
        setUnreadCount(0);
      } else {
        window.setTimeout(() => {
          if (active) void refresh();
        }, 0);
      }
    });
    const roleChanged = () => void refresh();
    window.addEventListener("account-role-changed", roleChanged);
    void refresh();

    return () => {
      active = false;
      ++request;
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      window.removeEventListener("focus", scheduleRefresh);
      document.removeEventListener("visibilitychange", scheduleRefresh);
      unsubscribe();
      auth.data.subscription.unsubscribe();
      window.removeEventListener("account-role-changed", roleChanged);
    };
  }, []);

  return unreadCount;
}
