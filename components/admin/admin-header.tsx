"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { LogoIcon } from "@/components/shared/logo";
import { ADMIN_NAV_ITEMS } from "./admin-navigation";
export default function AdminHeader() {
  const pathname = usePathname();
  return (
    <header className="relative z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-card px-3 sm:px-4 lg:px-6">
      <SidebarTrigger className="md:hidden" />
      <Link
        href="/admin"
        className="flex shrink-0 items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-primary"
      >
        <LogoIcon className="size-8 shrink-0" />
        <span className="text-base font-bold tracking-tight sm:text-xl">
          WorkSync
        </span>
      </Link>
      <span className="mx-2 hidden h-5 border-l sm:block" aria-hidden="true" />
      <span className="hidden min-w-0 truncate text-sm text-muted-foreground sm:block">
        {ADMIN_NAV_ITEMS.find((item) => item.href === pathname)?.label ??
          "Workspace"}
      </span>
      <Badge variant="secondary" className="ml-auto rounded-full px-3 py-1">
        Admin workspace
      </Badge>
    </header>
  );
}
