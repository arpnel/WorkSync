import { Loader2 } from "lucide-react";

export function AuthLoadingScreen({
  message = "Signing you in...",
}: {
  message?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/75 p-4 text-foreground"
      role="status"
      aria-live="assertive"
      aria-busy="true"
    >
      <div className="flex min-w-48 flex-col items-center gap-3 rounded-2xl border bg-card px-8 py-7 shadow-xl">
        <Loader2
          className="size-8 animate-spin text-primary"
          aria-hidden="true"
        />
        <p className="text-sm font-semibold">{message}</p>
      </div>
    </div>
  );
}
