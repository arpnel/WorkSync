"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { ADMIN_NAV_ITEMS } from "./admin-navigation";
export default function AdminSidebar() {
  const pathname = usePathname();
  const { setOpenMobile, isMobile, state } = useSidebar();
  const collapsed = !isMobile && state === "collapsed";
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
      <SidebarContent className="group-data-[collapsible=icon]:overflow-y-auto">
        <SidebarGroup className={collapsed ? "p-0.5" : "p-3"}>
          <nav aria-label="Admin navigation" className="space-y-1">
            {ADMIN_NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpenMobile(false)}
                aria-current={
                  pathname === item.href ||
                  (item.href !== "/admin" &&
                    pathname.startsWith(item.href + "/"))
                    ? "page"
                    : undefined
                }
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-xl py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary hover:bg-accent hover:text-accent-foreground",
                  collapsed ? "justify-center px-0" : "gap-3 px-3",
                  (pathname === item.href ||
                    (item.href !== "/admin" &&
                      pathname.startsWith(item.href + "/"))) &&
                    "bg-primary/10 text-primary",
                )}
              >
                <item.icon className="size-5 shrink-0" aria-hidden="true" />
                <span className={collapsed ? "sr-only" : undefined}>
                  {item.label}
                </span>
              </Link>
            ))}
          </nav>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
