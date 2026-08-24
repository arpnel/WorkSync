"use client";

import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingChat() {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
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

      {/* Messages */}
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="flex justify-start">
          <Skeleton className="h-16 w-64 rounded-2xl" />
        </div>

        <div className="flex justify-end">
          <Skeleton className="h-14 w-52 rounded-2xl" />
        </div>

        <div className="flex justify-start">
          <Skeleton className="h-20 w-72 rounded-2xl" />
        </div>

        <div className="flex justify-end">
          <Skeleton className="h-12 w-44 rounded-2xl" />
        </div>

        <div className="flex justify-start">
          <Skeleton className="h-16 w-60 rounded-2xl" />
        </div>
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <div className="flex items-end gap-3">
          <Skeleton className="h-10 w-10 rounded-md" />
          <Skeleton className="h-12 flex-1 rounded-xl" />
          <Skeleton className="h-10 w-10 rounded-md" />
        </div>
      </div>
    </div>
  );
}
