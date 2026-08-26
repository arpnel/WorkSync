"use client";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { ThemeProvider } from "@/components/theme-provider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <SidebarProvider>
        <div className="flex h-screen w-full overflow-hidden">
          {/* SIDEBAR */}
          <AppSidebar />

          {/* MAIN AREA */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* TOP BAR */}
            <div className="sticky top-0 z-50 shrink-0">
              <DashboardHeader />
            </div>

            {/* PAGE CONTENT */}
            <main className="min-w-0 flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </ThemeProvider>
  );
}