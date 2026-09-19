"use client";

import * as React from "react";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
} from "@/services/notification/notificationService";

export function useNotifications() {
  const [items, setItems] = React.useState<
    Awaited<ReturnType<typeof getNotifications>>
  >([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    try {
      setError(null);
      setItems(await getNotifications());
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Unable to load notifications.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    void load();
    let disposed = false;
    window.addEventListener("notification-preferences-changed", load);
    let unsubscribe: (() => void) | undefined;
    void subscribeToNotifications(load)
      .then((cleanup) => {
        if (disposed) cleanup();
        else unsubscribe = cleanup;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      window.removeEventListener("notification-preferences-changed", load);
      unsubscribe?.();
    };
  }, [load]);
  const markRead = async (id: string) => {
    await markNotificationRead(id);
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, unread: false } : item,
      ),
    );
  };
  const markAllRead = async () => {
    await markAllNotificationsRead();
    setItems((current) => current.map((item) => ({ ...item, unread: false })));
  };
  return {
    items,
    loading,
    error,
    unreadCount: items.filter((item) => item.unread).length,
    markRead,
    markAllRead,
  };
}
