import {
  BellRing,
  BriefcaseBusiness,
  CheckCheck,
  FileCheck2,
  MessageCircle,
  Settings2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  notificationItems,
  type NotificationKind,
} from "@/components/notifications/notification-data";

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
  listing: "Listing",
  system: "System",
};

export default function NotificationsPage() {
  const unreadCount = notificationItems.filter((item) => item.unread).length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Keep track of project, message, and listing activity.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="secondary">{unreadCount} unread</Badge>
            <span className="text-xs text-muted-foreground">
              {notificationItems.length} total updates
            </span>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm">
          <CheckCheck className="h-4 w-4" />
          Mark all as read
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-7">
          {(["Today", "Earlier"] as const).map((group) => (
            <section key={group} aria-labelledby={`notifications-${group}`}>
              <h2
                id={`notifications-${group}`}
                className="mb-3 text-sm font-semibold"
              >
                {group}
              </h2>
              <div className="space-y-3">
                {notificationItems
                  .filter((item) => item.group === group)
                  .map((item) => {
                    const Icon = kindIcons[item.kind];
                    return (
                      <article
                        key={item.id}
                        id={item.id}
                        className="scroll-mt-24 rounded-lg border bg-card p-4"
                      >
                        <div className="flex gap-4">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                            <Icon className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold">{item.title}</h3>
                                {item.unread && (
                                  <span className="h-2 w-2 rounded-full bg-primary" />
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {item.time}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              {item.description}
                            </p>
                            <div className="mt-3 flex items-center justify-between">
                              <Badge variant="outline">
                                {kindLabels[item.kind]}
                              </Badge>
                              <Button type="button" variant="ghost" size="sm">
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
          ))}
        </div>

        <aside className="h-fit border-l pl-5 lg:sticky lg:top-4">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4" />
            <h2 className="text-sm font-semibold">Notification overview</h2>
          </div>
          <dl className="mt-4 space-y-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Unread</dt>
              <dd className="font-medium">{unreadCount}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Project updates</dt>
              <dd className="font-medium">
                {
                  notificationItems.filter(
                    (item) =>
                      item.kind === "project" || item.kind === "agreement",
                  ).length
                }
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Messages</dt>
              <dd className="font-medium">
                {
                  notificationItems.filter((item) => item.kind === "message")
                    .length
                }
              </dd>
            </div>
          </dl>
          <p className="mt-5 border-t pt-4 text-xs leading-5 text-muted-foreground">
            Notification delivery settings will appear here when preferences are
            connected.
          </p>
        </aside>
      </div>
    </div>
  );
}
