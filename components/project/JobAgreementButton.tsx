"use client";
import { type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { platformAction } from "@/services/platform/platformService";
export function JobAgreementButton({
  applicationId,
  children,
}: {
  applicationId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="block w-full text-left"
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            const orderId = await platformAction("worksync_job_agreement", {
              p_application: applicationId,
            });
            router.push(`/home/projects/standard/${orderId}#contract`);
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Unable to open agreement.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {children}
        {busy && <span role="status">Opening contract...</span>}
      </button>
      {error && (
        <p role="alert" className="max-w-sm text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
