"use client";
import { StyledSelect } from "@/components/ui/styled-select";
import Link from "next/link";
import { openSavedTaxReceipt } from "@/lib/payments/receiptClient";
import { openWithdrawalReceipt } from "@/lib/payments/withdrawalReceiptPdf";
import { filterPayoutHistory, paginatePayoutHistory, payoutStatusGroup, payoutStatusLabel } from "@/lib/payments/payoutHistory";
import { buildPayoutCsv, payoutCsvFilename, type PayoutCsvFormat } from "@/lib/payments/payoutCsv";

import { useEffect, useRef, useState } from "react";
import { Wallet, ShieldCheck, Loader2, Clock3, CircleCheck, BadgeAlert, Search, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

async function payoutAccountRequest(body?: unknown) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in to manage payouts.");
  const response = await fetch("/api/payout-account", {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Payout account unavailable.");
  return data;
}
const normalizeAccountNumber = (value: string) => value.replace(/[\s-]/g, "");
async function requestPayoutWithdrawal(grossAmount: number) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in to request withdrawal.");
  const response = await fetch("/api/payouts", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grossAmount }),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Withdrawal request could not be saved.");
  return result;
}
async function completeDemoPayout(withdrawalId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in to complete the demo payout.");
  const response = await fetch("/api/payouts/demo-complete", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ withdrawalId }),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Demo payout could not be completed.");
  return result;
}
type Earnings = {
  eligible?: boolean;
  available?: boolean;
  settlementEnabled?: boolean;
  mode?: string;
  withdrawalQuote?: { availableGross: number; availableNet: number; withholdingRate: number; withholdingAmount: number; exemptionStatus: string };
  summary?: { earned: number; ready: number; processing: number; paid: number; awaitingAccount: number; supportReview: number; withholding?: number };
  withdrawals?: { id: string; requestedNetAmount: number; grossAmount: number; withholdingAmount: number; withholdingRate: number; exemptionStatus: string; status: string; requestedAt: string; paidAt: string | null }[];
  payouts?: { id: string; transactionId: string; projectId: string; projectTitle: string; amount: number; grossAmount: number; transferReference: string | null; demoTransfer?: boolean; freelancerVatTaxableAmount: number; freelancerVatAmount: number; freelancerVatRate: number; freelancerVatRule: string; withholdingRule: string; withholdingDate: string | null; withholdingBasis: number; withholdingRate: number; withholdingAmount: number; withholdingExemptionStatus: string; withholdingDeclarationId: string | null; withholdingDocumentId: string | null; freelancerVatDocumentId: string | null; withdrawalRequestedAt: string | null; status: string; createdAt: string; paidAt: string | null }[];
};
async function payoutEarningsRequest(): Promise<Earnings> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in to view earnings.");
  const response = await fetch("/api/payouts", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Earnings are unavailable.");
  return data;
}
const php = (amount: number) => new Intl.NumberFormat("en-PH", {
  style: "currency", currency: "PHP", maximumFractionDigits: 2,
}).format(amount);
function calculateWithdrawalPreview(rawAmount: string, rate: number) {
  const grossAmount = Number(rawAmount);
  if (!Number.isFinite(grossAmount) || grossAmount <= 0 ||
    Math.abs(grossAmount * 100 - Math.round(grossAmount * 100)) > 1e-8 || rate < 0 || rate >= 1) return null;
  const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const withholdingAmount = roundMoney(grossAmount * rate);
  const netAmount = roundMoney(grossAmount - withholdingAmount);
  return { grossAmount, withholdingAmount, netAmount };
}
const payoutDate = (value: string) => new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium", timeZone: "Asia/Manila",
}).format(new Date(value));
const statusStyle = (status: string) => {
  const group = payoutStatusGroup(status);
  if (group === "paid") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600";
  if (group === "ready") return "border-blue-500/30 bg-blue-500/10 text-blue-600";
  if (group === "processing") return "border-amber-500/30 bg-amber-500/10 text-amber-700";
  if (group === "failed" || group === "needs_review") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-muted-foreground/25 bg-muted text-muted-foreground";
};

