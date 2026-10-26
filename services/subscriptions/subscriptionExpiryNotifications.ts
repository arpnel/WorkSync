import "server-only";
import { createHash } from "node:crypto";
import { emailAdminClient } from "@/services/email/brevoEmailService";

const DAY_MS = 86_400_000;
const REMINDER_WINDOW_MS = 7 * DAY_MS;
const PAGE_SIZE = 500;
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value)) + " Philippine Time";

function notificationId(userId: string) {
  const hex = createHash("sha256")
    .update(`worksync:premium-expiry-notice:${userId}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export async function processPremiumExpiryNotices(now = new Date()) {
  const db = emailAdminClient();
  let offset = 0;
  let checked = 0;
  let notificationsChanged = 0;
  while (true) {
    const { data: subscriptions, error } = await db
      .from("user_subscriptions")
      .select("user_id,period_ends_at")
      .eq("plan_code", "pro")
      .gt("period_ends_at", now.toISOString())
      .order("user_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error("Premium expiry reminders are unavailable.");
    const rows = subscriptions ?? [];
    checked += rows.length;
    if (!rows.length) break;

    const ids = rows.map((row) => notificationId(row.user_id));
    const { data: existingRows, error: existingError } = await db
      .from("notifications")
      .select("notification_id,title,message")
      .in("notification_id", ids);
    if (existingError)
      throw new Error("Premium notification status is unavailable.");
    const existingById = new Map(
      (existingRows ?? []).map((row) => [row.notification_id, row]),
    );
    const changed = rows.flatMap((subscription) => {
      const end = Date.parse(subscription.period_ends_at);
      if (!Number.isFinite(end) || end <= now.getTime()) return [];
      const id = notificationId(subscription.user_id);
      const existing = existingById.get(id);
      const endingSoon = end - now.getTime() <= REMINDER_WINDOW_MS;
      if (!endingSoon && !existing) return [];
      const title = endingSoon
        ? "Premium access ends soon"
        : "Premium access period updated";
      const message = endingSoon
        ? `Your Premium access ends on ${dateLabel(subscription.period_ends_at)}. Renew manually before then to keep Premium benefits. You will not be charged automatically.`
        : `Your Premium access now ends on ${dateLabel(subscription.period_ends_at)}. Renewals are manual; you will not be charged automatically.`;
      if (existing?.title === title && existing.message === message) return [];
      return [{
        notification_id: id,
        user_id: subscription.user_id,
        type: "subscription_expiry",
        title,
        message,
        related_id: null,
        is_read: !endingSoon,
        created_at: now.toISOString(),
      }];
    });
    if (changed.length) {
      const { error: saveError } = await db
        .from("notifications")
        .upsert(changed, { onConflict: "notification_id" });
      if (saveError)
        throw new Error("Premium notifications could not be saved.");
      notificationsChanged += changed.length;
    }
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return { checked, notificationsChanged };
}
