"use client";
import { usePathname } from "next/navigation";
import { WorkspacePageHeader } from "@/components/shared/WorkspacePageHeader";
import { ADMIN_NAV_ITEMS } from "./admin-navigation";
export default function AdminPageHeader({ title }: { title: string }) {
  const pathname = usePathname();
  return (
    <WorkspacePageHeader
      title={title}
      description={
        ADMIN_NAV_ITEMS.find(
          (item) =>
            item.href === pathname ||
            (item.href !== "/admin" && pathname.startsWith(item.href + "/")),
        )?.description ?? "Manage your admin workspace."
      }
    />
  );
}
