"use client";
import { type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { platformAction } from "@/services/platform/platformService";
import { traceProjectFlow } from "@/services/project/projectFlowDiagnostics";
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
            traceProjectFlow("New Project clicked; requesting agreement", {
              applicationId,
              rpc: "worksync_job_agreement",
              expectedResultType: "service_order_id",
            });
            const rpcResult = await platformAction("worksync_job_agreement", {
              p_application: applicationId,
            });
            traceProjectFlow("agreement RPC response received", {
              applicationId,
              resultType: typeof rpcResult,
              expectedResultType: "service_order_id",
              rpcResult,
            });
            if (typeof rpcResult !== "string")
              throw new Error("Agreement RPC did not return a service order ID.");
            const serviceOrderId = rpcResult;
            traceProjectFlow("navigating to project workspace", {
              routeIdType: "service_order_id",
              routeId: serviceOrderId,
            });
            router.push(`/home/projects/standard/${serviceOrderId}#contract`);
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
