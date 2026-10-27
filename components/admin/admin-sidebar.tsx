"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      ADMIN_NAV_GROUPS.map((group) => [
        group.label,
        group.items.some((item) => isActive(item.href)),
      ]),
    ),
  );

  useEffect(() => {
    const activeGroup = ADMIN_NAV_GROUPS.find((group) =>
      group.items.some((item) => item.href === activeNavItem?.href),
    );
    if (activeGroup) {
      setOpenGroups((current) => ({ ...current, [activeGroup.label]: true }));
    }
  }, [pathname, activeNavItem?.href]);

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
          <nav aria-label="Admin navigation" className="space-y-2">
            {ADMIN_NAV_GROUPS.map((group) => {
              const expanded = collapsed || openGroups[group.label] === true;
              return (
                <section key={group.label}>
                  {!collapsed && (
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() =>
                        setOpenGroups((current) => ({
                          ...current,
                          [group.label]: !current[group.label],
                        }))
                      }
                      className="flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <span>{group.label}</span>
                      <ChevronDown
                        className={cn(
                          "size-4 transition-transform",
                          !expanded && "-rotate-90",
                        )}
                        aria-hidden="true"
                      />
                    </button>
                  )}
                  {expanded && (
                    <div className={cn("space-y-1", !collapsed && "pt-1")}>
                      {group.items.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpenMobile(false)}
                          aria-current={
                            isActive(item.href) ? "page" : undefined
                          }
                          title={collapsed ? item.label : undefined}
                          className={cn(
                            "flex min-h-11 items-center rounded-xl py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary hover:bg-accent hover:text-accent-foreground",
                            collapsed ? "justify-center px-0" : "gap-3 px-3",
                            isActive(item.href) && "bg-primary/10 text-primary",
                          )}
                        >
                          <item.icon
                            className="size-5 shrink-0"
                            aria-hidden="true"
                          />
                          <span className={collapsed ? "sr-only" : undefined}>
                            {item.label}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </nav>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
