"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { openSavedTaxReceipt } from "@/lib/payments/receiptClient";
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
  showContractDetails = true,
}: {
  project: ProjectWorkspace;
  onPayment?: (payment: ProjectPayment | null) => void;
  showContractDetails?: boolean;
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
      contractDetails={showContractDetails ? <ProjectContractDialog project={project} /> : undefined}
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
  client,
  budget,
  payable = true,
  onPayment,
  contractDetails,
  showProjectLink = false,
}: {
  projectId: string;
  contractDetails?: ReactNode;
  showProjectLink?: boolean;
  client?: boolean;
  budget?: number;
  payable?: boolean;
  onPayment?: (payment: ProjectPayment | null) => void;
}) {
  const [payment, setPayment] = useState<ProjectPayment | null>(null);
  const isClient = client ?? payment?.isClient ?? false;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
      if (
        document.visibilityState === "visible" &&
        (!paymentStatus || ["pending", "processing"].includes(paymentStatus))
      ) void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [paymentStatus, refresh]);
  useEffect(() => {
    if (!paymentStatus || !["pending", "processing"].includes(paymentStatus))
      return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60000);
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
  const total = payment?.amount ?? (budget == null ? undefined : Math.round(budget * 1.1 * 100) / 100);
  const baseAmount = payment?.baseAmount ?? budget;
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
          <Badge variant={payment?.status === "paid" ? "default" : "secondary"}>
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="space-y-3 text-sm" aria-label="Payment breakdown">
          {payment?.vatBreakdown?.status !== "applicable" && (
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">
                {payment?.vatBreakdown?.status === "not_recorded"
                  ? "Saved payment amount"
                  : "Agreed base price"}
              </dt>
              <dd className="font-medium tabular-nums">
                {money(payment?.vatBreakdown?.status === "not_recorded" ? total : baseAmount)}
              </dd>
            </div>
          )}
          {payment?.vatBreakdown?.status === "applicable" && (
            <>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{money(payment.vatBreakdown.taxableAmount ?? undefined)}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">
                  VAT ({((payment.vatBreakdown.rate ?? 0) * 100).toFixed(0)}%)
                </dt>
                <dd className="tabular-nums">{money(payment.vatBreakdown.amount ?? undefined)}</dd>
              </div>
            </>
          )}
          {payment?.vatBreakdown?.status === "not_applicable" && (
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Freelancer service VAT</dt>
              <dd className="text-muted-foreground">No service VAT recorded in this payment snapshot</dd>
            </div>
          )}
          {payment?.transactionFee != null && (
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Transaction fee</dt>
              <dd className="tabular-nums">{money(payment.transactionFee)}</dd>
            </div>
          )}
          {payment?.vatBreakdown?.status === "applicable" && (
            <>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">Client total (base + VAT)</dt>
                <dd className="font-medium tabular-nums">{money(payment.vatBreakdown.total ?? undefined)}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-t pt-3">
                <dt className="font-medium">
                  {payment.transactionFee == null
                    ? "Total due"
                    : "Total due (including transaction fee)"}
                </dt>
                <dd className="font-semibold tabular-nums">{money(total)}</dd>
              </div>
            </>
          )}
          {payment?.vatBreakdown?.status === "not_recorded" && (
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">VAT breakdown</dt>
              <dd className="text-muted-foreground">Not recorded</dd>
            </div>
          )}
          {payment?.vatBreakdown?.status === "unavailable" && (
            <p className="text-xs text-muted-foreground">
              {payment.checkoutMessage ?? "VAT breakdown is unavailable. Contact support before checkout."}
            </p>
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
              <Button variant="outline" size="sm" className="ml-auto" onClick={() => void receipt()}>
                View receipt
              </Button>
            </>
          )}
            {isClient &&
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
        </div>
        {!isClient && payment?.sellerVerificationMessage && (
          <p role="status" className="text-center text-xs text-amber-600">
            {payment.sellerVerificationMessage}
          </p>
        )}
        {payment?.checkoutAllowed === false && payment.checkoutMessage && (
          <p className="text-center text-xs text-amber-600">
            {payment.checkoutMessage}
          </p>
        )}
        {contractDetails && (
          <div className="border-t pt-4">{contractDetails}</div>
        )}
        {showProjectLink && payment?.projectHref && (
          <div className="border-t pt-4">
            <Link className="text-sm underline underline-offset-4" href={payment.projectHref}>
              View project
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
