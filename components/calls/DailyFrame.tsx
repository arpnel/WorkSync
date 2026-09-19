"use client";
import { useEffect, useRef, useState } from "react";
import type { DailyCall } from "@daily-co/daily-js";
import { Button } from "@/components/ui/button";

export default function DailyFrame({
  roomUrl,
  token,
}: {
  roomUrl: string;
  token: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const destruction = useRef<Promise<unknown>>(Promise.resolve());
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    let frame: DailyCall | undefined;
    void (async () => {
      try {
        await destruction.current;
        if (disposed) return;
        if (!window.isSecureContext || !navigator.mediaDevices) {
          setError(
            "Camera and microphone access requires HTTPS or localhost. Open WorkSync using a secure address, then retry.",
          );
          return;
        }
        const { default: Daily } = await import("@daily-co/daily-js");
        if (disposed || !container.current) return;
        frame = Daily.createFrame(container.current, {
          iframeStyle: {
            width: "100%",
            height: "100%",
            border: "0",
            borderRadius: "12px",
          },
          showLeaveButton: false,
          showFullscreenButton: true,
        });
        frame.on("left-meeting", () => {
          if (!disposed)
            setError(
              (current) =>
                current ||
                "You disconnected from the meeting. Retry to rejoin this call.",
            );
        });
        frame.on("error", () => {
          if (!disposed)
            setError(
              "The meeting connection failed. Check your connection and retry to rejoin this call.",
            );
        });
        frame.on("camera-error", (event) => {
          if (!disposed)
            setError(
              event.error?.type === "permissions"
                ? "Camera or microphone permission was denied. Allow access in your browser's site settings, then retry. You can also continue with available devices."
                : event.error?.type === "not-found"
                  ? "A camera or microphone could not be found. Connect your device and retry, or continue with available devices."
                  : "Camera or microphone access failed. Check browser and system permissions, close other apps using your devices, then retry. You can also continue with available devices.",
            );
        });
        await frame.join({ url: roomUrl, token });
      } catch {
        if (!disposed)
          setError(
            (current) =>
              current ||
              "Unable to join. Check camera and microphone permissions and your connection, then retry.",
          );
      }
    })();
    return () => {
      disposed = true;
      if (frame) destruction.current = frame.destroy().catch(() => undefined);
    };
  }, [roomUrl, token, attempt]);
  return (
    <div className="space-y-2">
      {error && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted p-3">
          <p role="alert" className="min-w-0 flex-1 text-sm">
            {error}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError("");
              setAttempt((value) => value + 1);
            }}
          >
            Retry connection
          </Button>
        </div>
      )}
      <div
        ref={container}
        className="h-[65dvh] min-h-72 overflow-hidden rounded-xl bg-muted"
      />
    </div>
  );
}
