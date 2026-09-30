import { WorkspaceDesign } from "@/components/layout/WorkspaceDesign";
import AdminAccess from "@/components/admin/AdminAccess";
import type { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import AdminSidebar from "@/components/admin/admin-sidebar";
import AdminHeader from "@/components/admin/admin-header";
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminAccess>
      <SidebarProvider>
        <div className="flex h-dvh w-full flex-col overflow-hidden">
          <a
            href="#admin-content"
            className="sr-only fixed left-3 top-3 z-[100] rounded-lg bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only"
          >
            Skip to content
          </a>
          <AdminHeader />
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <AdminSidebar />
            <main
              id="admin-content"
              tabIndex={-1}
              className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-background p-4 sm:p-5 lg:p-6"
            >
              <WorkspaceDesign>{children}</WorkspaceDesign>
            </main>
          </div>
        </div>
      </SidebarProvider>
    </AdminAccess>
  );
}
