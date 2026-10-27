"use client";
import { usePathname } from "next/navigation";
import { WorkspacePageHeader } from "@/components/shared/WorkspacePageHeader";
import { getActiveAdminNavItem } from "./admin-navigation";
export default function AdminPageHeader({ title }: { title: string }) {
  const pathname = usePathname();
  return (
    <WorkspacePageHeader
      title={title}
      description={
        getActiveAdminNavItem(pathname)?.description ?? "Manage your admin workspace."
      }
    />
  );
}
