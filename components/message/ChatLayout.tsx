"use client";

import * as React from "react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

interface ChatLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export default function ChatLayout({ sidebar, children }: ChatLayoutProps) {
  return (
    <div className="flex h-[calc(100vh-8rem)] w-full overflow-hidden rounded-xl border bg-background">
      <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
        <ResizablePanel defaultSize={350} minSize={350} maxSize={450}>
          {sidebar}
        </ResizablePanel>
        
        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={65} minSize={55} className="min-w-0">
          {children}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
