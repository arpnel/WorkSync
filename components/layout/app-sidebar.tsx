"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarGroupLabel,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

import {
  MoreHorizontal,
  Home,
  Briefcase,
  Users,
  Clipboard,
  Calendar,
  ChartNoAxesCombined,
  ClipboardCheck,
  LayoutTemplate,
  Wallet,
  CreditCard,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", icon: Home, href: "/home/dashboard" }],
  },
  {
    label: "Explore",
    items: [
      { label: "Find Jobs", icon: Briefcase, href: "/home/marketplace?listingType=job" },
      { label: "Hire Talents", icon: Users, href: "/home/marketplace?listingType=freelancer" },
    ],
  },
  {
    label: "Manage",
    items: [
      { label: "My Projects", icon: Briefcase, href: "/home/projects" },
      { label: "Project Plans", icon: LayoutTemplate, href: "/home/project-plans" },
      { label: "My Listings", icon: Clipboard, href: "/home/my-listings" },
      { label: "Schedule", icon: Calendar, href: "/home/schedule" },
      { label: "Analytics", icon: ChartNoAxesCombined, href: "/home/analytics" },
      { label: "Assessment", icon: ClipboardCheck, href: "/home/assessments" },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Payouts", icon: Wallet, href: "/home/payouts" },
      { label: "Subscription", icon: CreditCard, href: "/home/subscription" },
    ],
  },
] as const;

const MOBILE_ITEMS = [
  NAV_GROUPS[0].items[0],
  NAV_GROUPS[1].items[0],
  NAV_GROUPS[2].items[0],
  NAV_GROUPS[2].items[5],
] as const;

function itemIsActive(pathname: string, listingType: string | null, href: string) {
  const [targetPath, query] = href.split("?");
  if (pathname !== targetPath && !pathname.startsWith(`${targetPath}/`))
    return false;
  const targetListingType = new URLSearchParams(query).get("listingType");
  return targetListingType ? listingType === targetListingType : true;
}

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listingType = searchParams.get("listingType");
  const { setOpenMobile, isMobile, state } = useSidebar();
  const collapsed = !isMobile && state === "collapsed";

  function navigation(iconOnly: boolean) {
    return (
      <>
        {NAV_GROUPS.map((group, index) => (
          <div key={group.label}>
            <SidebarGroup className={iconOnly ? "p-0.5" : "px-2 py-1"}>
              <SidebarGroupLabel className="h-6 px-2 text-[10px] font-semibold uppercase tracking-wide text-sidebar-foreground/60">
                {group.label}
              </SidebarGroupLabel>
              <nav aria-label={group.label} className="space-y-0.5">
                {group.items.map((item) => {
                  const active = itemIsActive(pathname, listingType, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpenMobile(false)}
                      aria-current={active ? "page" : undefined}
                      title={iconOnly ? item.label : undefined}
                      className={cn(
                        "flex min-h-10 cursor-pointer select-none items-center rounded-lg py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                        iconOnly ? "justify-center px-0" : "gap-3 px-2",
                        "hover:bg-accent hover:text-accent-foreground",
                        active && "bg-primary/10 text-primary",
                      )}
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className={iconOnly ? "sr-only" : undefined}>
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </nav>
            </SidebarGroup>
            {index < NAV_GROUPS.length - 1 && !iconOnly && (
              <SidebarSeparator className="mx-3 my-1" />
            )}
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      <Sidebar collapsible="icon" className="top-16 h-[calc(100dvh-4rem)]">
        <SidebarHeader
          className={cn("border-b py-2", collapsed ? "px-0" : "px-3")}
        >
          <div
            className={cn(
              "flex items-center",
              collapsed ? "justify-center" : "gap-2",
            )}
          >
            <SidebarTrigger className="size-11 shrink-0" />
            {!collapsed && (
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Workspace
              </span>
            )}
          </div>
        </SidebarHeader>
        <SidebarContent
          className={cn(
            "sidebar-container overscroll-contain",
            collapsed && "pt-2",
          )}
        >
          {navigation(collapsed)}
        </SidebarContent>
      </Sidebar>
    </>
  );
}

export function MobileNavigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listingType = searchParams.get("listingType");
  const { setOpenMobile, openMobile } = useSidebar();
  const primary = MOBILE_ITEMS;
  return (
    <nav
      aria-label="Phone navigation"
      className="z-30 grid shrink-0 grid-cols-5 border-t bg-card px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden"
    >
      {primary.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={itemIsActive(pathname, listingType, href) ? "page" : undefined}
          className={cn(
            "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-primary",
            itemIsActive(pathname, listingType, href)
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground",
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
          {label === "Dashboard" ? "Home" : label}
        </Link>
      ))}
      <button
        type="button"
        aria-expanded={openMobile}
        aria-label="More navigation options"
        onClick={() => setOpenMobile(true)}
        className={cn(
          "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-primary",
          !primary.some((item) => itemIsActive(pathname, listingType, item.href))
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground",
        )}
      >
        <MoreHorizontal className="size-5" aria-hidden="true" />
        More
      </button>
    </nav>
  );
}
