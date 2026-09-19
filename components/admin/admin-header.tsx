"use client";
import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { ADMIN_NAV_ITEMS } from "./admin-navigation";
export default function AdminHeader() {
  const pathname = usePathname();
  return (
    <header className="flex shrink-0 items-center gap-3 border-b bg-background px-4 py-4 sm:px-6">
      <SidebarTrigger />
      <span className="h-5 border-l" aria-hidden="true" />
      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold sm:text-2xl">
        {ADMIN_NAV_ITEMS.find((item) => item.href === pathname)?.label ??
          "Admin"}
      </h1>
      <Badge variant="secondary">Admin</Badge>
    </header>
  );
}