function PayoutLoadingSkeleton() {
  return (
    <section aria-label="Loading payouts" aria-busy="true" role="status" className="space-y-7">
      <span className="sr-only">Loading payout information...</span>
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-3 rounded-xl border bg-card p-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-7 w-28" />
            </div>
          ))}
        </div>
      </div>
      <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full max-w-2xl" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
          <div className="space-y-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-11 w-full rounded-lg" />
            <Skeleton className="h-4 w-60 max-w-full" />
            <Skeleton className="h-10 w-28 rounded-md" />
          </div>
          <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      </section>
      <section className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row">
            <Skeleton className="h-10 flex-1 rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg sm:w-48" />
          </div>
          <div className="space-y-4 p-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="grid grid-cols-2 gap-4 border-b pb-4 last:border-0 md:grid-cols-6">
                <Skeleton className="h-4 w-full md:col-span-1" />
                <Skeleton className="h-4 w-full md:col-span-1" />
                <Skeleton className="hidden h-4 w-full md:block" />
                <Skeleton className="hidden h-4 w-full md:block" />
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="hidden h-9 w-24 justify-self-end rounded-md md:block" />
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56 max-w-full" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
      </section>
    </section>
  );
}

export default function PayoutSettings() {
  const [data, setData] = useState<{
    eligible: boolean;
    mode?: string;
    account?: { bank_label: string; account_last4: string; provider?: "instapay" | "pesonet" | null } | null;
  } | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [earningsError, setEarningsError] = useState("");
  const [error, setError] = useState("");
  const [withdrawalError, setWithdrawalError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestingWithdrawal, setRequestingWithdrawal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [repeat, setRepeat] = useState("");
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [page, setPage] = useState(0);
  const [withdrawalSearch, setWithdrawalSearch] = useState("");
  const [withdrawalSortOrder, setWithdrawalSortOrder] = useState<"newest" | "oldest">("newest");
  const [withdrawalPage, setWithdrawalPage] = useState(0);
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const completingDemoPayouts = useRef(new Set<string>());
  const [form, setForm] = useState({
    bankLabel: "",
    name: "",
    number: "",
    bic: "",
    provider: "instapay",
  });
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const account = await payoutAccountRequest();
        if (active) setData(account);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Payout account unavailable.");
      }
      try {
        const value = await payoutEarningsRequest();
        if (active) setEarnings(value);
      } catch (e) {
        if (active) setEarningsError(e instanceof Error ? e.message : "Earnings are unavailable.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const withdrawal = earnings?.withdrawals?.find(
      (row) => row.status === "processing",
    );
    if (!withdrawal || completingDemoPayouts.current.has(withdrawal.id)) return;
    completingDemoPayouts.current.add(withdrawal.id);
    let completionStarted = false;
    const timer = window.setTimeout(() => {
      completionStarted = true;
      void completeDemoPayout(withdrawal.id)
        .then(() => payoutEarningsRequest())
        .then((value) => {
          setEarnings(value);
          setNotice("");
        })
        .catch((cause) => {
          completingDemoPayouts.current.delete(withdrawal.id);
          setError(cause instanceof Error ? cause.message : "Demo payout could not be completed.");
        });
    }, 1800);
    return () => {
      window.clearTimeout(timer);
      if (!completionStarted) completingDemoPayouts.current.delete(withdrawal.id);
    };
  }, [earnings?.withdrawals]);
  const payoutRows = earnings?.payouts ?? [];
  const matchingPayouts = filterPayoutHistory(payoutRows, { search, sortOrder });
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(matchingPayouts.length / pageSize));
  const visiblePayouts = paginatePayoutHistory(matchingPayouts, page, pageSize);
  const withdrawalRows = earnings?.withdrawals ?? [];
  const matchingWithdrawals = withdrawalRows
    .filter((withdrawal) =>
      withdrawal.id.toLowerCase().includes(withdrawalSearch.trim().toLowerCase()),
    )
    .sort((first, second) => {
      const dateDifference = Date.parse(first.requestedAt) - Date.parse(second.requestedAt);
      return withdrawalSortOrder === "newest" ? -dateDifference : dateDifference;
    });
  const withdrawalPageSize = 10;
  const withdrawalPageCount = Math.max(1, Math.ceil(matchingWithdrawals.length / withdrawalPageSize));
  const visibleWithdrawals = matchingWithdrawals.slice(
    withdrawalPage * withdrawalPageSize,
    (withdrawalPage + 1) * withdrawalPageSize,
  );
  const withdrawalQuote = earnings?.withdrawalQuote;
  const withdrawalPreview = calculateWithdrawalPreview(
    withdrawalAmount,
    withdrawalQuote?.withholdingRate ?? 0,
  );
  const amountExceedsAvailable = Boolean(
    withdrawalPreview && withdrawalQuote &&
    withdrawalPreview.grossAmount > withdrawalQuote.availableGross,
  );
  const withdrawalCanSubmit = Boolean(
    withdrawalPreview && withdrawalQuote &&
    !amountExceedsAvailable && !requestingWithdrawal,
  );
  const requestWithdrawal = async (amount: number) => {
    setWithdrawalError("");
    setNotice("");
    setRequestingWithdrawal(true);
    try {
      await requestPayoutWithdrawal(amount);
      setEarnings(await payoutEarningsRequest());
      setWithdrawalAmount("");
      setNotice("Withdrawal requested. The net amount is processing; this demo does not send money through PayMongo.");
    } catch (cause) {
      setWithdrawalError(cause instanceof Error ? cause.message : "Withdrawal request could not be saved.");
    } finally {
      setRequestingWithdrawal(false);
    }
  };
  const withdrawalErrorText = withdrawalError.toLowerCase();
  const withdrawalFollowUp = /payout account/.test(withdrawalErrorText)
    ? { href: "#payout-account-heading", label: "Review payout account" }
    : /seller document|bir form 2303|canonical.*cor|check that your payout account/.test(withdrawalErrorText)
      ? { href: "/home/settings#seller-verification", label: "Review documents" }
      : null;
  const downloadCsv = (format: PayoutCsvFormat) => {
    const rows = earnings?.payouts ?? [];
    if (!rows.length) return;
    const csv = buildPayoutCsv(rows, format);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = payoutCsvFilename(format);
    link.click();
    URL.revokeObjectURL(url);
  };
  if (data?.eligible === false)
    return (
      <p className="text-sm text-muted-foreground">
        Payout accounts are available for freelancers.
      </p>
    );
  if (!data && !error) return <PayoutLoadingSkeleton />;
  return (
    <section className="space-y-7">
      {data?.eligible && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Earnings overview</h3>
              <p className="mt-1 text-sm text-muted-foreground">Approved project earnings and their payout progress.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={!earnings?.payouts?.length} onClick={() => downloadCsv("payout-tax-records")}>Detailed Payout &amp; Tax CSV</Button>
            </div>
          </div>
          {earningsError ? (
            <p role="alert" className="text-sm text-destructive">{earningsError}</p>
          ) : earnings?.available === false ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Earnings will appear here when payout tracking is enabled for this workspace.</p>
          ) : earnings?.summary ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {([
                  ["Gross earnings", earnings.summary.earned, Wallet],
                  ["Ready for payout", earnings.summary.ready, Wallet],
                  ["Processing", earnings.summary.processing, Clock3],
                  ["Paid out", earnings.summary.paid, CircleCheck],
                ] as [string, number, LucideIcon][]).map(([label, amount, Icon]) => (
                  <div key={label} className="rounded-xl border bg-card p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="size-4 shrink-0" />{label}</div>
                    <p className="mt-2 text-xl font-semibold tabular-nums">{php(amount)}</p>
                  </div>
                ))}
              </div>
              {earnings.summary.awaitingAccount > 0 && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                  <BadgeAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <span>{php(earnings.summary.awaitingAccount)} {data?.account ? "is still awaiting payout reconciliation. Your account is saved; contact support if this does not update." : "is waiting for a payout account."}</span>
                </p>
              )}
              {earnings.summary.supportReview > 0 && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                  <BadgeAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <span>{php(earnings.summary.supportReview)} needs support review because its transfer failed or requires review.</span>
                </p>
              )}
            </>
          ) : (
            <div aria-hidden="true" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => <div key={index} className="space-y-3 rounded-xl border bg-card p-4"><Skeleton className="h-4 w-32" /><Skeleton className="h-7 w-28" /></div>)}
            </div>
          )}
        </div>
      )}
      {data?.eligible && !earnings && !earningsError && (
        <div aria-hidden="true" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full max-w-2xl" />
          <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-3"><Skeleton className="h-4 w-48" /><Skeleton className="h-11 w-full rounded-lg" /><Skeleton className="h-10 w-28 rounded-md" /></div><div className="space-y-3 rounded-lg border p-4"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div></div>
        </div>
      )}
      {data?.eligible && !earnings && !earningsError && (
        <section aria-hidden="true" className="space-y-4">
          <Skeleton className="h-6 w-56" />
          <div className="overflow-hidden rounded-xl border bg-card p-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row"><Skeleton className="h-10 flex-1 rounded-lg" /><Skeleton className="h-10 w-full rounded-lg sm:w-48" /></div>
            <div className="space-y-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="grid grid-cols-2 gap-4 border-b pb-4 last:border-0 md:grid-cols-6">{Array.from({ length: 6 }, (_, cell) => <Skeleton key={cell} className={`${cell > 1 && cell < 4 ? "hidden md:block" : "block"} h-4 w-full`} />)}</div>)}</div>
          </div>
        </section>
      )}
      {data?.eligible && earnings?.available !== false && earnings?.summary && (
        <section aria-labelledby="withdraw-earnings-heading" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
          <div>
            <h3 id="withdraw-earnings-heading" className="text-lg font-semibold">Withdraw earnings</h3>
            <p className="mt-1 text-sm text-muted-foreground">Enter an amount from your ready earnings, then review the withholding and estimated net withdrawal.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (withdrawalCanSubmit && withdrawalPreview)
                  void requestWithdrawal(withdrawalPreview.grossAmount);
              }}
            >
              <Label htmlFor="withdraw-gross-amount">Gross amount to withdraw (PHP)</Label>
              <Input
                id="withdraw-gross-amount"
                type="text"
                pattern="[0-9]*\.?[0-9]{0,2}"
                maxLength={14}
                inputMode="decimal"
                value={withdrawalAmount}
                onChange={(event) => {
                  const rawValue = event.target.value.replace(/[^0-9.]/g, "");
                  const decimalIndex = rawValue.indexOf(".");
                  const value = decimalIndex < 0
                    ? rawValue
                    : `${rawValue.slice(0, decimalIndex)}.${rawValue.slice(decimalIndex + 1).replace(/\./g, "").slice(0, 2)}`;
                  const maxGross = withdrawalQuote?.availableGross;
                  const numericValue = Number(value);
                  setWithdrawalAmount(
                    value && maxGross != null && Number.isFinite(numericValue) && numericValue > maxGross
                      ? maxGross.toFixed(2)
                      : value,
                  );
                }}
                placeholder="0.00"
                disabled={!withdrawalQuote || withdrawalQuote.availableGross <= 0 || requestingWithdrawal}
                aria-describedby="withdraw-amount-help withdraw-preview"
              />
              <p id="withdraw-amount-help" className="text-xs text-muted-foreground">
                Ready balance available to withdraw: {withdrawalQuote ? php(withdrawalQuote.availableGross) : "Loading..."}
              </p>
              {amountExceedsAvailable && withdrawalPreview && withdrawalQuote && (
                <p role="alert" className="text-sm text-destructive">
                  You can withdraw up to {php(withdrawalQuote.availableGross)} gross. After {php(withdrawalPreview.withholdingAmount)} withholding, the net withdrawal is {php(withdrawalPreview.netAmount)}.
                </p>
              )}
              {withdrawalAmount && !withdrawalPreview && (
                <p role="alert" className="text-sm text-destructive">Enter a valid amount greater than PHP 0.00.</p>
              )}
              <Button type="submit" disabled={!withdrawalCanSubmit}>
                {requestingWithdrawal ? <><Loader2 className="mr-2 size-4 animate-spin" />Requesting</> : "Withdraw"}
              </Button>
            </form>
            <div id="withdraw-preview" className="space-y-2 rounded-lg border bg-muted/30 p-4" aria-live="polite">
              <p className="font-medium">Withdrawal estimate</p>
              <div className="flex justify-between gap-4 text-sm"><span className="text-muted-foreground">Gross earnings used</span><span className="tabular-nums">{withdrawalPreview ? php(withdrawalPreview.grossAmount) : php(0)}</span></div>
              <div className="flex justify-between gap-4 text-sm"><span className="text-muted-foreground">Withholding ({((withdrawalQuote?.withholdingRate ?? 0) * 100).toFixed(2)}%)</span><span className="tabular-nums">&minus;{withdrawalPreview ? php(withdrawalPreview.withholdingAmount) : php(0)}</span></div>
              <div className="flex justify-between gap-4 border-t pt-2 text-sm font-semibold"><span>Net withdrawal</span><span className="tabular-nums">{withdrawalPreview ? php(withdrawalPreview.netAmount) : php(0)}</span></div>
              <p className="text-xs text-muted-foreground">
                {withdrawalQuote?.exemptionStatus === "sworn_declaration_verified"
                  ? "Withholding is waived under your verified declaration."
                  : "Estimate uses the app's current 0.5% setting; the server rechecks your verified tax declaration when you submit."}
              </p>
            </div>
          </div>
          {withdrawalError && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm text-destructive">{withdrawalError}</p>
              </div>
              {withdrawalFollowUp && (
                <Button asChild variant="outline" size="sm" className="shrink-0">
                  <Link href={withdrawalFollowUp.href}>{withdrawalFollowUp.label}</Link>
                </Button>
              )}
            </div>
          )}
        </section>
      )}
      {data?.eligible && earnings?.available !== false && earnings?.summary && (
        <section aria-labelledby="withdrawal-history-heading" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 id="withdrawal-history-heading" className="text-lg font-semibold">Withdrawal history</h3>
              <p className="mt-1 text-sm text-muted-foreground">Review withdrawal amounts, withholding, and status.</p>
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {matchingWithdrawals.length} {matchingWithdrawals.length === 1 ? "withdrawal" : "withdrawals"}
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-col gap-3 border-b bg-card p-4 sm:flex-row sm:items-end">
              <div className="relative min-w-0 flex-1">
                <Label htmlFor="withdrawal-search">Search withdrawal ID</Label>
                <Search className="pointer-events-none absolute left-3 top-9 size-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="withdrawal-search"
                  className="mt-1 pl-9"
                  value={withdrawalSearch}
                  placeholder="Withdrawal ID"
                  onChange={(event) => {
                    setWithdrawalSearch(event.target.value);
                    setWithdrawalPage(0);
                  }}
                />
              </div>
              <div className="w-full shrink-0 sm:w-48">
                <Label htmlFor="withdrawal-sort">Sort</Label>
                <StyledSelect
                  id="withdrawal-sort"
                  className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm"
                  value={withdrawalSortOrder}
                  onChange={(event) => {
                    setWithdrawalSortOrder(event.target.value as "newest" | "oldest");
                    setWithdrawalPage(0);
                  }}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </StyledSelect>
              </div>
            </div>
            {matchingWithdrawals.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="font-medium">
                  {withdrawalSearch.trim() ? "No withdrawals match your search" : "No withdrawals yet"}
                </p>
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-4 py-3 font-medium">Gross amount</th>
                        <th className="px-4 py-3 font-medium">Withholding</th>
                        <th className="px-4 py-3 font-medium">Net amount</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {visibleWithdrawals.map((withdrawal) => (
                        <tr key={withdrawal.id} className="bg-card">
                          <td className="px-4 py-3">
                            <p>{payoutDate(withdrawal.requestedAt)}</p>
                            <p className="mt-1 max-w-52 truncate text-xs text-muted-foreground" title={withdrawal.id}>Withdrawal {withdrawal.id}</p>
                          </td>
                          <td className="px-4 py-3 font-medium tabular-nums">{php(withdrawal.grossAmount)}</td>
                          <td className="px-4 py-3 font-medium tabular-nums">{php(withdrawal.withholdingAmount)}</td>
                          <td className="px-4 py-3 font-medium tabular-nums">{php(withdrawal.requestedNetAmount)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyle(withdrawal.status)}`}>
                              {payoutStatusLabel(withdrawal.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end">
                              <Button variant="outline" size="sm" onClick={() => openWithdrawalReceipt(withdrawal)}>
                                View receipt
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-3 p-4 md:hidden">
                  {visibleWithdrawals.map((withdrawal) => (
                    <article key={withdrawal.id} className="space-y-3 rounded-xl border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{payoutDate(withdrawal.requestedAt)}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground" title={withdrawal.id}>Withdrawal {withdrawal.id}</p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyle(withdrawal.status)}`}>
                          {payoutStatusLabel(withdrawal.status)}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 border-t pt-3">
                        <div><p className="text-xs text-muted-foreground">Gross</p><p className="mt-1 font-medium tabular-nums">{php(withdrawal.grossAmount)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Withholding</p><p className="mt-1 font-medium tabular-nums">{php(withdrawal.withholdingAmount)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Net</p><p className="mt-1 font-medium tabular-nums">{php(withdrawal.requestedNetAmount)}</p></div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => openWithdrawalReceipt(withdrawal)}>
                        View receipt
                      </Button>
                    </article>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
                  <p className="text-muted-foreground">
                    Showing {visibleWithdrawals.length} of {matchingWithdrawals.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={withdrawalPage === 0} onClick={() => setWithdrawalPage((value) => Math.max(0, value - 1))}>
                      <ChevronLeft className="mr-1 size-4" />Previous
                    </Button>
                    <span className="tabular-nums text-muted-foreground">Page {withdrawalPage + 1} of {withdrawalPageCount}</span>
                    <Button variant="outline" size="sm" disabled={withdrawalPage + 1 >= withdrawalPageCount} onClick={() => setWithdrawalPage((value) => Math.min(withdrawalPageCount - 1, value + 1))}>
                      Next<ChevronRight className="ml-1 size-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      )}
      {data?.eligible && earnings?.available !== false && earnings?.summary && (
        <section aria-labelledby="payout-history-heading" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 id="payout-history-heading" className="text-lg font-semibold">Payout transaction history</h3>
              <p className="mt-1 text-sm text-muted-foreground">Project earnings by completed project.</p>
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">{matchingPayouts.length} {matchingPayouts.length === 1 ? "transaction" : "transactions"}</p>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-col gap-3 border-b bg-card p-4 sm:flex-row sm:items-end">
            <div className="relative min-w-0 flex-1">
              <Label htmlFor="payout-search">Search reference</Label>
              <Search className="pointer-events-none absolute left-3 top-9 size-4 text-muted-foreground" aria-hidden="true" />
              <Input id="payout-search" className="mt-1 pl-9" value={search} placeholder="Payout or transfer ID" onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
            </div>
            <div className="w-full shrink-0 sm:w-48">
              <Label htmlFor="payout-sort">Sort</Label>
              <StyledSelect id="payout-sort" className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm" value={sortOrder} onChange={(event) => { setSortOrder(event.target.value as "newest" | "oldest"); setPage(0); }}>
                <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
              </StyledSelect>
            </div>
          </div>
          {matchingPayouts.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="font-medium">{search.trim() ? "No transactions match your search" : "No payout transactions yet"}</p>
              {search.trim() && <p className="mt-1 text-sm text-muted-foreground">Try a different payout, transaction, or transfer reference.</p>}
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Date created</th><th className="px-4 py-3 font-medium">Project</th><th className="px-4 py-3 font-medium">Gross earnings</th><th className="px-4 py-3 font-medium">Net earnings</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Actions</th></tr></thead>
                  <tbody className="divide-y">
                    {visiblePayouts.map((payout) => <tr key={payout.id} className="bg-card">
                      <td className="px-4 py-3"><p>{payoutDate(payout.createdAt)}</p><p className="mt-1 max-w-44 truncate text-xs text-muted-foreground" title={payout.transferReference ?? payout.id}>{payout.transferReference ? `Ref ${payout.transferReference}` : `Payout ${payout.id}`}</p></td>
                      <td className="px-4 py-3 font-medium">{payout.projectTitle}</td>
                      <td className="px-4 py-3 font-medium tabular-nums">{php(payout.grossAmount)}</td>
                      <td className="px-4 py-3 font-medium tabular-nums">{php(payout.amount)}{payout.withholdingAmount > 0 && <p className="mt-1 text-xs font-normal text-muted-foreground">Withholding: {php(payout.withholdingAmount)}</p>}</td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyle(payout.status)}`}>{payoutStatusLabel(payout.status)}</span></td>
                      <td className="px-4 py-3"><div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => void openSavedTaxReceipt(payout.transactionId).catch((cause) => setError(cause instanceof Error ? cause.message : "Client receipt unavailable."))}>View receipt</Button></div></td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 p-4 md:hidden">
                {visiblePayouts.map((payout) => <article key={payout.id} className="space-y-3 rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{payout.projectTitle}</p><p className="mt-1 text-xs text-muted-foreground">{payoutDate(payout.createdAt)}</p><p className="mt-1 max-w-52 truncate text-xs text-muted-foreground" title={payout.transferReference ?? payout.id}>{payout.transferReference ? `Ref ${payout.transferReference}` : `Payout ${payout.id}`}</p></div><span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyle(payout.status)}`}>{payoutStatusLabel(payout.status)}</span></div>
                  <div className="grid grid-cols-2 gap-3 border-t pt-3"><div><p className="text-xs text-muted-foreground">Gross earnings</p><p className="mt-1 font-medium tabular-nums">{php(payout.grossAmount)}</p></div><div><p className="text-xs text-muted-foreground">Net earnings</p><p className="mt-1 font-medium tabular-nums">{php(payout.amount)}</p>{payout.withholdingAmount > 0 && <p className="mt-1 text-xs text-muted-foreground">Withholding: {php(payout.withholdingAmount)}</p>}</div></div>
                  <Button variant="outline" size="sm" onClick={() => void openSavedTaxReceipt(payout.transactionId).catch((cause) => setError(cause instanceof Error ? cause.message : "Client receipt unavailable."))}>View receipt</Button>
                </article>)}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
                <p className="text-muted-foreground">Showing {visiblePayouts.length} of {matchingPayouts.length}</p>
                <div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft className="mr-1 size-4" />Previous</Button><span className="tabular-nums text-muted-foreground">Page {page + 1} of {pageCount}</span><Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next<ChevronRight className="ml-1 size-4" /></Button></div>
              </div>
            </>
          )}
          </div>
        </section>
      )}
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => {
            setError("");
            void payoutAccountRequest().then(setData).catch((cause) => setError(cause instanceof Error ? cause.message : "Payout account unavailable."));
          }}>Retry</Button>
        </div>
      )}
      {!data && !error && (
        <Skeleton aria-hidden="true" className="h-32 w-full rounded-xl" />
      )}
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
      <section aria-labelledby="payout-account-heading" className="space-y-3">
        <div>
          <h3 id="payout-account-heading" className="text-lg font-semibold">Payout account</h3>
          <p className="mt-1 text-sm text-muted-foreground">Manage the account details saved to your payout profile.</p>
        </div>
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          {data?.account && !editing ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{data.account.bank_label}</p>
                <p className="text-sm text-muted-foreground">
                  Bank or e-wallet; account ending in {data.account.account_last4}
                  {data.account.provider && `; ${data.account.provider === "pesonet" ? "PESONet" : "InstaPay"}`}
                </p>
              </div>
              <Button variant="outline" onClick={() => setEditing(true)}>
                Change account
              </Button>
            </div>
          ) : (
            data && (
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setError("");
              setNotice("");
              if (
                normalizeAccountNumber(form.number) !==
                normalizeAccountNumber(repeat)
              )
                return setError("Account numbers do not match.");
              if (!confirmed)
                return setError(
                  "Confirm that this is your account before saving.",
                );
              setBusy(true);
              try {
                const saved = await payoutAccountRequest(form);
                setData(await payoutAccountRequest());
                setEarnings(await payoutEarningsRequest());
                setEditing(false);
                setForm({
                  bankLabel: "",
                  name: "",
                  number: "",
                  bic: "",
                  provider: "instapay",
                });
                setRepeat("");
                setConfirmed(false);
                setNotice(saved.reconciliation === "pending"
                  ? "Payout account saved. Some waiting payouts could not be refreshed; contact support if they remain unchanged."
                  : "Payout account saved. Waiting payouts were refreshed.");
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Unable to save payout account.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["bankLabel", "Bank or e-wallet name"],
                  ["name", "Account holder's full name"],
                  ["number", "Account number"],
                  ["bic", "Bank BIC / SWIFT code"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`payout-${key}`}>{label}</Label>
                  <Input
                    id={`payout-${key}`}
                    required
                    autoComplete="off"
                    maxLength={key === "number" ? 40 : key === "bic" ? 14 : 120}
                    inputMode={key === "number" ? "numeric" : undefined}
                    value={form[key]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                  />
                </div>
              ))}
              <div className="space-y-2">
                <Label htmlFor="payout-repeat">Confirm account number</Label>
                <Input
                  id="payout-repeat"
                  required
                  autoComplete="off"
                  inputMode="numeric"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payout-provider">Transfer network</Label>
                <StyledSelect
                  id="payout-provider"
                  className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                  value={form.provider}
                  onChange={(e) =>
                    setForm({ ...form, provider: e.target.value })
                  }
                >
                  <option value="instapay">InstaPay - up to PHP 50,000</option>
                  <option value="pesonet">PESONet - larger payments</option>
                </StyledSelect>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Use the BIC and network supported by your receiving bank.
                Account details are saved securely; saving does not verify
                account ownership with your bank.
              </p>
              <label className="flex items-start gap-2 text-sm sm:col-span-2">
                <input
                  className="mt-1 accent-primary"
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  required
                />
                <span>
                  I confirm this is my account and the details are correct.
                </span>
              </label>
            </fieldset>
            <div className="flex justify-end gap-2">
              {data.account && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    setForm({ bankLabel: "", name: "", number: "", bic: "", provider: "instapay" });
                    setRepeat("");
                    setConfirmed(false);
                    setError("");
                  }}
                >
                  Cancel
                </Button>
              )}
              <Button disabled={busy || !confirmed}>
                {busy && <Loader2 className="size-4 animate-spin" />}Save payout
                account
              </Button>
            </div>
          </form>
            )
          )}
        </div>
      </section>
      <p className="flex items-start gap-2 border-t pt-4 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0" />
        Account numbers are encrypted and only the final four digits are
        displayed after saving.
      </p>
    </section>
  );
}
