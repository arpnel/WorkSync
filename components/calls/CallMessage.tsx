"use client";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  callPreview,
  callState,
  parseCallMessage,
} from "@/lib/calls/callMessage";
import { useCalls } from "./CallProvider";
export default function CallMessage({ content }: { content: string }) {
  const parsed = parseCallMessage(content);
  const calls = useCalls();
  if (!parsed) return <>{content}</>;
  const live = ["ringing", "active"].includes(callState(parsed.call));
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2">
        <Video className="size-4" />
        {callPreview(content)}
      </p>
      {live && calls && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => calls.open(parsed.call.id)}
        >
          View call
        </Button>
      )}
    </div>
  );
}
