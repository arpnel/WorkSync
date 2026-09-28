"use client";
import { useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabaseClient";
import { invalidatePageReads } from "@/lib/pageReadCache";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
  type NotificationRecord,
} from "@/services/notification/notificationService";
type State = {
  items: NotificationRecord[];
  loading: boolean;
  error: string | null;
};
const initial: State = { items: [], loading: true, error: null };
let state = initial;
const listeners = new Set<() => void>();
let stop: (() => void) | undefined;
let generation = 0;
let request = 0;
let identityEpoch = 0;
function publish(next: State) {
  state = next;
  listeners.forEach((listener) => listener());
}
async function load() {
  const version = ++request;
  try {
    const items = await getNotifications();
    if (version === request) publish({ items, loading: false, error: null });
  } catch (cause) {
    if (version === request)
      publish({
        ...state,
        loading: false,
        error:
          cause instanceof Error
            ? cause.message
            : "Unable to load notifications.",
      });
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    const version = ++generation;
    let unsubscribe: (() => void) | undefined;
    let account: string | null | undefined;
    let connection = 0;
    const connect = async () => {
      const attempt = ++connection;
      unsubscribe?.();
      unsubscribe = undefined;
      try {
        const cleanup = await subscribeToNotifications(() => void load());
        if (version !== generation || attempt !== connection) cleanup();
        else unsubscribe = cleanup;
      } catch {
        /* Reads still work if realtime is unavailable. */
      }
    };
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const preferences = () => {
      invalidatePageReads();
      void load();
    };
    const auth = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null;
      if (next === account) return;
      account = next;
      ++identityEpoch;
      ++connection;
      ++request;
      invalidatePageReads();
      publish(initial);
      window.setTimeout(() => {
        if (version !== generation || next !== account) return;
        if (next) {
          void connect();
          void load();
        } else {
          unsubscribe?.();
          publish({ ...initial, loading: false });
        }
      }, 0);
    });
    void load();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("notification-preferences-changed", preferences);
    stop = () => {
      ++generation;
      ++identityEpoch;
      ++request;
      ++connection;
      state = initial;
      unsubscribe?.();
      auth.data.subscription.unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(
        "notification-preferences-changed",
        preferences,
      );
    };
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      stop?.();
      stop = undefined;
    }
  };
}
export function useNotifications() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => initial,
  );
  return {
    ...snapshot,
    unreadCount: snapshot.items.filter((item) => item.unread).length,
    markRead: async (id: string) => {
      const epoch = identityEpoch;
      await markNotificationRead(id);
      if (epoch !== identityEpoch) return;
      publish({
        ...state,
        items: state.items.map((item) =>
          item.id === id ? { ...item, unread: false } : item,
        ),
      });
    },
    markAllRead: async () => {
      const epoch = identityEpoch;
      await markAllNotificationsRead();
      if (epoch !== identityEpoch) return;
      publish({
        ...state,
        items: state.items.map((item) => ({ ...item, unread: false })),
      });
    },
  };
}
