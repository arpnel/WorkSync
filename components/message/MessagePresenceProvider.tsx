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
    if (!userId || !ready || !settings.activeStatus) {
      setOnlineUserIds([]);
      return;
    }
    setOnlineUserIds([]);
    let alive = true;
    let channels: ReturnType<typeof supabase.channel>[] = [];
    let currentConversationKey = "";
    let request = 0;
    let refreshTimer: number | null = null;
    const syncOnlineUsers = () => {
      if (!alive) return;
      const online = new Set<string>();
      for (const channel of channels) {
        for (const id of Object.keys(channel.presenceState())) online.add(id);
      }
      const next = [...online].sort();
      setOnlineUserIds((current) =>
        current.length === next.length && current.every((id, index) => id === next[index])
          ? current
          : next,
      );
    };
    const loadConversationChannels = async () => {
      const currentRequest = ++request;
      const { data, error } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", userId);
      if (!alive || currentRequest !== request || error) return;
      const conversationIds = [...new Set((data ?? []).map((row) => row.conversation_id))].sort();
      const conversationKey = conversationIds.join(",");
      if (conversationKey === currentConversationKey) return;
      currentConversationKey = conversationKey;
      channels.forEach((channel) => void supabase.removeChannel(channel));
      channels = [];
      for (const conversationId of conversationIds) {
        const channel = supabase.channel(`conversation:${conversationId}:presence`, {
          config: { private: true, presence: { key: userId } },
        });
        channel.on("presence", { event: "sync" }, syncOnlineUsers);
        channels.push(channel);
        channel.subscribe((status) => {
          if (!alive || status !== "SUBSCRIBED") return;
          void channel.track({ userId, active: true });
          syncOnlineUsers();
        });
      }
      syncOnlineUsers();
    };
    const scheduleMembershipRefresh = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void loadConversationChannels();
      }, 250);
    };
    void loadConversationChannels();
    const membershipChannel = supabase
      .channel(`presence-memberships:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_participants",
          filter: `user_id=eq.${userId}`,
        },
        scheduleMembershipRefresh,
      )
      .subscribe();
    window.addEventListener("focus", scheduleMembershipRefresh);
    document.addEventListener("visibilitychange", scheduleMembershipRefresh);
    return () => {
      alive = false;
      request += 1;
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      window.removeEventListener("focus", scheduleMembershipRefresh);
      document.removeEventListener("visibilitychange", scheduleMembershipRefresh);
      void supabase.removeChannel(membershipChannel);
      channels.forEach((channel) => void supabase.removeChannel(channel));
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
