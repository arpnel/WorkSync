import {
  LayoutDashboard,
  Wallet,
  Briefcase,
  Flag,
  ShieldCheck,
  Users,
  FolderKanban,
  ScrollText,
  Scale,
  ChartNoAxesCombined,
  Store,
  ClipboardCheck,
  ShieldAlert,
} from "lucide-react";

export const ADMIN_NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      {
        href: "/admin",
        label: "Dashboard",
        icon: LayoutDashboard,
        description: "An overview of your admin workspace.",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        href: "/admin/financial",
        label: "Transactions",
        icon: Wallet,
        description: "Monitor verified payment activity when connected.",
      },
      {
        href: "/admin/financial/tax",
        label: "Tax & declarations",
        icon: ClipboardCheck,
        description: "Review freelancer tax declarations and settings.",
      },
      {
        href: "/admin/jobs",
        label: "Job Monitoring",
        icon: Briefcase,
        description:
          "Monitor jobs, participants, budgets, and delivery status.",
      },
      {
        href: "/admin/services",
        label: "Services",
        icon: Store,
        description: "Inspect and moderate services.",
      },
      {
        href: "/admin/projects",
        label: "Projects",
        icon: FolderKanban,
        description: "Monitor projects and contracts.",
      },
    ],
  },
  {
    label: "Trust & Safety",
    items: [
      {
        href: "/admin/reports",
        label: "Reports",
        icon: Flag,
        description: "Review evidence, record findings, and resolve reports.",
      },
      {
        href: "/admin/moderation",
        label: "Listing moderation",
        icon: ShieldAlert,
        description: "Review new job and service submissions.",
      },
      {
        href: "/admin/verification",
        label: "Verification",
        icon: ShieldCheck,
        description: "Review submitted identity and address documents.",
      },
      {
        href: "/admin/disputes",
        label: "Disputes",
        icon: Scale,
        description: "Review project disputes and resolution evidence.",
      },
    ],
  },
  {
    label: "People & Support",
    items: [
      {
        href: "/admin/users",
        label: "Users",
        icon: Users,
        description: "Inspect platform users and roles.",
      },
      {
        href: "/admin/support-tickets",
        label: "Support tickets",
        icon: ScrollText,
        description: "Review and respond to account support requests.",
      },
      {
        href: "/admin/assessments",
        label: "Assessments",
        icon: ClipboardCheck,
        description: "Manage category knowledge assessments and results.",
      },
    ],
  },
  {
    label: "Insights & Logs",
    items: [
      {
        href: "/admin/analytics",
        label: "Analytics",
        icon: ChartNoAxesCombined,
        description: "Explore platform activity and project outcomes.",
      },
      {
        href: "/admin/audit",
        label: "Audit history",
        icon: ScrollText,
        description: "Review recorded administrator actions.",
      },
    ],
  },
] as const;

export type AdminNavItem = {
  href: string;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
};

export const ADMIN_NAV_ITEMS = ADMIN_NAV_GROUPS.reduce<AdminNavItem[]>(
  (items, group) => {
    items.push(...group.items);
    return items;
  },
  [],
);
