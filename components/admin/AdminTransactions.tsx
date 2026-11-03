"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Code2,
  CreditCard,
  Clock3,
  Copy,
  Download,
  Eye,
  RotateCcw,
  FolderKanban,
  History,
  SlidersHorizontal,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { AdminFilterPanel, AdminStatus } from "@/components/admin/admin-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StyledSelect } from "@/components/ui/styled-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { openSavedTaxReceipt } from "@/lib/payments/receiptClient";
import { supabase } from "@/lib/supabaseClient";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Refund = {
  refund_id: string;
  amount: number | string;
  status: string;
  provider_refund_id: string | null;
  claimed_at: string | null;
  updated_at: string | null;
  refunded_at: string | null;
};
type Transaction = {
  kind?: "payment" | "subscription";
  payment_id: string;
  project_id: string | null;
  order_id: string | null;
  billing_period?: "monthly" | "yearly" | null;
  payer_id: string;
  amount: number;
  status: string;
  payment_method: string | null;
  transaction_reference: string | null;
  provider: string | null;
  livemode: boolean | null;
  currency: string | null;
  provider_payment_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  paid_at: string | null;
  settlement_checked_at: string | null;
  platform_service_fee: number | null;
  platform_vat_amount: number | null;
  platform_tax_treatment: string | null;
  freelancer_service_vat_taxable_base: number | null;
  freelancer_service_vat_rate: number | null;
  freelancer_service_vat_amount: number | null;
  freelancer_service_vat_classification: string | null;
  freelancer_service_vat_rule: string | null;
  payer: { user_id: string; display_name: string | null; email: string | null };
  project: {
    project_id: string;
    title: string;
    status: string;
    order_id: string | null;
    client_id: string;
    freelancer_id: string;
  } | null;
  refunds: Refund[];
  receipt: { receipt_number: string; issued_at: string } | null;
};
type PageData = {
  rows: Transaction[];
  total: number;
  limit: number;
  offset: number;
  summary: { total: number; paid: number; pending: number };
};

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});
const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const formatDateTime = (value: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? dateTime.format(new Date(value))
    : "Not recorded";
const paymentStatus = (value: string) =>
  value === "paid"
    ? "Payment confirmed"
    : value === "pending"
      ? "Awaiting confirmation"
      : value.replaceAll("_", " ");

function dateFilterValue(date: string, end = false) {
  if (!date) return "";
  return new Date(`${date}T${end ? "23:59:59.999" : "00:00:00"}`).toISOString();
}

function summaryTone(kind: "paid" | "pending" | "refunded" | "canceled") {
  if (kind === "paid") return "border-emerald-500/20 bg-emerald-500/5";
  if (kind === "pending") return "border-amber-500/20 bg-amber-500/5";
  if (kind === "refunded") return "border-sky-500/20 bg-sky-500/5";
  return "border-rose-500/20 bg-rose-500/5";
}

export default function AdminTransactions() {
  const [data, setData] = useState<PageData | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [through, setThrough] = useState("");
  const [draftStatus, setDraftStatus] = useState("all");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftThrough, setDraftThrough] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [receiptBusy, setReceiptBusy] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundReviewed, setRefundReviewed] = useState(false);
  const [refundMessage, setRefundMessage] = useState("");
  const [recordType, setRecordType] = useState<"payments" | "subscriptions">("payments");
  const sequence = useRef(0);

  const load = useCallback(
    async (signal: AbortSignal) => {
      const request = ++sequence.current;
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        q: search.trim(),
        status,
        mode: "all",
        offset: String(offset),
      });
      const endpoint = recordType === "subscriptions"
        ? "/api/admin/transactions/subscriptions"
        : "/api/admin/transactions";
      if (from) params.set("from", dateFilterValue(from));
      if (through) params.set("through", dateFilterValue(through, true));
      let responseStatus: number | null = null;
      let diagnosticRequestId: string | undefined;
      let diagnosticStage: string | undefined = "browser_session";
      let serverDiagnostic: unknown;
      let authorizationSent = false;
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (sessionError)
          throw new Error("Unable to read the sign-in session.");
        if (!session?.access_token)
          throw new Error("Sign in to view payments.");
        diagnosticStage = "api_request";
        authorizationSent = true;
        const response = await fetch(`${endpoint}?${params}`, {
          cache: "no-store",
          signal,
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        responseStatus = response.status;
        const body = await response.json();
        diagnosticRequestId = body.requestId;
        diagnosticStage = body.stage;
        serverDiagnostic = body.diagnostic;
        if (!response.ok)
          throw new Error(body.error || "Transactions are unavailable.");
        if (!Array.isArray(body.rows) || !body.summary)
          throw new Error("Transaction response was invalid.");
        if (request === sequence.current) {
          setData(body as PageData);
          setSelected((current) => current
            ? (body.rows as Transaction[]).find((row) => row.payment_id === current.payment_id) ?? current
            : current);
        }
      } catch (cause) {
        if (signal.aborted) return;
        console.error(
          "[admin/transactions] Failed to load transaction records " +
            JSON.stringify({
              status: responseStatus,
              requestId: diagnosticRequestId,
              stage: diagnosticStage,
              authorizationSent,
              serverDiagnostic,
              message:
                cause instanceof Error
                  ? cause.message
                  : "Transactions are unavailable.",
            }),
        );
        if (request === sequence.current)
          setError(
            cause instanceof Error
              ? cause.message
              : "Transactions are unavailable.",
          );
      } finally {
        if (!signal.aborted && request === sequence.current) setLoading(false);
      }
    },
    [from, offset, recordType, search, status, through],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => void load(controller.signal),
      search ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load, reload, search]);

  const pageRefundedCount = useMemo(
    () =>
      (data?.rows ?? []).filter((row) =>
        row.refunds.some((refund) => refund.status === "refunded"),
      ).length,
    [data?.rows],
  );
  const pageCanceledCount = useMemo(
    () =>
      (data?.rows ?? []).filter((row) =>
        ["canceled", "cancelled"].includes(row.project?.status ?? ""),
      ).length,
    [data?.rows],
  );

  function resetFilters() {
    setSearch("");
    setStatus("all");
    setFrom("");
    setThrough("");
    setDraftStatus("all");
    setDraftFrom("");
    setDraftThrough("");
    setOffset(0);
    setFiltersOpen(false);
  }

  function applyFilters() {
    if (draftFrom && draftThrough && draftFrom > draftThrough) return;
    setStatus(draftStatus);
    setFrom(draftFrom);
    setThrough(draftThrough);
    setOffset(0);
    setFiltersOpen(false);
  }

  async function receipt(row: Transaction, download: boolean) {
    setReceiptBusy(`${row.payment_id}:${download ? "download" : "view"}`);
    setError("");
    try {
      await openSavedTaxReceipt(row.payment_id, download);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Receipt unavailable.");
    } finally {
      setReceiptBusy("");
    }
  }

  async function refundSubscription(row: Transaction) {
    if (!refundReviewed || refundBusy || row.kind !== "subscription") return;
    setRefundBusy(true);
    setError("");
    setRefundMessage("");
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) throw new Error("Sign in again to process this refund.");
      const response = await fetch("/api/admin/transactions/subscriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderId: row.payment_id, reviewedUnused: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Subscription refund could not be submitted.");
      setRefundMessage(result.message || "Refund submitted.");
      setRefundReviewed(false);
      setReload((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Subscription refund could not be submitted.");
    } finally {
      setRefundBusy(false);
    }
  }

  async function reconcileSubscriptionRefund(refundId: string) {
    if (refundBusy) return;
    setRefundBusy(true);
    setError("");
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) throw new Error("Sign in again to review this refund.");
      const response = await fetch("/api/admin/transactions/subscriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reconcileRefundId: refundId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Refund status could not be refreshed.");
      setRefundMessage(result.message || "Refund status refreshed.");
      setReload((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Refund status could not be refreshed.");
    } finally {
      setRefundBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      <AdminPageHeader title="Recorded transactions" />

      {data && (
        <section
          aria-label="Transaction summary"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <Card
            className={`gap-2 rounded-xl border p-4 shadow-none ${summaryTone("pending")}`}
          >
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Pending confirmation</span>
              <Clock3 className="size-4" />
            </div>
            <p className="text-2xl font-semibold tabular-nums">
              {data.summary.pending.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">
              Pending payments
            </p>
          </Card>
          <Card
            className={`gap-2 rounded-xl border p-4 shadow-none ${summaryTone("paid")}`}
          >
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Paid / confirmed</span>
              <CircleDollarSign className="size-4" />
            </div>
            <p className="text-2xl font-semibold tabular-nums">
              {data.summary.paid.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">
              Confirmed payments
            </p>
          </Card>
          <Card
            className={`gap-2 rounded-xl border p-4 shadow-none ${summaryTone("refunded")}`}
          >
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Refunded</span>
              <RotateCcw className="size-4" />
            </div>
            <p className="text-2xl font-semibold tabular-nums">
              {pageRefundedCount.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">
              Confirmed refunds
            </p>
          </Card>
          <Card
            className={`gap-2 rounded-xl border p-4 shadow-none ${summaryTone("canceled")}`}
          >
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Canceled</span>
              <Ban className="size-4" />
            </div>
            <p className="text-2xl font-semibold tabular-nums">
              {pageCanceledCount.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">
              Visible transactions linked to canceled projects
            </p>
          </Card>
        </section>
      )}

      <AdminFilterPanel ariaLabel="Filter transactions">
        <div className="mb-3 flex gap-2">
          <Button type="button" size="sm" variant={recordType === "payments" ? "default" : "outline"} onClick={() => { setRecordType("payments"); setOffset(0); setSelected(null); }}>Project payments</Button>
          <Button type="button" size="sm" variant={recordType === "subscriptions" ? "default" : "outline"} onClick={() => { setRecordType("subscriptions"); setOffset(0); setSelected(null); }}>Subscriptions</Button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
            />
            <Input
              aria-label="Search transactions"
              className="h-10 bg-background pl-10 font-normal"
              placeholder="Search transactions, client ID, or provider reference"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setOffset(0);
              }}
            />
          </div>
          <div className="flex shrink-0 gap-2">
            <Popover
              open={filtersOpen}
              onOpenChange={(open) => {
                if (open) {
                  setDraftStatus(status);
                  setDraftFrom(from);
                  setDraftThrough(through);
                }
                setFiltersOpen(open);
              }}
            >
              <PopoverTrigger asChild>
                <Button type="button" variant="outline">
                  <SlidersHorizontal className="size-4" />
                  Filters
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-[min(22rem,calc(100vw-2rem))] p-4"
              >
                <div className="grid gap-4">
                  <label className="grid gap-1.5 text-sm font-medium">
                    Payment status
                    <StyledSelect
                      className="h-10 rounded-lg border bg-background px-3 font-normal"
                      value={draftStatus}
                      onChange={(event) => setDraftStatus(event.target.value)}
                    >
                      <option value="all">All payment statuses</option>
                      <option value="paid">Paid / confirmed</option>
                      <option value="pending">Awaiting confirmation</option>
                      <option value="refunded">Refunded</option>
                      <option value="canceled">Canceled</option>
                    </StyledSelect>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid min-w-0 gap-1.5 text-sm font-medium">
                      Recorded from
                      <Input
                        className="h-10 bg-background font-normal"
                        type="date"
                        value={draftFrom}
                        max={draftThrough || undefined}
                        onChange={(event) => setDraftFrom(event.target.value)}
                      />
                    </label>
                    <label className="grid min-w-0 gap-1.5 text-sm font-medium">
                      To
                      <Input
                        className="h-10 bg-background font-normal"
                        type="date"
                        value={draftThrough}
                        min={draftFrom || undefined}
                        onChange={(event) =>
                          setDraftThrough(event.target.value)
                        }
                      />
                    </label>
                  </div>
                  <div className="flex items-center justify-between border-t pt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDraftStatus("all");
                        setDraftFrom("");
                        setDraftThrough("");
                      }}
                    >
                      <X className="size-4" />
                      Clear filters
                    </Button>
                    <Button type="button" size="sm" onClick={applyFilters}>
                      Apply
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              variant="outline"
              aria-label="Refresh transactions"
              onClick={() => setReload((value) => value + 1)}
              disabled={loading}
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" />
          Dates use your local timezone. Search accepts IDs and provider
          references.
        </p>
      </AdminFilterPanel>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <span>{error}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setReload((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      )}

      <Card className="min-w-0 gap-0 rounded-xl border shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-semibold">{recordType === "subscriptions" ? "Subscription transactions" : "Payment records"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {recordType === "subscriptions" ? "Premium purchase and refund records." : "Provider-confirmed payment, project, refund, and receipt context."}
            </p>
          </div>
          {data && (
            <Badge variant="outline">
              {data.total.toLocaleString()} matching
            </Badge>
          )}
        </div>
        {loading && data && (
          <p
            role="status"
            className="border-b px-4 py-2 text-xs text-muted-foreground"
          >
            Updating transaction results…
          </p>
        )}
        {loading && !data ? (
          <div className="p-4">
            <ContentSkeleton label="Loading transactions" variant="admin-table" />
          </div>
        ) : !data && !error ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Loading transactions…
          </div>
        ) : data && data.rows.length === 0 && !loading ? (
          <div className="space-y-2 p-12 text-center">
            <p className="font-medium">No transactions found</p>
            <p className="text-sm text-muted-foreground">
              Try a different search or clear the filters.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetFilters}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          data && (
            <div className="m-4 overflow-x-auto rounded-lg border">
              <Table className="min-w-[920px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Transaction</TableHead>
                    <TableHead>Client / project</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Recorded</TableHead>
                    <TableHead>Receipt</TableHead>
                    <TableHead className="w-28 text-right">Inspect</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => {
                    const confirmedRefunds = row.refunds.filter(
                      (refund) => refund.status === "refunded",
                    );
                    const refundTotal = confirmedRefunds.reduce(
                      (sum, refund) => sum + Number(refund.amount),
                      0,
                    );
                    const receiptActionBusy = receiptBusy.startsWith(
                      `${row.payment_id}:`,
                    );
                    return (
                      <TableRow key={row.payment_id}>
                        <TableCell className="max-w-64">
                          <p className="truncate font-medium">
                            {row.transaction_reference ||
                              "No checkout reference"}
                          </p>
                          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                            {row.payment_id}
                          </p>
                        </TableCell>
                        <TableCell className="max-w-64">
                          <p className="truncate font-medium">
                            {row.payer.display_name ||
                              row.payer.email ||
                              "Client"}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {row.kind === "subscription" ? `Premium · ${row.billing_period === "yearly" ? "1 year" : "1 month"}` : row.project?.title || "Project unavailable"}
                          </p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-semibold tabular-nums">
                          {peso.format(row.amount)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1.5">
                            <AdminStatus
                              tone={row.status === "paid" ? "green" : "orange"}
                            >
                              {paymentStatus(row.status)}
                            </AdminStatus>
                            {refundTotal > 0 && (
                              <AdminStatus tone="violet">
                                Refunded {peso.format(refundTotal)}
                              </AdminStatus>
                            )}
                            {row.refunds.some((refund) =>
                              [
                                "pending",
                                "processing",
                                "needs_review",
                              ].includes(refund.status),
                            ) && (
                              <AdminStatus tone="orange">
                                Refund under review
                              </AdminStatus>
                            )}
                            {row.refunds.some(
                              (refund) => refund.status === "failed",
                            ) && (
                              <AdminStatus tone="red">
                                Refund failed
                              </AdminStatus>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDateTime(row.created_at)}
                        </TableCell>
                        <TableCell>
                          {row.status === "paid" ? (
                            <div className="flex flex-wrap gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                aria-label={`View receipt for ${row.payment_id}`}
                                disabled={receiptActionBusy}
                                onClick={() => void receipt(row, false)}
                              >
                                <Eye className="size-3.5" />
                                View
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              After payment
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="w-28 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => { setRefundReviewed(false); setRefundMessage(""); setSelected(row); }}
                          >
                            Inspect
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )
        )}
        {data && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
            <p className="text-sm text-muted-foreground">
              {data.total === 0
                ? "0 transactions"
                : `Showing ${data.offset + 1}–${Math.min(data.offset + data.rows.length, data.total)} of ${data.total.toLocaleString()}`}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={loading || offset === 0}
                onClick={() =>
                  setOffset((value) => Math.max(0, value - (data.limit || 10)))
                }
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading || offset + data.rows.length >= data.total}
                onClick={() => setOffset((value) => value + (data.limit || 10))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !receiptBusy && !refundBusy) setSelected(null);
        }}
      >
        <DialogContent className="flex max-h-[90dvh] w-[min(96vw,56rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
          {selected && (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto">
              <DialogHeader className="border-b px-5 py-4 pr-14">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <DialogTitle>Transaction details</DialogTitle>
                      <AdminStatus tone={selected.status === "paid" ? "green" : "orange"}>
                        {paymentStatus(selected.status)}
                      </AdminStatus>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <DialogDescription className="break-all font-mono text-xs">{selected.payment_id}</DialogDescription>
                      <CopyButton value={selected.payment_id} label="payment ID" />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-muted-foreground">Total amount</p>
                    <p className="mt-0.5 text-xl font-semibold tabular-nums">
                      {peso.format(selected.amount)}
                    </p>
                  </div>
                </div>
              </DialogHeader>
                <div className="space-y-4 px-5 py-4">
                <section className="space-y-3 rounded-xl border p-4">
                  <SectionHeading icon={<CreditCard className="size-3.5" />}>Payment information</SectionHeading>
                  <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                    <Detail label="Provider / environment">
                      <span className="mr-2 font-semibold">{selected.provider || "Provider not recorded"}</span>
                      <Badge variant="outline">{selected.livemode == null ? "Environment unknown" : selected.livemode ? "Live mode" : "Test mode"}</Badge>
                    </Detail>
                    <Detail label="Payment method">
                      <Badge variant="outline" className="mr-2">{selected.payment_method?.toUpperCase() || "N/A"}</Badge>
                      {selected.payment_method?.toLowerCase() === "qrph" ? "QR Ph standard" : ""}
                    </Detail>
                    <Detail label="Checkout session">
                      <CopyValue value={selected.transaction_reference || "Not recorded"} label="checkout session" />
                    </Detail>
                    <Detail label="Provider payment ID">
                      <CopyValue value={selected.provider_payment_id || "Not recorded"} label="provider payment ID" />
                    </Detail>
                    <Detail label="Payment date">
                      <span className="inline-flex items-center gap-2"><CalendarDays className="size-3.5 text-muted-foreground" />{selected.paid_at ? formatDateTime(selected.paid_at) : "Not recorded"}</span>
                    </Detail>
                  </dl>
                </section>
                <section className="space-y-3 rounded-xl border p-4">
                  <SectionHeading icon={<FolderKanban className="size-3.5" />}>{selected.kind === "subscription" ? "Subscription context" : "Project context"}</SectionHeading>
                  <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                    <Detail label={selected.kind === "subscription" ? "Plan" : "Project"}>
                      {selected.kind === "subscription" ? `Premium · ${selected.billing_period === "yearly" ? "1 year" : "1 month"}` : selected.project?.title || "Project unavailable"}
                    </Detail>
                    <Detail label={selected.kind === "subscription" ? "Purchaser" : "Client / payer"}>
                      {selected.payer.display_name || selected.payer.email || selected.payer_id}
                    </Detail>
                    {selected.kind !== "subscription" && <Detail label="Project status"><Badge variant="outline" className="capitalize">{selected.project?.status?.replaceAll("_", " ") || "Not available"}</Badge></Detail>}
                  </dl>
                  <details className="group border-t pt-3">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                      <Code2 className="size-3.5" /> Technical references &amp; raw metadata
                      <ChevronDown className="ml-auto size-3.5 transition-transform group-open:rotate-180" />
                    </summary>
                    <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                      {selected.kind !== "subscription" && <Detail label="Project ID"><CopyValue value={selected.project_id || "Not linked"} label="project ID" /></Detail>}
                      <Detail label="Order ID"><CopyValue value={selected.order_id || selected.project?.order_id || "Not linked"} label="order ID" /></Detail>
                      <Detail label="Client user ID"><CopyValue value={selected.payer_id} label="client user ID" /></Detail>
                      {selected.kind !== "subscription" && <Detail label="Freelancer profile ID"><CopyValue value={selected.project?.freelancer_id || "Not available"} label="freelancer profile ID" /></Detail>}
                    </dl>
                  </details>
                </section>
                <section className="rounded-xl border p-4">
                  <SectionHeading icon={<History className="size-3.5" />}>Record audit &amp; history</SectionHeading>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md border p-3"><Detail label="Record created">{formatDateTime(selected.created_at)}</Detail></div>
                    <div className="rounded-md border p-3"><Detail label="Last updated">{formatDateTime(selected.updated_at)}</Detail></div>
                  </dl>
                </section>
              </div>
              {selected.refunds.length > 0 && (
                <section className="space-y-3 rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <SectionHeading icon={<RotateCcw className="size-3.5" />}>Refunds</SectionHeading>
                    <Badge variant="outline">{selected.refunds.length}</Badge>
                  </div>
                  <div className="divide-y rounded-lg border">
                    {selected.refunds.map((refund) => (
                      <div
                        key={refund.refund_id}
                        className="grid gap-2 p-3 text-sm sm:grid-cols-[1fr_auto]"
                      >
                        <div>
                          <p className="font-medium">
                            {refund.status.replaceAll("_", " ")} ·{" "}
                            {peso.format(Number(refund.amount))}
                          </p>
                          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                            Refund ID: {refund.refund_id}
                            {refund.provider_refund_id
                              ? ` · Provider: ${refund.provider_refund_id}`
                              : ""}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Requested {formatDateTime(refund.claimed_at)}
                          <br />
                          Confirmed{" "}
                          {refund.status === "refunded"
                            ? formatDateTime(refund.refunded_at)
                            : "Not confirmed"}
                          {selected.kind === "subscription" && refund.provider_refund_id && ["pending", "needs_review"].includes(refund.status) && (
                            <Button type="button" size="sm" variant="outline" className="mt-2" disabled={refundBusy} onClick={() => void reconcileSubscriptionRefund(refund.refund_id)}>
                              {refundBusy ? "Checking…" : "Refresh refund status"}
                            </Button>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              </div>
              <section className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
                {selected.kind === "subscription" && selected.status === "paid" && selected.refunds.every((refund) => refund.status === "failed") ? (
                  <div className="min-w-full space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <p className="text-sm font-medium">Review the purchaser’s support ticket before issuing a full Premium refund.</p>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-1" checked={refundReviewed} onChange={(event) => setRefundReviewed(event.target.checked)} />
                      <span>I reviewed the ticket and confirmed that no Premium-only benefit was used.</span>
                    </label>
                    {refundMessage && <p role="status" className="text-sm text-emerald-700">{refundMessage}</p>}
                    <Button type="button" variant="destructive" disabled={!refundReviewed || refundBusy} onClick={() => void refundSubscription(selected)}>
                      {refundBusy ? "Submitting refund…" : "Issue full subscription refund"}
                    </Button>
                  </div>
                ) : null}
                {selected.kind !== "subscription" && <div>
                      <h3 className="text-sm font-semibold">Transaction receipt</h3>
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    {selected.status === "paid" && selected.receipt ? (
                      <>{selected.receipt.receipt_number}<span className="mx-2 text-muted-foreground">&middot;</span>Issued {dateOnly.format(new Date(selected.receipt.issued_at))}</>
                    ) : "Not available"}
                  </p>
                </div>}
                {selected.kind !== "subscription" && selected.status === "paid" && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!!receiptBusy}
                      onClick={() => void receipt(selected, false)}
                    >
                      <Eye className="size-4" />
                      View receipt
                    </Button>
                    <Button
                      type="button"
                      disabled={!!receiptBusy}
                      onClick={() => void receipt(selected, true)}
                    >
                      <Download className="size-4" />
                      Download PDF
                    </Button>
                  </div>
                )}
              </section>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-medium">{children}</dd>
    </div>
  );
}

function SectionHeading({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold">
      <span className="text-muted-foreground">{icon}</span>
      {children}
    </h3>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      className="size-6 shrink-0"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      onClick={() => void handleCopy()}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

function CopyValue({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1 rounded-md border bg-background/40 px-2 py-0.5 font-mono text-xs">
      <span className="min-w-0 break-all">{value}</span>
      <CopyButton value={value} label={label} />
    </span>
  );
}
