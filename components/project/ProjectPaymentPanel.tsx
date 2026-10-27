"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { RefreshCw } from "lucide-react";
import { openSavedTaxReceipt } from "@/lib/payments/receiptClient";
import { Badge } from "@/components/ui/badge";
import { ProjectContractDialog } from "./ProjectContractDialog";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
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
  const [confirmAutoAccept, setConfirmAutoAccept] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);
  const paymentStatus = payment?.status;
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
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  useEffect(() => {
    if (!paymentStatus || !["pending", "processing"].includes(paymentStatus))
      return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [paymentStatus, refresh]);
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
    if (next) {
      setConfirmAutoAccept(true);
      return;
    }
    await saveAutoAccept(false);
  }
  async function saveAutoAccept(next: boolean) {
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
  const total = payment?.amount ?? budget;
  const paidAmount =
    payment?.status === "paid" ? payment.amount : payment ? 0 : undefined;
  const balance =
    total != null && paidAmount != null
      ? Math.max(0, total - paidAmount)
      : undefined;
  const money = (amount: number | undefined) =>
    amount == null
      ? "\u2014"
      : "PHP " +
        amount.toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  const receipt = async () => {
    if (!payment?.paymentId) return;
    try { await openSavedTaxReceipt(payment.paymentId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Receipt unavailable."); }
  };
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
                  {money(Number(row.amount))} {"\u00b7"}{" "}
                  {row.status.replaceAll("_", " ")}
                </span>
              </div>
            ))}
            {payment.refunds?.map((row) => (
              <div key={row.refund_id} className="mt-3 border-t pt-2">
                <p>
                  Cancellation refund: {money(Number(row.amount))} {"\u00b7"}{" "}
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
            <dt className="text-muted-foreground">
              {payment?.vatBreakdown?.status === "applicable"
                ? "Client total (base + VAT)"
                : payment?.vatBreakdown?.status === "not_recorded"
                  ? "Saved payment amount"
                  : "Agreed base price"}
            </dt>
            <dd className="font-medium tabular-nums">{money(total)}</dd>
          </div>
          {(payment?.vatBreakdown?.status === "applicable" || payment?.vatBreakdown?.status === "not_applicable") && (
            <>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">Base price before VAT</dt>
                <dd className="tabular-nums">{money(payment.vatBreakdown.taxableAmount ?? undefined)}</dd>
              </div>
              {payment.vatBreakdown.status === "applicable" && (
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">
                  Freelancer service VAT ({((payment.vatBreakdown.rate ?? 0) * 100).toFixed(0)}%)
                </dt>
                <dd className="tabular-nums">{money(payment.vatBreakdown.amount ?? undefined)}</dd>
              </div>
              )}
              {payment.vatBreakdown.status === "not_applicable" && (
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Freelancer service VAT</dt>
                  <dd className="text-muted-foreground">Not applicable (reviewed non-VAT status)</dd>
                </div>
              )}
            </>
          )}
          {payment?.vatBreakdown?.status === "not_recorded" && (
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">VAT breakdown</dt>
              <dd className="text-muted-foreground">Not recorded</dd>
            </div>
          )}
          {payment?.vatBreakdown?.status === "review_required" && (
            <p className="text-xs text-amber-600">
              {payment.checkoutMessage ?? "The freelancer's required Form 2303 seller verification must be approved before checkout."}
            </p>
          )}
          {payment?.vatBreakdown?.status === "unavailable" && (
            <p className="text-xs text-muted-foreground">
              {payment.checkoutMessage ?? "VAT breakdown is unavailable. Contact support before checkout."}
            </p>
          )}
          {payment?.checkoutAllowed !== false && payment?.vatBreakdown?.reviewNotice && (
            <p className="text-xs text-amber-600">{payment.vatBreakdown.reviewNotice}</p>
          )}
          {payment?.checkoutAllowed === false && payment.checkoutMessage &&
            payment.vatBreakdown?.status !== "review_required" &&
            payment.vatBreakdown?.status !== "unavailable" && (
              <p className="text-xs text-amber-600">{payment.checkoutMessage}</p>
            )}
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
          {payment?.status === "paid" && (
            <>
              <Button variant="outline" size="sm" onClick={() => void receipt()}>
                View receipt
              </Button>
            </>
          )}
            {client &&
            payable &&
            payment &&
            payment.status !== "paid" &&
            payment.status !== "processing" && (
              <Button
                className="flex-1"
                onClick={() => void pay()}
                disabled={busy || refreshing || !!error || payment.checkoutAllowed === false}
              >
                {busy
                  ? "Opening checkout\u2026"
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
            Refresh
          </Button>
        </div>
        {contractDetails && (
          <div className="border-t pt-4">{contractDetails}</div>
        )}
        <ConfirmActionDialog
          open={confirmAutoAccept}
          onOpenChange={setConfirmAutoAccept}
          title="Enable automatic delivery acceptance?"
          description="Future deliveries will be accepted without manual review. Approved deliveries can release money to the freelancer. Disputes and cancellation holds still apply."
          confirmLabel="Enable auto-accept"
          onConfirm={() => {
            setConfirmAutoAccept(false);
            void saveAutoAccept(true);
          }}
        />
      </CardContent>
    </Card>
  );
}
