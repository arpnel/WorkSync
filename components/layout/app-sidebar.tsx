"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

import {
  MoreHorizontal,
  Home,
  ShoppingCart,
  Briefcase,
  Users,
  MessageCircle,
  Clipboard,
  Settings,
  Calendar,
  ChartNoAxesCombined,
  BellRing,
  UserRound,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", icon: Home, href: "/home/dashboard" },
  { label: "Marketplace", icon: ShoppingCart, href: "/home/marketplace" },
  { label: "Projects", icon: Briefcase, href: "/home/projects" },
  { label: "Messages", icon: MessageCircle, href: "/home/messages" },
  { label: "My Listings", icon: Clipboard, href: "/home/my-listings" },
  { label: "Schedule", icon: Calendar, href: "/home/schedule" },
  { label: "Notifications", icon: BellRing, href: "/home/notifications" },
  { label: "Clients", icon: Users, href: "/home/Client" },
  { label: "Analytics", icon: ChartNoAxesCombined, href: "/home/analytics" },
  { label: "Profile", icon: UserRound, href: "/home/profile" },
  { label: "Settings", icon: Settings, href: "/home/settings" },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  const { setOpenMobile, isMobile, state } = useSidebar();
  const collapsed = !isMobile && state === "collapsed";
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  function navigation(iconOnly: boolean) {
    return (
      <nav aria-label="Main navigation" className="space-y-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpenMobile(false)}
            aria-current={isActive(item.href) ? "page" : undefined}
            title={iconOnly ? item.label : undefined}
            className={cn(
              "flex min-h-11 items-center rounded-xl py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary",
              iconOnly ? "justify-center px-0" : "gap-3 px-3",
              "hover:bg-accent hover:text-accent-foreground",
              isActive(item.href) && "bg-primary/10 text-primary",
            )}
          >
            <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className={iconOnly ? "sr-only" : undefined}>
              {item.label}
            </span>
          </Link>
        ))}
      </nav>
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
        <SidebarContent className="group-data-[collapsible=icon]:overflow-y-auto">
          <SidebarGroup className={collapsed ? "p-0.5" : "p-3"}>
            {navigation(collapsed)}
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </>
  );
}

export function MobileNavigation() {
  const pathname = usePathname();
  const { setOpenMobile, openMobile } = useSidebar();
  const primary = NAV_ITEMS.slice(0, 4);
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  return (
    <nav
      aria-label="Phone navigation"
      className="z-30 grid shrink-0 grid-cols-5 border-t bg-card px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden"
    >
      {primary.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-primary",
            isActive(href)
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground",
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
          {label === "Dashboard"
            ? "Home"
            : label === "Marketplace"
              ? "Explore"
              : label}
        </Link>
      ))}
      <button
        type="button"
        aria-expanded={openMobile}
        aria-label="More navigation options"
        onClick={() => setOpenMobile(true)}
        className={cn(
          "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-primary",
          !primary.some((item) => isActive(item.href))
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
