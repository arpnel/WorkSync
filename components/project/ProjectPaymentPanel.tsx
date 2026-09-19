"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProjectContractDialog } from "./ProjectContractDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getProjectPayment,
  startProjectPayment,
  type ProjectPayment,
} from "@/services/payments/paymentService";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";

export function ProjectPaymentPanel({
  project,
  onPayment,
}: {
  project: ProjectWorkspace;
  onPayment?: (payment: ProjectPayment | null) => void;
}) {
  if (
    !project.projectId ||
    !project.clientSignedAt ||
    !project.freelancerSignedAt
  )
    return null;
  return (
    <PaymentPanel
      key={project.projectId}
      contractDetails={<ProjectContractDialog project={project} />}
      onPayment={onPayment}
      projectId={project.projectId}
      client={project.currentParty === "client"}
      budget={project.budget}
      payable={["active", "revision"].includes(project.status.toLowerCase())}
    />
  );
}
export function PaymentPanel({
  projectId,
  client = false,
  budget,
  payable = true,
  onPayment,
  contractDetails,
}: {
  projectId: string;
  contractDetails?: ReactNode;
  client?: boolean;
  budget?: number;
  payable?: boolean;
  onPayment?: (payment: ProjectPayment | null) => void;
}) {
  const [payment, setPayment] = useState<ProjectPayment | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const next = await getProjectPayment(projectId);
      setPayment(next);
      onPayment?.(next);
      setError("");
    } catch (cause) {
      onPayment?.(null);
      setError(
        cause instanceof Error ? cause.message : "Unable to check payment.",
      );
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, [projectId, onPayment]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function pay() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      window.location.assign(await startProjectPayment(projectId));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to open checkout.",
      );
      setBusy(false);
    }
  }
  const total = budget ?? payment?.amount;
  const paidAmount =
    payment?.status === "paid" ? payment.amount : payment ? 0 : undefined;
  const balance =
    total != null && paidAmount != null
      ? Math.max(0, total - paidAmount)
      : undefined;
  const money = (amount: number | undefined) =>
    amount == null
      ? "—"
      : "PHP " +
        amount.toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  const statusLabel = !payment
    ? error
      ? "Unavailable"
      : "Loading"
    : {
        unpaid: "Unpaid",
        pending: "Pending",
        processing: "Processing",
        paid: "Paid",
      }[payment.status];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Project payment</CardTitle>
        <div className="flex items-center gap-2">
          {payment?.mode === "test" && (
            <Badge variant="outline" className="text-xs">
              Test mode
            </Badge>
          )}
          <Badge variant={payment?.status === "paid" ? "default" : "secondary"}>
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="space-y-3 text-sm" aria-label="Payment breakdown">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Agreed total</dt>
            <dd className="font-medium tabular-nums">{money(total)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Amount paid</dt>
            <dd className="font-medium tabular-nums">{money(paidAmount)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t pt-3">
            <dt className="font-medium">Balance due</dt>
            <dd className="font-semibold tabular-nums">{money(balance)}</dd>
          </div>
          {payment?.paidAt && (
            <div className="flex justify-between gap-3 text-xs">
              <dt className="text-muted-foreground">Paid on</dt>
              <dd className="text-right">
                {new Date(payment.paidAt).toLocaleString()}
              </dd>
            </div>
          )}
        </dl>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {client &&
            payable &&
            payment &&
            payment.status !== "paid" &&
            payment.status !== "processing" && (
              <Button
                className="flex-1"
                onClick={() => void pay()}
                disabled={busy || refreshing || !!error}
              >
                {busy
                  ? "Opening checkout…"
                  : payment.status === "pending"
                    ? "Continue checkout"
                    : "Pay now"}
              </Button>
            )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={refreshing || busy}
            aria-label="Refresh payment status"
          >
            <RefreshCw
              className={
                refreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"
              }
            />
            {refreshing ? "Checking…" : "Refresh"}
          </Button>
        </div>
        {contractDetails && (
          <div className="border-t pt-4">{contractDetails}</div>
        )}
      </CardContent>
    </Card>
  );
}
