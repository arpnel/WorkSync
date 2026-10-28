"use client";
import { type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { platformAction } from "@/services/platform/platformService";
import { traceProjectFlow } from "@/services/project/projectFlowDiagnostics";
import { JobAgreementWizard } from "@/components/project/JobAgreementWizard";
import type { ProjectPlanSnapshotData } from "@/services/project/projectPlanSnapshot";
export function JobAgreementButton({
  applicationId,
  jobTitle,
  proposedPrice,
  estimatedDays,
  proposedPlan,
  children,
}: {
  applicationId: string;
  jobTitle: string;
  proposedPrice: number | null;
  estimatedDays: number | null;
  proposedPlan: ProjectPlanSnapshotData | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="navigation-card block w-full rounded-2xl text-left focus-visible:outline-2 focus-visible:outline-primary"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      <JobAgreementWizard
        open={open}
        onOpenChange={setOpen}
        applicationId={applicationId}
        jobTitle={jobTitle}
        proposedPrice={proposedPrice}
        estimatedDays={estimatedDays}
        proposedPlan={proposedPlan}
        onOpenExistingAgreement={async () => {
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
            // Newer RPC versions return an order ID; older deployed versions
            // returned a contract ID. Resolve either to the order ID expected
            // by the workspace route, using the signed-in user's RLS access.
            const { data: order, error: orderError } = await supabase
              .from("service_orders")
              .select("order_id")
              .eq("order_id", rpcResult)
              .maybeSingle();
            if (orderError)
              throw new Error("Unable to verify access to the agreement.");

            let serviceOrderId = order?.order_id;
            if (!serviceOrderId) {
              const { data: contract, error: contractError } = await supabase
                .from("contracts")
                .select("order_id")
                .eq("contract_id", rpcResult)
                .maybeSingle();
              if (contractError)
                throw new Error("Unable to verify access to the agreement.");
              if (typeof contract?.order_id !== "string")
                throw new Error("The agreement project could not be found.");
              serviceOrderId = contract.order_id;
            }
            traceProjectFlow("navigating to project workspace", {
              routeIdType: "service_order_id",
              routeId: serviceOrderId,
            });
            router.push(`/home/projects/standard/${serviceOrderId}#contract`);
            setOpen(false);
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
      />
      {busy && <span role="status" className="text-xs text-muted-foreground">Opening existing agreement...</span>}
      {error && (
        <p role="alert" className="max-w-sm text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
