"use client"

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { ThemeProvider } from "@/components/theme-provider"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <SidebarProvider>
        <div className="flex w-full min-h-screen">
          <AppSidebar />

          <main className="flex-1 w-full p-6">
            <SidebarTrigger />
            {children}
          </main>

        </div>
      </SidebarProvider>
    </ThemeProvider>
  )
}