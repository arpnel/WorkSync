import { readPageCache, invalidatePageReads } from "@/lib/pageReadCache";
import { supabase } from "@/lib/supabaseClient";
import { CALL_PREFIX } from "@/lib/calls/callMessage";

export interface NotificationRecord {
  id: string;
  type: string | null;
  title: string;
  description: string;
  relatedId: string | null;
  unread: boolean;
  createdAt: string;
}

export interface NotificationCursor {
  createdAt: string;
  id: string;
}

export interface NotificationBatch {
  items: NotificationRecord[];
  unreadCount: number;
  cursor: NotificationCursor | null;
  hasMore: boolean;
}

const NOTIFICATION_PAGE_SIZE = 50;

async function currentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  if (!user) throw new Error("User not authenticated.");
  return user;
}

export function getNotifications(): Promise<NotificationBatch> {
  return readPageCache("notifications", fetchNotifications);
}
export function getOlderNotifications(
  cursor: NotificationCursor,
): Promise<NotificationBatch> {
  return fetchNotifications(cursor);
}

async function fetchNotifications(
  cursor?: NotificationCursor,
): Promise<NotificationBatch> {
  const user = await currentUser();
  const userId = user.id;
  const metadata = user.user_metadata;
  const hidden: unknown[] = Array.isArray(metadata?.hidden_notification_groups)
    ? metadata.hidden_notification_groups
    : [];
  const hiddenMessageGroups: unknown[] = Array.isArray(
    metadata?.hidden_message_notification_groups,
  )
    ? metadata.hidden_message_notification_groups
    : [];
  let query = supabase
    .from("notifications")
    .select(
      "notification_id, type, title, message, related_id, is_read, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("notification_id", { ascending: false })
    .limit(NOTIFICATION_PAGE_SIZE);

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},notification_id.lt.${cursor.id})`,
    );
  }

  const unreadCountPromise = cursor
    ? null
    : getUnreadCount(userId, hidden, hiddenMessageGroups).catch(() => null);
  const [result, unreadTotal] = await Promise.all([
    query,
    unreadCountPromise ?? Promise.resolve(0),
  ]);
  const { data, error } = result;
  if (error) throw new Error(error.message);
  const needsMessageGroups =
    hiddenMessageGroups.length > 0 && !hidden.includes("messages");
  const messageRows = needsMessageGroups
    ? (data ?? []).filter((item) =>
        String(item.type ?? "")
          .toLowerCase()
          .includes("message"),
      )
    : [];
  const conversationIds = [
    ...new Set(
      messageRows
        .map((item) => item.related_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const conversationsResult = conversationIds.length
    ? await supabase
        .from("conversations")
        .select("conversation_id, project_id, order_id, job_id")
        .in("conversation_id", conversationIds)
    : { data: [], error: null };
  const conversationGroups = new Map(
    (conversationsResult.data ?? []).map((conversation) => [
      conversation.conversation_id,
      conversation.order_id
        ? "orders"
        : conversation.project_id || conversation.job_id
          ? "projects"
          : "direct",
    ]),
  );
  const items = (data ?? [])
    .filter((item) =>
      isVisibleNotification(
        item,
        conversationGroups,
        hidden,
        hiddenMessageGroups,
      ),
    )
    .map((item) => ({
      id: item.notification_id,
      type: item.type,
      title: item.title || "Notification",
      description: item.message?.includes(CALL_PREFIX)
        ? "Video call invitation"
        : item.message || "",
      relatedId: item.related_id,
      unread: !item.is_read,
      createdAt: item.created_at,
    }));

  const last = data?.at(-1);
  return {
    items,
    unreadCount:
      unreadTotal ?? items.filter((item) => item.unread).length,
    cursor:
      data?.length === NOTIFICATION_PAGE_SIZE && last
        ? { createdAt: last.created_at, id: last.notification_id }
        : null,
    hasMore: data?.length === NOTIFICATION_PAGE_SIZE,
  };
}

function isVisibleNotification(
  item: { type: string | null; related_id: string | null },
  conversationGroups: Map<string, string>,
  hidden: unknown[],
  hiddenMessageGroups: unknown[],
) {
  const type = String(item.type ?? "").toLowerCase();
  const group = type.includes("message")
    ? "messages"
    : type.includes("review")
      ? "reviews"
      : /project|contract|milestone|application|service_request/.test(type)
        ? "projects"
        : null;
  if (group && hidden.includes(group)) return false;
  if (!type.includes("message")) return true;
  const messageGroup =
    conversationGroups.get(item.related_id ?? "") ??
    (type.includes("order")
      ? "orders"
      : type.includes("direct")
        ? "direct"
        : type.includes("project") || type.includes("job")
          ? "projects"
          : null);
  return !messageGroup || !hiddenMessageGroups.includes(messageGroup);
}

async function getUnreadCount(
  userId: string,
  hidden: unknown[],
  hiddenMessageGroups: unknown[],
) {
  if (!hidden.length && !hiddenMessageGroups.length) {
    const { count, error } = await supabase
      .from("notifications")
      .select("notification_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  const { data, error } = await supabase
    .from("notifications")
    .select("type, related_id")
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw new Error(error.message);
  const needsMessageGroups =
    hiddenMessageGroups.length > 0 && !hidden.includes("messages");
  const messageRows = needsMessageGroups
    ? (data ?? []).filter((item) =>
        String(item.type ?? "")
          .toLowerCase()
          .includes("message"),
      )
    : [];
  const conversationIds = [
    ...new Set(
      messageRows
        .map((item) => item.related_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const conversationsResult = conversationIds.length
    ? await supabase
        .from("conversations")
        .select("conversation_id, project_id, order_id, job_id")
        .in("conversation_id", conversationIds)
    : { data: [], error: null };
  const conversationGroups = new Map(
    (conversationsResult.data ?? []).map((conversation) => [
      conversation.conversation_id,
      conversation.order_id
        ? "orders"
        : conversation.project_id || conversation.job_id
          ? "projects"
          : "direct",
    ]),
  );
  return (data ?? []).filter((item) =>
    isVisibleNotification(
      item,
      conversationGroups,
      hidden,
      hiddenMessageGroups,
    ),
  ).length;
}

export async function markNotificationRead(notificationId: string) {
  const userId = (await currentUser()).id;
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("notification_id", notificationId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  invalidatePageReads();
}

export async function markNotificationUnread(notificationId: string) {
  const userId = (await currentUser()).id;
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: false })
    .eq("notification_id", notificationId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  invalidatePageReads();
}

export async function markAllNotificationsRead() {
  const userId = (await currentUser()).id;
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw new Error(error.message);
  invalidatePageReads();
}

export async function subscribeToNotifications(onChange: () => void) {
  const userId = (await currentUser()).id;
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      () => {
        invalidatePageReads();
        onChange();
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
