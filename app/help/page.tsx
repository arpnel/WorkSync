import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { LogoIcon } from "@/components/shared/logo";
import { HelpCenterBrowser } from "@/components/help/HelpCenterBrowser";
export const metadata: Metadata = { title: "WorkSync Help Center", description: "Browse WorkSync guides and answers." };
export default function HelpPage() {
  return <main className="min-h-screen bg-muted/20">
    <header className="border-b bg-background/90">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="WorkSync home" className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <LogoIcon className="size-8 shrink-0"/>
          <span className="text-base font-bold tracking-tight">WorkSync</span>
          <span className="h-5 w-px bg-border" aria-hidden="true"/>
          <span className="text-sm font-medium text-muted-foreground">Support</span>
        </Link>
        <Link href="/" aria-label="Back to WorkSync" className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">
          <ArrowLeft className="size-4 sm:hidden"/><span className="hidden sm:inline">Back to WorkSync</span><ArrowUpRight className="hidden size-4 sm:inline"/>
        </Link>
      </div>
    </header>
    <div className="mx-auto max-w-7xl px-4 pb-10 pt-4 sm:px-6 sm:pt-5 lg:px-8">
      <HelpCenterBrowser/>
    </div>
  </main>;
}
