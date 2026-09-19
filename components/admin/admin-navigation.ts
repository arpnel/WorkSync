import {
  LayoutDashboard,
  Wallet,
  Briefcase,
  Flag,
  ShieldCheck,
  Users,
  ListChecks,
} from "lucide-react";
export const ADMIN_NAV_ITEMS = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "An overview of your admin workspace.",
  },
  {
    href: "/admin/financial",
    label: "Transactions",
    icon: Wallet,
    description: "Monitor verified payment activity when connected.",
  },
  {
    href: "/admin/jobs",
    label: "Job Monitoring",
    icon: Briefcase,
    description: "Monitor jobs, participants, budgets, and delivery status.",
  },
  {
    href: "/admin/reports",
    label: "Reports",
    icon: Flag,
    description: "Review evidence, record findings, and resolve reports.",
  },
  {
    href: "/admin/verification",
    label: "Verification",
    icon: ShieldCheck,
    description: "Review submitted identity and address documents.",
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: Users,
    description: "Inspect platform users and roles.",
  },
  {
    href: "/admin/services",
    label: "Services",
    icon: Briefcase,
    description: "Inspect and moderate services.",
  },
  {
    href: "/admin/projects",
    label: "Projects",
    icon: ListChecks,
    description: "Monitor projects and contracts.",
  },
  {
    href: "/admin/audit",
    label: "Audit history",
    icon: ListChecks,
    description: "Review recorded administrator actions.",
  },
  {
    href: "/admin/disputes",
    label: "Disputes",
    icon: Flag,
    description: "Review project disputes and resolution evidence.",
  },
  {
    href: "/admin/analytics",
    label: "Analytics",
    icon: ListChecks,
    description: "Explore platform activity and project outcomes.",
  },
] as const;
