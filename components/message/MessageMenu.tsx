"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import MessageListsDialog, {
  type MessageListsProps,
} from "./MessageListsDialog";
import { Archive, Ban, Menu, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
const destinations = [
  { id: "archived", label: "Archived chats", icon: Archive },
  { id: "blocked", label: "Blocked users", icon: Ban },
] as const;

export default function MessageMenu(props: MessageListsProps) {
  const [view, setView] = useState<"archived" | "blocked" | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full bg-muted text-foreground hover:bg-muted/80"
            aria-label="Messages menu"
            title="Messages menu"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-52"
          onCloseAutoFocus={(event) => {
            if (view) event.preventDefault();
          }}
        >
          {destinations.map(({ id, label, icon: Icon }) => (
            <DropdownMenuItem key={id} onSelect={() => setView(id)}>
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/home/settings#messages">
              <Settings className="h-4 w-4" aria-hidden="true" />
              Message settings
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {view && (
        <MessageListsDialog
          key={view}
          {...props}
          view={view}
          onClose={() => setView(null)}
          onReturnFocus={() => triggerRef.current?.focus()}
        />
      )}
    </>
  );
}
