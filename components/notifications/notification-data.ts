export type NotificationKind =
  | "message"
  | "project"
  | "agreement"
  | "listing"
  | "system";

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  description: string;
  time: string;
  group: "Today" | "Earlier";
  unread: boolean;
}

export const notificationItems: NotificationItem[] = [
  {
    id: "agreement-ready",
    kind: "agreement",
    title: "Contract ready for confirmation",
    description:
      "The budget, delivery, and revision terms are agreed. Review the final contract.",
    time: "8 min ago",
    group: "Today",
    unread: true,
  },
  {
    id: "new-message",
    kind: "message",
    title: "New project message",
    description:
      "Alex sent a message in the Data Visualization Dashboard project.",
    time: "24 min ago",
    group: "Today",
    unread: true,
  },
  {
    id: "job-application",
    kind: "listing",
    title: "New job application",
    description:
      "A freelancer applied to your 2D Animation job post with a proposal.",
    time: "1 hr ago",
    group: "Today",
    unread: true,
  },
  {
    id: "milestone-review",
    kind: "project",
    title: "Milestone submitted for review",
    description:
      "The first project milestone is ready for your review and approval.",
    time: "Yesterday",
    group: "Earlier",
    unread: false,
  },
  {
    id: "listing-archived",
    kind: "system",
    title: "Listing archived",
    description:
      "Your archived listing is no longer visible in marketplace results.",
    time: "2 days ago",
    group: "Earlier",
    unread: false,
  },
];
