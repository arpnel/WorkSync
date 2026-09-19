"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  useSidebar,
} from "@/components/ui/sidebar";
import { LogoIcon } from "@/components/shared/logo";
import { cn } from "@/lib/utils";
import { ADMIN_NAV_ITEMS } from "./admin-navigation";
export default function AdminSidebar() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-4">
        <Link
          href="/admin"
          onClick={() => setOpenMobile(false)}
          className="flex items-center justify-center gap-2 rounded-md px-2 py-2"
        >
          <LogoIcon className="h-7 w-auto" />
          <span className="text-lg font-bold tracking-tight">WorkSync</span>
        </Link>
        <p className="text-center text-xs font-medium text-muted-foreground">
          Admin workspace
        </p>
      </SidebarHeader>
      <div className="mx-4 border-b" />
      <SidebarContent>
        <SidebarGroup>
          <nav aria-label="Admin navigation" className="space-y-1">
            {ADMIN_NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpenMobile(false)}
                aria-current={pathname === item.href ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 min-h-11 rounded-xl px-3 py-2.5 text-sm transition hover:bg-accent hover:text-accent-foreground",
                  pathname === item.href &&
                    "bg-primary/10 font-medium text-primary",
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            ))}
          </nav>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
