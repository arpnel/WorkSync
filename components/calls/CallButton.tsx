"use client";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCalls } from "./CallProvider";
export default function CallButton({
  conversationId,
  disabled = false,
}: {
  conversationId: string;
  disabled?: boolean;
}) {
  const calls = useCalls();
  return (
    <Button
      variant="ghost"
      size="icon"
      title="Start video call"
      aria-label="Start video call"
      disabled={disabled || !calls || calls.busy}
      onClick={() => calls?.start(conversationId)}
    >
      <Video className="size-5" />
    </Button>
  );
}
