"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  BriefcaseBusiness,
  CheckCheck,
  ChevronRight,
  FileCheck2,
  MessageCircle,
  Settings2,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getNotificationHref,
  getNotificationKind,
  type NotificationKind,
} from "./notification-data";
import { useNotifications } from "@/hooks/notification/useNotifications";

const kindIcons = {
  message: MessageCircle,
  project: BriefcaseBusiness,
  agreement: FileCheck2,
  listing: BriefcaseBusiness,
  system: Settings2,
} satisfies Record<NotificationKind, typeof Bell>;

export function NotificationOverview() {
  const { items, loading, error, unreadCount, markRead, markAllRead } =
    useNotifications();
  const recent = items.slice(0, 5);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition hover:bg-accent"
          aria-label={`Open notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(360px,calc(100vw-1rem))] gap-0 p-0"
      >
        <PopoverHeader className="flex-row items-center justify-between border-b px-4 py-3">
          <div>
            <PopoverTitle>Notifications</PopoverTitle>
            <p className="text-xs text-muted-foreground">
              {unreadCount} unread
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Mark all as read"
              onClick={() => void markAllRead()}
            >
              <CheckCheck className="h-4 w-4" />
            </button>
          )}
        </PopoverHeader>
        <div className="max-h-[380px] overflow-y-auto">
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Loading notifications...
            </p>
          ) : error ? (
            <p className="px-4 py-8 text-center text-sm text-destructive">
              {error}
            </p>
          ) : recent.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications yet.
            </p>
          ) : (
            recent.map((item) => {
              const Icon = kindIcons[getNotificationKind(item.type)];
              return (
                <Link
                  key={item.id}
                  href={getNotificationHref(item.type, item.relatedId)}
                  onClick={() => item.unread && void markRead(item.id)}
                  className={`flex gap-3 border-b px-4 py-3 transition hover:bg-muted/50 ${item.unread ? "bg-primary/[0.04]" : ""}`}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-2">
                      <span className="line-clamp-1 flex-1 text-sm font-medium">
                        {item.title}
                      </span>
                      {item.unread && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </span>
                    <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {item.description}
                    </span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(item.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </span>
                </Link>
              );
            })
          )}
        </div>
        <Link
          href="/home/notifications"
          className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium hover:bg-muted/50"
        >
          View all notifications
          <ChevronRight className="h-4 w-4" />
        </Link>
      </PopoverContent>
    </Popover>
  );
}
