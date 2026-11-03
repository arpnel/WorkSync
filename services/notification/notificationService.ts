import { readPageCache, invalidatePageReads } from "@/lib/pageReadCache";
import { supabase } from "@/lib/supabaseClient";
import { CALL_PREFIX } from "@/lib/calls/callMessage";
import { getActiveAccountContext, type UserRole } from "@/services/marketplace/AccountServices";

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

const NOTIFICATION_PAGE_SIZE = 10;

async function currentUser() {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) throw new Error(error.message);
    if (!session?.user) throw new Error("User not authenticated.");
    return session.user;
  } catch (cause) {
    if (cause instanceof Error && cause.message !== "Failed to fetch") throw cause;
    throw new Error("Could not connect to WorkSync to load notifications. Check your connection and try again.");
  }
}

export function getNotifications(): Promise<NotificationBatch> {
  return getActiveAccountContext().then(({ role }) =>
    readPageCache(`notifications:${role}`, () => fetchNotifications(undefined, role)),
  );
}
export function getOlderNotifications(
  cursor: NotificationCursor,
): Promise<NotificationBatch> {
  return getActiveAccountContext().then(({ role }) => fetchNotifications(cursor, role));
}

type RoleNotificationContext = {
  role: UserRole;
  orderIds: Set<string>;
  jobIds: Set<string>;
  listingIds: Set<string>;
};

async function getRoleNotificationContext(
  role: UserRole,
  profileId: string | null,
): Promise<RoleNotificationContext> {
  if (!profileId) return { role, orderIds: new Set(), jobIds: new Set(), listingIds: new Set() };

  const orders = await supabase
    .from("service_orders")
    .select("order_id")
    .eq(role === "client" ? "client_id" : "freelancer_id", profileId);
  if (orders.error) throw orders.error;

  if (role === "client") {
    const jobs = await supabase.from("jobs").select("job_id").eq("client_id", profileId);
    if (jobs.error) throw jobs.error;
    return {
      role,
      orderIds: new Set((orders.data ?? []).map((row) => row.order_id)),
      jobIds: new Set((jobs.data ?? []).map((row) => row.job_id)),
      listingIds: new Set((jobs.data ?? []).map((row) => row.job_id)),
    };
  }

  const [applications, services] = await Promise.all([
    supabase.from("job_applications").select("job_id").eq("freelancer_id", profileId),
    supabase.from("services").select("service_id").eq("freelancer_id", profileId),
  ]);
  if (applications.error) throw applications.error;
  if (services.error) throw services.error;
  return {
    role,
    orderIds: new Set((orders.data ?? []).map((row) => row.order_id)),
    jobIds: new Set((applications.data ?? []).map((row) => row.job_id)),
    listingIds: new Set((services.data ?? []).map((row) => row.service_id)),
  };
}

async function getVisibleRoleItems<T extends { type: string | null; title: string | null; related_id: string | null }>(
  rows: T[],
  context: RoleNotificationContext,
): Promise<T[]> {
  // Notifications with a known client/freelancer context are filtered below;
  // account-wide notices remain visible in either role.
  const messageIds = [...new Set(rows
    .filter((row) => String(row.type ?? "").toLowerCase().includes("message"))
    .map((row) => row.related_id)
    .filter((id): id is string => Boolean(id)))];
  const conversations = messageIds.length
    ? await supabase.from("conversations").select("conversation_id, order_id, job_id").in("conversation_id", messageIds)
    : { data: [], error: null };
  if (conversations.error) throw conversations.error;
  const conversationRows = new Map((conversations.data ?? []).map((row) => [row.conversation_id, row]));

  return rows.filter((row) => {
    const type = String(row.type ?? "").toLowerCase();
    const title = String(row.title ?? "").toLowerCase();
    const relatedId = row.related_id ?? "";
    if (type === "job_application") {
      return context.role === "client"
        ? title.includes("new job application") && context.jobIds.has(relatedId)
        : !title.includes("new job application") && context.jobIds.has(relatedId);
    }
    if (type === "service_request") {
      return context.role === "freelancer"
        ? title.includes("new service request") && context.orderIds.has(relatedId)
        : !title.includes("new service request") && context.orderIds.has(relatedId);
    }
    if (type === "project_update" || type === "review")
      return context.orderIds.has(relatedId);
    if (type === "listing_moderation") return context.listingIds.has(relatedId);
    if (type.includes("message")) {
      const conversation = conversationRows.get(relatedId);
      if (!conversation) return true;
      if (conversation.order_id) return context.orderIds.has(conversation.order_id);
      if (conversation.job_id) return context.jobIds.has(conversation.job_id);
      return true;
    }
    if (/assessment|freelancer_capacity|seller_verification|seller_document|payout|earnings|tax_declaration|tax_profile/.test(type))
      return context.role === "freelancer";
    return true;
  });
}

