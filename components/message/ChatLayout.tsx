"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
interface ChatLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
  mobileChatOpen?: boolean;
}
export default function ChatLayout({
  sidebar,
  children,
  mobileChatOpen = false,
}: ChatLayoutProps) {
  return (
    <div className="flex h-[calc(100dvh-6rem)] min-h-0 sm:h-[calc(100dvh-7rem)] w-full flex-col overflow-hidden rounded-xl border bg-background">
      <div className="flex min-h-0 min-w-0 flex-1">
        <div
          className={cn(
            "w-full shrink-0 border-r md:block md:w-80 lg:w-96",
            mobileChatOpen && "hidden",
          )}
        >
          {sidebar}
        </div>
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 md:block",
            !mobileChatOpen && "hidden",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
