import type { Metadata } from "next";
import { HelpCenterBrowser } from "@/components/help/HelpCenterBrowser";
import { HelpHomeLinks } from "@/components/help/HelpHomeLinks";
export const metadata: Metadata = { title: "WorkSync Help Center", description: "Browse WorkSync guides and answers." };

export default function HelpPage() {
  return <main className="min-h-screen bg-muted/20">
    <header className="border-b bg-background/90">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <HelpHomeLinks />
      </div>
    </header>
    <div className="mx-auto max-w-7xl px-4 pb-10 pt-4 sm:px-6 sm:pt-5 lg:px-8">
      <HelpCenterBrowser/>
    </div>
  </main>;
}
