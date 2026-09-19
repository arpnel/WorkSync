import AdminAccess from "@/components/admin/AdminAccess";
import type { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import AdminSidebar from "@/components/admin/admin-sidebar";
import AdminHeader from "@/components/admin/admin-header";
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminAccess>
      <SidebarProvider>
        <div className="flex h-dvh w-full overflow-hidden">
          <AdminSidebar />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <AdminHeader />
            <main className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </AdminAccess>
  );
}
