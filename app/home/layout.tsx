import { Suspense } from "react";
import ModerationNotice from "@/components/account/ModerationNotice";
import { WorkspaceDesign } from "@/components/layout/WorkspaceDesign";
import CallProvider from "@/components/calls/CallProvider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar, MobileNavigation } from "@/components/layout/app-sidebar";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { ThemeProvider } from "@/components/theme-provider";
import { FaqBubble } from "@/components/landing/FaqBubble";
import { MessagePresenceProvider } from "@/components/message/MessagePresenceProvider";

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
        <MessagePresenceProvider>
          <SidebarProvider className="h-dvh min-h-0 overflow-hidden">
            <div className="fixed inset-0 flex h-dvh w-full flex-col overflow-hidden">
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
                <Suspense fallback={null}>
                  <AppSidebar />
                </Suspense>

                {/* PAGE CONTENT */}
                <main
                  id="main-content"
                  tabIndex={-1}
                  className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain bg-background p-4 sm:p-5 lg:p-6"
                >
                  <ModerationNotice />
                  <WorkspaceDesign>{children}</WorkspaceDesign>
                </main>
              </div>
              <Suspense fallback={null}>
                <MobileNavigation />
              </Suspense>
            </div>
            <FaqBubble supportEnabled aboveMobileNav />
          </SidebarProvider>
        </MessagePresenceProvider>
      </CallProvider>
    </ThemeProvider>
  );
}
