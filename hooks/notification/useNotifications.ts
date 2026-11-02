"use client";
import { useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabaseClient";
import { invalidatePageReads } from "@/lib/pageReadCache";
import {
  getNotifications,
  getOlderNotifications,
  getNotificationUnreadCount,
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
let unreadCountTimer: number | null = null;
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
    const connect = async (userId: string) => {
      const attempt = ++connection;
      unsubscribe?.();
      unsubscribe = undefined;
      try {
        const cleanup = await subscribeToNotifications(userId, (event, row) => {
          if (event === "INSERT") {
            void load();
            return;
          }
          const id = row.notification_id;
          const isRead = row.is_read;
          if (typeof id !== "string" || typeof isRead !== "boolean") {
            void load();
            return;
          }
          publish({
            ...state,
            items: state.items.map((item) =>
              item.id === id ? { ...item, unread: !isRead } : item,
            ),
          });
          if (unreadCountTimer !== null) window.clearTimeout(unreadCountTimer);
          const epoch = identityEpoch;
          unreadCountTimer = window.setTimeout(() => {
            unreadCountTimer = null;
            void getNotificationUnreadCount()
              .then((unreadCount) => {
                if (epoch === identityEpoch) publish({ ...state, unreadCount });
              })
              .catch(() => undefined);
          }, 200);
        });
        if (version !== generation || attempt !== connection) cleanup();
        else unsubscribe = cleanup;
      } catch {
        /* Reads still work if realtime is unavailable. */
      }
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
          void connect(next);
          void load();
        } else {
          unsubscribe?.();
          publish({ ...initial, loading: false });
        }
      }, 0);
    });
    void load();
    window.addEventListener("notification-preferences-changed", preferences);
    stop = () => {
      ++generation;
      ++identityEpoch;
      ++request;
      loading = false;
      loadingRequest = request;
      loadAgain = false;
      loadingMoreRequest = null;
      if (unreadCountTimer !== null) window.clearTimeout(unreadCountTimer);
      unreadCountTimer = null;
      ++connection;
      state = initial;
      unsubscribe?.();
      auth.data.subscription.unsubscribe();
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
  const loadMore = async (): Promise<boolean> => {
    const cursor = state.cursor;
    if (!cursor || !state.hasMore || state.loadingMore || loadingMoreRequest !== null)
      return false;
    const version = request;
    loadingMoreRequest = version;
    publish({ ...state, loadingMore: true, error: null });
    try {
      const batch = await getOlderNotifications(cursor);
      if (version !== request) return false;
      publish({
        ...state,
        items: mergeItems(state.items, batch.items),
        cursor: batch.cursor,
        hasMore: batch.hasMore,
        loadedPages: state.loadedPages + 1,
        loadingMore: false,
      });
      return true;
    } catch (cause) {
      if (version !== request) return false;
      publish({
        ...state,
        loadingMore: false,
        error:
          cause instanceof Error
            ? cause.message
            : "Unable to load older notifications.",
      });
      return false;
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
