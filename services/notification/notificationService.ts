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

async function currentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  if (!user) throw new Error("User not authenticated.");
  return user.id;
}

export async function getNotifications(): Promise<NotificationRecord[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("notifications")
    .select(
      "notification_id, type, title, message, related_id, is_read, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const { data: auth } = await supabase.auth.getUser();
  const preferences: unknown =
    auth.user?.user_metadata?.hidden_notification_groups;
  const hidden = Array.isArray(preferences) ? preferences : [];
  return (data ?? [])
    .filter((item) => {
      const type = String(item.type ?? "");
      const group = type.includes("message")
        ? "messages"
        : type.includes("review")
          ? "reviews"
          : /project|contract|milestone|application|service_request/.test(type)
            ? "projects"
            : null;
      return !group || !hidden.includes(group);
    })
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
}

export async function markNotificationRead(notificationId: string) {
  const userId = await currentUserId();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("notification_id", notificationId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead() {
  const userId = await currentUserId();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw new Error(error.message);
}

export async function subscribeToNotifications(onChange: () => void) {
  const userId = await currentUserId();
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
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
