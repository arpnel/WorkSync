"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabaseClient";
import { useMessageAccountSettings } from "@/hooks/message/useMessageAccountSettings";

const MessagePresenceContext = createContext<ReadonlySet<string>>(new Set());

export function useMessagePresenceContext() {
  return useContext(MessagePresenceContext);
}

export function MessagePresenceProvider({ children }: { children: ReactNode }) {
  const { settings, ready } = useMessageAccountSettings();
  const [userId, setUserId] = useState<string | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setUserId(data.session?.user.id ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId || !ready || !settings.activeStatus) return;
    let alive = true;
    const channel = supabase.channel("worksync-active-status", {
      config: { presence: { key: userId } },
    });
    channel.on("presence", { event: "sync" }, () => {
      if (alive) setOnlineUserIds(Object.keys(channel.presenceState()));
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") void channel.track({ userId, active: true });
    });
    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [userId, ready, settings.activeStatus]);

  const visibleOnlineUserIds =
    ready && settings.activeStatus ? new Set(onlineUserIds) : new Set<string>();
  return (
    <MessagePresenceContext.Provider value={visibleOnlineUserIds}>
      {children}
    </MessagePresenceContext.Provider>
  );
}
