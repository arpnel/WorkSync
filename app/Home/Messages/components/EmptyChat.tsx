"use client";

import { MessageCircleMore } from "lucide-react";

import { Button } from "@/components/ui/button";

interface EmptyChatProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyChat({
  title = "Select a conversation",
  description = "Choose a conversation from the sidebar to start chatting with your client or collaborator.",
  actionLabel,
  onAction,
}: EmptyChatProps) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <MessageCircleMore className="h-10 w-10 text-muted-foreground" />
        </div>

        <h2 className="text-2xl font-semibold">{title}</h2>

        <p className="mt-3 text-sm text-muted-foreground">{description}</p>

        {actionLabel && onAction && (
          <Button className="mt-6" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
