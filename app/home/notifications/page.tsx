"use client";
import { WorkspacePageHeader } from "@/components/shared/WorkspacePageHeader";
import ContentSkeleton from "@/components/shared/ContentSkeleton";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { NotificationDetailDialog } from "@/components/notifications/NotificationDetailDialog";
import type { NotificationRecord } from "@/services/notification/notificationService";
import { formatDistanceToNow, isToday } from "date-fns";
import {
  BellRing,
  BriefcaseBusiness,
  CheckCheck,
  CircleX,
  Clock3,
  FileCheck2,
  MessageCircle,
  Settings2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getNotificationKind,
  getNotificationTone,
  type NotificationKind,
} from "@/components/notifications/notification-data";
import { useNotifications } from "@/hooks/notification/useNotifications";

const kindIcons = {
  message: MessageCircle,
  project: BriefcaseBusiness,
  agreement: FileCheck2,
  listing: BriefcaseBusiness,
  system: Settings2,
} satisfies Record<NotificationKind, typeof BellRing>;
const kindLabels: Record<NotificationKind, string> = {
  message: "Message",
  project: "Project",
  agreement: "Agreement",
  listing: "Request",
  system: "System",
};

export default function NotificationsPage() {
  const [selected, setSelected] = useState<NotificationRecord | null>(null);
  const router = useRouter();
  const {
    items,
    loading,
    loadingMore,
    hasMore,
    error,
    unreadCount,
    loadMore,
    markRead,
    markAllRead,
  } = useNotifications();
  const openNotification = async (item: NotificationRecord) => {
    if (item.unread) void markRead(item.id).catch(() => undefined);
    const lowerTitle = item.title.toLowerCase();
    const selectedApplication =
      item.type?.includes("application") &&
      /selected|discussion|accepted/.test(lowerTitle) &&
      !/declined|rejected/.test(lowerTitle);
    if (selectedApplication && item.relatedId) {
      try {
        const result = await supabase
          .from("conversations")
          .select("conversation_id")
          .eq("job_id", item.relatedId)
          .limit(1)
          .maybeSingle();
        if (result.data?.conversation_id) {
          router.push(
            "/home/messages?conversation=" +
              encodeURIComponent(result.data.conversation_id),
          );
          return;
        }
      } catch {
        // Fall back to the notification detail when chat cannot be resolved.
      }
    }
    setSelected(item);
  };
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {selected && (
        <NotificationDetailDialog
          key={selected.id}
          item={selected}
          onClose={() => setSelected(null)}
        />
      )}
      <div className="flex flex-col gap-4 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <WorkspacePageHeader
            title="Notifications"
            description="Stay up to date with requests, projects, and conversations."
          />
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="secondary">{unreadCount} unread</Badge>
            <span className="text-xs text-muted-foreground">
              {items.length} shown
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!unreadCount}
          onClick={() => void markAllRead()}
        >
          <CheckCheck className="h-4 w-4" />
          Mark all as read
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {loading && (
        <ContentSkeleton
          label="Loading notifications"
          variant="notifications"
        />
      )}
      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border py-16 text-center">
          <BellRing className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">No notifications yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            New activity will appear here.
          </p>
        </div>
      )}
      {(["Today", "Earlier"] as const).map((group) => {
        const grouped = items.filter((item) =>
          group === "Today"
            ? isToday(new Date(item.createdAt))
            : !isToday(new Date(item.createdAt)),
        );
        if (!grouped.length) return null;
        return (
          <section key={group}>
            <h2 className="mb-3 text-sm font-semibold">{group}</h2>
            <div className="overflow-hidden rounded-lg border bg-card">
              {grouped.map((item) => {
                const kind = getNotificationKind(item.type);
                const tone = getNotificationTone(item.type, item.title);
                const Icon =
                  tone === "declined"
                    ? CircleX
                    : tone === "deadline"
                      ? Clock3
                      : kindIcons[kind];
                const toneClass =
                  tone === "declined"
                    ? "text-rose-700 dark:text-rose-300"
                    : tone === "deadline"
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-foreground";
                const iconClass =
                  tone === "declined"
                    ? "bg-rose-100/80 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                    : tone === "deadline"
                      ? "bg-amber-100/80 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                      : "bg-muted";
                return (
                  <article
                    key={item.id}
                    id={item.id}
                    className={`cursor-pointer scroll-mt-24 border-b p-4 transition-colors last:border-b-0 hover:bg-muted/40 sm:p-5 ${selected?.id === item.id ? "bg-primary/[0.06] ring-1 ring-inset ring-primary/25" : item.unread ? "bg-primary/[0.025]" : "bg-card"}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void openNotification(item);
                    }}
                  >
                    <div className="flex gap-4">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${iconClass}`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <h3 className={`font-semibold ${toneClass}`}>
                              {item.title}
                            </h3>
                            {item.unread && (
                              <span className="h-2 w-2 rounded-full bg-primary" />
                            )}
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(item.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {item.description}
                        </p>
                        <div className="mt-3 flex items-center justify-between">
                          <Badge variant="outline">{kindLabels[kind]}</Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              void openNotification(item);
                            }}
                          >
                            View details
                          </Button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
      {hasMore && (
        <div className="flex justify-center py-2">
          <Button
            type="button"
            variant="outline"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? "Loading…" : "Load older notifications"}
          </Button>
        </div>
      )}
    </div>
  );
}
