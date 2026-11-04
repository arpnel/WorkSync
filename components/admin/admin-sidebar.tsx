"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { ADMIN_NAV_GROUPS, getActiveAdminNavItem } from "./admin-navigation";

export default function AdminSidebar() {
  const pathname = usePathname();
  const { setOpenMobile, isMobile, state } = useSidebar();
  const collapsed = !isMobile && state === "collapsed";
  const activeNavItem = getActiveAdminNavItem(pathname);
  const isActive = (href: string) => activeNavItem?.href === href;

  return (
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
        {ADMIN_NAV_GROUPS.map((group, index) => (
          <div key={group.label}>
            <SidebarGroup className={collapsed ? "p-0.5" : "px-2 py-1"}>
              <SidebarGroupLabel className="h-6 px-2 text-[10px] font-semibold uppercase tracking-wide text-sidebar-foreground/60">
                {group.label}
              </SidebarGroupLabel>
              <nav aria-label={group.label} className="space-y-0.5">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpenMobile(false)}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "flex min-h-10 cursor-pointer select-none items-center rounded-lg py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                      collapsed ? "justify-center px-0" : "gap-3 px-2",
                      "hover:bg-accent hover:text-accent-foreground",
                      isActive(item.href) && "bg-primary/10 text-primary",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className={collapsed ? "sr-only" : undefined}>
                      {item.label}
                    </span>
                  </Link>
                ))}
              </nav>
            </SidebarGroup>
            {index < ADMIN_NAV_GROUPS.length - 1 && !collapsed && (
              <SidebarSeparator className="mx-3 my-1" />
            )}
          </div>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
