"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Download,
  Eye,
  RotateCcw,
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
  payment_id: string;
  project_id: string | null;
  order_id: string | null;
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
        const response = await fetch(`/api/admin/transactions?${params}`, {
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
        if (request === sequence.current) setData(body as PageData);
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
    [from, offset, search, status, through],
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
              Pending payments across filtered results
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
              Confirmed payments across filtered results
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
              Visible transactions with confirmed refunds
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
            <h2 className="font-semibold">Payment records</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Provider-confirmed payment, project, refund, and receipt context.
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
            <ContentSkeleton label="Loading transactions" variant="table" />
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
            <div className="overflow-x-auto">
              <Table className="min-w-[920px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Transaction</TableHead>
                    <TableHead>Client / project</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Recorded</TableHead>
                    <TableHead>Receipt</TableHead>
                    <TableHead className="text-right">Inspect</TableHead>
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
                            {row.project?.title || "Project unavailable"}
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
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                aria-label={`Download receipt for ${row.payment_id}`}
                                disabled={receiptActionBusy}
                                onClick={() => void receipt(row, true)}
                              >
                                <Download className="size-3.5" />
                                PDF
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              After payment
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelected(row)}
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
          if (!open && !receiptBusy) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>Transaction inspection</DialogTitle>
                <DialogDescription className="break-all font-mono">
                  {selected.payment_id}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <section className="space-y-3 rounded-xl border p-4">
                  <h3 className="text-sm font-semibold">Payment record</h3>
                  <dl className="grid gap-3 text-sm">
                    <Detail label="Status">
                      <AdminStatus
                        tone={selected.status === "paid" ? "green" : "orange"}
                      >
                        {paymentStatus(selected.status)}
                      </AdminStatus>
                    </Detail>
                    <Detail label="Amount">
                      {peso.format(selected.amount)}{" "}
                      {selected.currency || "PHP"}
                    </Detail>
                    <Detail label="Provider / environment">
                      {selected.provider || "Provider not recorded"} ·{" "}
                      {selected.livemode == null
                        ? "Environment not recorded"
                        : selected.livemode
                          ? "Live"
                          : "Test"}
                    </Detail>
                    <Detail label="Payment method">
                      {selected.payment_method || "Not recorded"}
                    </Detail>
                    <Detail label="Checkout reference">
                      {selected.transaction_reference || "Not recorded"}
                    </Detail>
                    <Detail label="Provider payment ID">
                      {selected.provider_payment_id || "Not recorded"}
                    </Detail>
                    <Detail label="Payment date">
                      {selected.paid_at
                        ? formatDateTime(selected.paid_at)
                        : "Payment date not recorded"}
                    </Detail>
                  </dl>
                </section>
                <section className="space-y-3 rounded-xl border p-4">
                  <h3 className="text-sm font-semibold">
                    Project and participants
                  </h3>
                  <dl className="grid gap-3 text-sm">
                    <Detail label="Project">
                      {selected.project?.title || "Project unavailable"}
                    </Detail>
                    <Detail label="Project ID">
                      {selected.project_id || "Not linked"}
                    </Detail>
                    <Detail label="Order ID">
                      {selected.order_id ||
                        selected.project?.order_id ||
                        "Not linked"}
                    </Detail>
                    <Detail label="Client / payer">
                      <Link
                        className="underline underline-offset-2"
                        href={`/admin/users/${encodeURIComponent(selected.payer_id)}`}
                      >
                        {selected.payer.display_name ||
                          selected.payer.email ||
                          selected.payer_id}
                      </Link>
                      <span className="mt-1 block break-all font-mono text-xs text-muted-foreground">
                        {selected.payer_id}
                      </span>
                    </Detail>
                    <Detail label="Freelancer profile ID">
                      {selected.project?.freelancer_id || "Not available"}
                    </Detail>
                    <Detail label="Project status">
                      {selected.project?.status?.replaceAll("_", " ") ||
                        "Not available"}
                    </Detail>
                  </dl>
                </section>
                <section className="space-y-3 rounded-xl border p-4">
                  <h3 className="text-sm font-semibold">Audit timeline</h3>
                  <dl className="grid gap-3 text-sm">
                    <Detail label="Record created">
                      {formatDateTime(selected.created_at)}
                    </Detail>
                    <Detail label="Last updated">
                      {formatDateTime(selected.updated_at)}
                    </Detail>
                    <Detail label="Provider confirmed">
                      {selected.paid_at
                        ? formatDateTime(selected.paid_at)
                        : "Payment date not recorded"}
                    </Detail>
                    <Detail label="Settlement last checked">
                      {formatDateTime(selected.settlement_checked_at)}
                    </Detail>
                    <Detail label="Payment ID">{selected.payment_id}</Detail>
                    <Detail label="Provider">
                      {selected.provider || "Not recorded"}
                    </Detail>
                  </dl>
                </section>
                <section className="space-y-3 rounded-xl border p-4">
                  <h3 className="text-sm font-semibold">
                    Recorded tax and fee context
                  </h3>
                  <dl className="grid gap-3 text-sm">
                    <Detail label="Platform service fee">
                      {selected.platform_service_fee == null
                        ? "Not recorded"
                        : peso.format(selected.platform_service_fee)}
                    </Detail>
                    <Detail label="Platform VAT">
                      {selected.platform_vat_amount == null
                        ? "Not recorded"
                        : peso.format(selected.platform_vat_amount)}
                    </Detail>
                    <Detail label="Platform tax treatment">
                      {selected.platform_tax_treatment?.replaceAll("_", " ") ||
                        "Not configured"}
                    </Detail>
                    <Detail label="Freelancer service VAT">
                      {selected.freelancer_service_vat_amount == null
                        ? "Not recorded"
                        : peso.format(selected.freelancer_service_vat_amount)}
                    </Detail>
                    <Detail label="VAT classification">
                      {selected.freelancer_service_vat_classification?.replaceAll(
                        "_",
                        " ",
                      ) || "Not recorded"}
                    </Detail>
                    <Detail label="VAT rule">
                      {selected.freelancer_service_vat_rule || "Not recorded"}
                    </Detail>
                  </dl>
                </section>
              </div>
              <section className="space-y-3 rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">Refund audit</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Only provider-confirmed refunds count as refunded amounts.
                    </p>
                  </div>
                  <Badge variant="outline">
                    {selected.refunds.length} recorded
                  </Badge>
                </div>
                {selected.refunds.length ? (
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
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No refund records are linked to this payment.
                  </p>
                )}
              </section>
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                <div>
                  <h3 className="text-sm font-semibold">Receipt</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selected.status === "paid"
                      ? selected.receipt
                        ? `${selected.receipt.receipt_number} · issued ${dateOnly.format(new Date(selected.receipt.issued_at))}`
                        : "A receipt can be opened after payment confirmation."
                      : "A receipt is available after payment is confirmed."}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    WorkSync system-generated transaction receipt; not a BIR
                    official invoice or receipt.
                  </p>
                </div>
                {selected.status === "paid" && (
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
