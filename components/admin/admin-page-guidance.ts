import type { AdminModule } from "@/services/admin/adminModules";
export const ADMIN_PAGE_GUIDANCE: Record<
  AdminModule,
  {
    search: string;
    title: string;
    description: string;
    href: string;
    link: string;
  }
> = {
  overview: {
    search: "Search admin activity",
    title: "Marketplace operations",
    description:
      "Follow client demand, freelancer supply and recent moderation decisions.",
    href: "/admin/analytics",
    link: "Explore analytics",
  },
  transactions: {
    search: "Search transaction reference or status",
    title: "Payment oversight",
    description:
      "Inspect recorded payment status and references. A recorded transaction alone does not confirm freelancer payout.",
    href: "/admin/projects",
    link: "Review projects",
  },
  services: {
    search: "Search service title or status",
    title: "Freelancer offerings",
    description:
      "Review service descriptions, pricing and listing status. Inspect a listing before recording a moderation decision.",
    href: "/admin/reports",
    link: "Review listing reports",
  },
  jobs: {
    search: "Search job title or status",
    title: "Client opportunities",
    description:
      "Check budgets, job descriptions and listing status to keep opportunities useful for freelancers.",
    href: "/admin/reports",
    link: "Review listing reports",
  },
  projects: {
    search: "Search project title or status",
    title: "Delivery oversight",
    description:
      "Inspect project budgets, deadlines and participants. Use the disputes queue for work that needs a resolution.",
    href: "/admin/disputes",
    link: "Open disputes",
  },
  verification: {
    search: "Search applicant name or status",
    title: "Identity review",
    description:
      "Review the available evidence and provider result before making a decision. Record a clear reason for each manual review.",
    href: "/admin/users",
    link: "Manage users",
  },
  users: {
    search: "Search user name or status",
    title: "Marketplace members",
    description:
      "Inspect client and freelancer profiles within Admin. Review account history before suspending or restoring access.",
    href: "/admin/audit",
    link: "View action history",
  },
  reports: {
    search: "Search report title or status",
    title: "Marketplace safety",
    description:
      "Inspect the reported listing and evidence before resolving or dismissing a report. Explain the decision in your review notes.",
    href: "/admin/services",
    link: "Review services",
  },
  disputes: {
    search: "Search project ID, dispute ID, category or status",
    title: "Fair project resolutions",
    description:
      "Review the agreement, delivery history and messages before recording a resolution for the client and freelancer.",
    href: "/admin/projects",
    link: "Review projects",
  },
  audit: {
    search: "Search action or status",
    title: "Accountability trail",
    description:
      "Inspect recorded decisions and affected accounts when following up on moderation activity.",
    href: "/admin",
    link: "Marketplace overview",
  },
};