async function fetchNotifications(
  cursor?: NotificationCursor,
  role?: UserRole,
): Promise<NotificationBatch> {
  const user = await currentUser();
  const userId = user.id;
  const account = await getActiveAccountContext();
  if (account.userId !== userId || (role && account.role !== role))
    throw new Error("Your active account changed. Please reload notifications.");
  const roleContext = await getRoleNotificationContext(account.role, account.profileId);
  const metadata = user.user_metadata;
  const hidden: unknown[] = Array.isArray(metadata?.hidden_notification_groups)
    ? metadata.hidden_notification_groups
    : [];
  const hiddenMessageGroups: unknown[] = Array.isArray(
    metadata?.hidden_message_notification_groups,
  )
    ? metadata.hidden_message_notification_groups
    : [];
  const fetchPage = async (after?: NotificationCursor) => {
    let query = supabase
      .from("notifications")
      .select("notification_id, type, title, message, related_id, is_read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("notification_id", { ascending: false })
      .limit(NOTIFICATION_PAGE_SIZE);
    if (after) {
      query = query.or(
        `created_at.lt.${after.createdAt},and(created_at.eq.${after.createdAt},notification_id.lt.${after.id})`,
      );
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  };

  const unreadCountPromise = cursor
    ? null
    : getUnreadCount(userId, hidden, hiddenMessageGroups, roleContext).catch(() => null);
  const [firstPage, unreadTotal] = await Promise.all([
    fetchPage(cursor),
    unreadCountPromise ?? Promise.resolve(0),
  ]);
  let data = firstPage;
  let lastPageSize = firstPage.length;

  const visibleRowsFor = async (rows: typeof data) => {
    const needsMessageGroups = hiddenMessageGroups.length > 0 && !hidden.includes("messages");
    const messageRows = needsMessageGroups
      ? rows.filter((item) => String(item.type ?? "").toLowerCase().includes("message"))
      : [];
    const conversationIds = [...new Set(messageRows
      .map((item) => item.related_id)
      .filter((id): id is string => Boolean(id)))];
    const conversationsResult = conversationIds.length
      ? await supabase
          .from("conversations")
          .select("conversation_id, project_id, order_id, job_id")
          .in("conversation_id", conversationIds)
      : { data: [], error: null };
    if (conversationsResult.error) throw conversationsResult.error;
    const conversationGroups = new Map((conversationsResult.data ?? []).map((conversation) => [
      conversation.conversation_id,
      conversation.order_id ? "orders" : conversation.project_id || conversation.job_id ? "projects" : "direct",
    ]));
    const roleVisibleRows = await getVisibleRoleItems(rows, roleContext);
    return roleVisibleRows.filter((item) =>
      isVisibleNotification(item, conversationGroups, hidden, hiddenMessageGroups),
    );
  };

  let visibleRows = await visibleRowsFor(data);
  while (visibleRows.length < NOTIFICATION_PAGE_SIZE && lastPageSize === NOTIFICATION_PAGE_SIZE) {
    const last = data.at(-1);
    if (!last) break;
    const nextPage = await fetchPage({ createdAt: last.created_at, id: last.notification_id });
    lastPageSize = nextPage.length;
    data = [...data, ...nextPage];
    visibleRows = await visibleRowsFor(data);
  }

  const displayedRows = visibleRows.slice(0, NOTIFICATION_PAGE_SIZE);
  const items = displayedRows
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

  const lastDisplayed = displayedRows.at(-1);
  const lastDisplayedIndex = lastDisplayed
    ? data.findIndex((row) => row.notification_id === lastDisplayed.notification_id)
    : -1;
  const hasMore = displayedRows.length === NOTIFICATION_PAGE_SIZE
    ? lastDisplayedIndex < data.length - 1 || lastPageSize === NOTIFICATION_PAGE_SIZE
    : lastPageSize === NOTIFICATION_PAGE_SIZE;
  const cursorRow = displayedRows.length === NOTIFICATION_PAGE_SIZE
    ? lastDisplayed
    : (hasMore ? data.at(-1) : undefined);
  return {
    items,
    unreadCount:
      unreadTotal ?? items.filter((item) => item.unread).length,
    cursor: cursorRow
      ? { createdAt: cursorRow.created_at, id: cursorRow.notification_id }
      : null,
    hasMore,
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
  roleContext: RoleNotificationContext,
) {
  const { data, error } = await supabase
    .from("notifications")
    .select("type, title, related_id")
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
  const roleVisibleRows = await getVisibleRoleItems(data ?? [], roleContext);
  return roleVisibleRows.filter((item) =>
    isVisibleNotification(
      item,
      conversationGroups,
      hidden,
      hiddenMessageGroups,
    ),
  ).length;
}

export async function getNotificationUnreadCount() {
  const user = await currentUser();
  const account = await getActiveAccountContext();
  if (account.userId !== user.id) throw new Error("Your active account changed. Please reload notifications.");
  const hidden: unknown[] = Array.isArray(user.user_metadata?.hidden_notification_groups)
    ? user.user_metadata.hidden_notification_groups
    : [];
  const hiddenMessageGroups: unknown[] = Array.isArray(user.user_metadata?.hidden_message_notification_groups)
    ? user.user_metadata.hidden_message_notification_groups
    : [];
  const roleContext = await getRoleNotificationContext(account.role, account.profileId);
  return getUnreadCount(user.id, hidden, hiddenMessageGroups, roleContext);
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

export async function subscribeToNotifications(
  userId: string,
  onChange: (event: "INSERT" | "UPDATE", row: Record<string, unknown>) => void,
) {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        invalidatePageReads();
        onChange(payload.eventType, payload.new as Record<string, unknown>);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        invalidatePageReads();
        onChange(payload.eventType, payload.new as Record<string, unknown>);
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
