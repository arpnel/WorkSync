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
  setAutoAccept,
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
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30000);
    return () => window.clearInterval(timer);
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
  async function changeAutoAccept() {
    const next = !payment?.autoAccept;
    if (
      next &&
      !window.confirm(
        "Automatically accept future deliveries without manual review? Approved deliveries can release money to the freelancer. Disputes and cancellation holds still apply.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await setAutoAccept(projectId, next);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save preference.",
      );
    } finally {
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
      <CardHeader className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        <p className="text-sm text-muted-foreground">
          Checkout charges the full agreed project amount, including milestone
          projects.
          {payment?.settlementVersion === 2
            ? " Each approved milestone has its own payout. Accepted cancellations refund only funds not reserved for freelancer transfers, subject to provider eligibility."
            : " Cancellation refunds require support until the updated settlement system is installed."}
        </p>
        {payment?.status === "paid" && (
          <div className="rounded-xl border bg-muted/20 p-3 text-sm">
            <p className="font-medium">Freelancer payout</p>
            <p className="mt-1 text-muted-foreground">
              {(
                {
                  awaiting_account:
                    "Add a payout account in Settings to receive this payment.",
                  ready: "Approved payment is queued for transfer.",
                  processing:
                    "Transfer is being submitted. Do not send another payment.",
                  pending: "PayMongo is processing the transfer.",
                  paid: "PayMongo confirmed the transfer to the freelancer.",
                  failed: "Transfer failed. Contact support before retrying.",
                  needs_review:
                    "Transfer needs support review. No duplicate transfer will be sent automatically.",
                  unavailable: "Payout tracking is not available yet.",
                } as Record<string, string>
              )[payment.payout?.status ?? ""] ??
                (payment.autoReleaseEnabled
                  ? "Client payment received. Each approved milestone can be paid separately after transfer checks."
                  : "Client payment received. Automatic payout is not enabled; contact support about release.")}
            </p>
            {payment.payouts?.map((row) => (
              <div
                key={row.payout_id}
                className="mt-3 flex flex-wrap justify-between gap-2 border-t pt-2"
              >
                <span>{row.title}</span>
                <span>
                  {money(Number(row.amount))} ·{" "}
                  {row.status.replaceAll("_", " ")}
                </span>
              </div>
            ))}
            {payment.refunds?.map((row) => (
              <div key={row.refund_id} className="mt-3 border-t pt-2">
                <p>
                  Cancellation refund: {money(Number(row.amount))} ·{" "}
                  {row.status.replaceAll("_", " ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  A confirmed refund can take additional time to appear with the
                  original payment method. Failed or uncertain refunds need
                  support review.
                </p>
              </div>
            ))}
            {(payment.payout?.status === "awaiting_account" ||
              payment.payouts?.some(
                (row) => row.status === "awaiting_account",
              )) &&
              !client && (
                <a
                  href="/home/settings"
                  className="mt-2 inline-block text-primary underline"
                >
                  Set up payout account
                </a>
              )}
          </div>
        )}
        {client && payable && payment?.settlementVersion === 2 && (
          <div className="space-y-2 border-t pt-3 text-sm">
            <p className="font-medium">
              Automatic delivery acceptance: {payment.autoAccept ? "On" : "Off"}
            </p>
            <p className="text-muted-foreground">
              When enabled, future deliveries are accepted without manual review
              on processing. Otherwise, intermediate milestones have 3 days for
              review; final milestones and standard deliveries have 7 days after
              submission. Payouts run on the configured schedule.
            </p>
            {!payment.autoReleaseEnabled && (
              <p className="text-muted-foreground">
                Automatic processing is currently disabled.
              </p>
            )}
            <Button
              variant="outline"
              disabled={busy || refreshing}
              onClick={() => void changeAutoAccept()}
            >
              {payment.autoAccept
                ? "Turn off auto-accept"
                : "Enable auto-accept"}
            </Button>
          </div>
        )}
        <dl className="space-y-3 text-sm" aria-label="Payment breakdown">
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Agreed total</dt>
            <dd className="font-medium tabular-nums">{money(total)}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
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
