"use client";
import { useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabaseClient";
import { invalidatePageReads } from "@/lib/pageReadCache";
import {
  getNotifications,
  getOlderNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
  type NotificationCursor,
  type NotificationRecord,
} from "@/services/notification/notificationService";
type State = {
  items: NotificationRecord[];
  unreadCount: number;
  cursor: NotificationCursor | null;
  hasMore: boolean;
  loadedPages: number;
  loadingMore: boolean;
  loading: boolean;
  error: string | null;
};
const initial: State = {
  items: [],
  unreadCount: 0,
  cursor: null,
  hasMore: false,
  loadedPages: 0,
  loadingMore: false,
  loading: true,
  error: null,
};
let state = initial;
const listeners = new Set<() => void>();
let stop: (() => void) | undefined;
let generation = 0;
let request = 0;
let identityEpoch = 0;
let loading = false;
let loadingRequest = 0;
let loadAgain = false;
let loadingMoreRequest: number | null = null;
function publish(next: State) {
  state = next;
  listeners.forEach((listener) => listener());
}
function mergeItems(
  current: NotificationRecord[],
  incoming: NotificationRecord[],
) {
  const items = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => items.set(item.id, item));
  return [...items.values()].sort(
    (left, right) =>
      right.createdAt.localeCompare(left.createdAt) ||
      right.id.localeCompare(left.id),
  );
}
async function load() {
  if (loading) {
    loadAgain = true;
    return;
  }
  loading = true;
  const version = ++request;
  loadingRequest = version;
  try {
    const batch = await getNotifications();
    if (version === request) {
      const hadOlderPages = state.loadedPages > 1;
      publish({
        ...state,
        items: mergeItems(state.items, batch.items),
        unreadCount: batch.unreadCount,
        cursor: hadOlderPages ? state.cursor : batch.cursor,
        hasMore: hadOlderPages ? state.hasMore : batch.hasMore,
        loadedPages: Math.max(state.loadedPages, 1),
        loadingMore: false,
        loading: false,
        error: null,
      });
    }
  } catch (cause) {
    if (version === request)
      publish({
        ...state,
        loadingMore: false,
        loading: false,
        error:
          cause instanceof Error
            ? cause.message
            : "Unable to load notifications.",
      });
  } finally {
    if (loadingRequest === version) {
      loading = false;
      if (loadAgain) {
        loadAgain = false;
        void load();
      }
    }
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
    const timer = window.setInterval(refresh, 120000);
    window.addEventListener("focus", refresh);
    window.addEventListener("notification-preferences-changed", preferences);
    stop = () => {
      ++generation;
      ++identityEpoch;
      ++request;
      loading = false;
      loadingRequest = request;
      loadAgain = false;
      loadingMoreRequest = null;
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
  const loadMore = async () => {
    const cursor = state.cursor;
    if (!cursor || !state.hasMore || state.loadingMore || loadingMoreRequest !== null)
      return;
    const version = request;
    loadingMoreRequest = version;
    publish({ ...state, loadingMore: true, error: null });
    try {
      const batch = await getOlderNotifications(cursor);
      if (version !== request) return;
      publish({
        ...state,
        items: mergeItems(state.items, batch.items),
        cursor: batch.cursor,
        hasMore: batch.hasMore,
        loadedPages: state.loadedPages + 1,
        loadingMore: false,
      });
    } catch (cause) {
      if (version !== request) return;
      publish({
        ...state,
        loadingMore: false,
        error:
          cause instanceof Error
            ? cause.message
            : "Unable to load older notifications.",
      });
    } finally {
      if (loadingMoreRequest === version) {
        loadingMoreRequest = null;
        if (version === request && state.loadingMore)
          publish({ ...state, loadingMore: false });
      }
    }
  };
  return {
    ...snapshot,
    loadMore,
    markRead: async (id: string) => {
      const epoch = identityEpoch;
      await markNotificationRead(id);
      if (epoch !== identityEpoch) return;
      const wasUnread = state.items.some(
        (item) => item.id === id && item.unread,
      );
      publish({
        ...state,
        unreadCount: Math.max(0, state.unreadCount - Number(wasUnread)),
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
        unreadCount: 0,
        items: state.items.map((item) => ({ ...item, unread: false })),
      });
    },
  };
}
