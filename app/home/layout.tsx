import ModerationNotice from "@/components/account/ModerationNotice";
import CallProvider from "@/components/calls/CallProvider";
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
      <CallProvider>
        <SidebarProvider>
          <div className="flex h-dvh w-full flex-col overflow-hidden">
            <a
              href="#main-content"
              className="sr-only fixed left-3 top-3 z-[100] rounded-lg bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only"
            >
              Skip to content
            </a>
            <div className="relative z-30 shrink-0">
              <DashboardHeader />
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
              <AppSidebar />

              {/* PAGE CONTENT */}
              <main
                id="main-content"
                tabIndex={-1}
                className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-background p-3 sm:p-5 lg:p-6"
              >
                <ModerationNotice />
                {children}
              </main>
            </div>
          </div>
        </SidebarProvider>
      </CallProvider>
    </ThemeProvider>
  );
}
