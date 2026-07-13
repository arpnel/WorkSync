"use client";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarTrigger } from "@/components/ui/sidebar";

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
        <div className="flex min-h-screen w-full">
          {/* SIDEBAR */}
          <AppSidebar />

          {/* MAIN AREA */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* TOP BAR */}
            <header className="flex h-14 items-center border-b px-4">
              <SidebarTrigger className="cursor-pointer" />
            </header>

            {/* PAGE CONTENT */}
            <main className="min-w-0 flex-1 p-6">{children}</main>
          </div>
        </div>
      </SidebarProvider>
    </ThemeProvider>
  );
}
