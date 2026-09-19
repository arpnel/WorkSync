"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const messageShapes = [
  "h-10 w-28",
  "h-24 w-96",
  "h-14 w-64",
  "h-10 w-20",
  "h-32 w-80",
];

export default function LoadingChat({
  messagesOnly = false,
}: {
  messagesOnly?: boolean;
}) {
  return (
    <div
      className="flex h-full min-h-0 flex-col"
      role="status"
      aria-label="Loading messages"
    >
      {!messagesOnly && (
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-full" />

            <div className="space-y-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>

          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      )}

      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4"
        aria-hidden="true"
      >
        {messageShapes.map((shape, index) => {
          const outgoing = index % 2 === 1;
          return (
            <div
              key={index}
              className={cn(
                "flex min-w-0 items-end gap-2",
                outgoing && "flex-row-reverse",
              )}
            >
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <div
                className={cn(
                  "flex min-w-0 max-w-[calc(100%-2.5rem)] flex-col gap-1 sm:max-w-[75%] lg:max-w-[65%]",
                  outgoing ? "items-end" : "items-start",
                )}
              >
                <Skeleton className={cn("max-w-full rounded-3xl", shape)} />
              </div>
            </div>
          );
        })}
      </div>

      {!messagesOnly && (
        <div className="border-t p-4">
          <div className="flex items-end gap-3">
            <Skeleton className="h-10 w-10 rounded-md" />
            <Skeleton className="h-12 flex-1 rounded-xl" />
            <Skeleton className="h-10 w-10 rounded-md" />
          </div>
        </div>
      )}
    </div>
  );
}
