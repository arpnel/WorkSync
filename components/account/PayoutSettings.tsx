"use client";
import { StyledSelect } from "@/components/ui/styled-select";
import { openSavedTaxReceipt } from "@/lib/payments/receiptClient";

import { useEffect, useState } from "react";
import { Wallet, ShieldCheck, Loader2, Clock3, CircleCheck, BadgeAlert, type LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
type Earnings = {
  eligible?: boolean;
  available?: boolean;
  settlementEnabled?: boolean;
  mode?: string;
  summary?: { earned: number; ready: number; processing: number; paid: number; awaitingAccount: number; supportReview: number; withholding?: number };
  payouts?: { id: string; transactionId: string; projectId: string; amount: number; grossAmount: number; transferReference: string | null; freelancerVatTaxableAmount: number; freelancerVatAmount: number; freelancerVatRate: number; freelancerVatRule: string; withholdingRule: string; withholdingDate: string | null; withholdingBasis: number; withholdingRate: number; withholdingAmount: number; withholdingExemptionStatus: string; withholdingDeclarationId: string | null; withholdingDocumentId: string | null; freelancerVatDocumentId: string | null; status: string; createdAt: string; paidAt: string | null }[];
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
const payoutDate = (value: string) => new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium", timeZone: "Asia/Manila",
}).format(new Date(value));
export default function PayoutSettings() {
  const [data, setData] = useState<{
    eligible: boolean;
    mode?: string;
    account?: { bank_label: string; account_last4: string } | null;
  } | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [earningsError, setEarningsError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [repeat, setRepeat] = useState("");
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
  if (data?.eligible === false)
    return (
      <p className="text-sm text-muted-foreground">
        Payout accounts are available for freelancers.
      </p>
    );
  return (
    <section className="space-y-5 rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-3 text-primary">
          <Wallet className="size-5" />
        </div>
        <div>
          <h3 className="font-semibold">Where you get paid</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your bank or e-wallet account for approved project payments.
          </p>
        </div>
      </div>
      {data?.eligible && (
        <div className="space-y-4 rounded-xl border bg-muted/20 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="font-semibold">Your earnings</h4>
              <p className="mt-1 text-sm text-muted-foreground">Approved project earnings and their payout progress.</p>
            </div>
          </div>
          {earningsError ? (
            <p role="alert" className="text-sm text-destructive">{earningsError}</p>
          ) : earnings?.available === false ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Earnings will appear here when payout tracking is enabled for this workspace.</p>
          ) : earnings?.summary ? (
            <>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => {
                  const rows = earnings.payouts ?? [];
                  const columns = ["Transaction ID", "Payout ID", "Project ID", "Transfer reference", "Gross earnings PHP", "Freelancer VAT base PHP", "Freelancer VAT PHP", "Withholding basis PHP", "Withholding rate", "Withholding PHP", "Net transfer amount PHP", "Withholding date", "Withholding rule", "Exemption status", "Withholding declaration ID", "Withholding document ID", "VAT document ID", "Freelancer VAT rule", "Status", "Created", "Paid status confirmed"];
                  const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
                  const csv = [columns, ...rows.map((row) => [row.transactionId, row.id, row.projectId, row.transferReference, row.grossAmount, row.freelancerVatTaxableAmount, row.freelancerVatAmount, row.withholdingBasis, `${(row.withholdingRate * 100).toFixed(2)}%`, row.withholdingAmount, row.amount, row.withholdingDate, row.withholdingRule, row.withholdingExemptionStatus, row.withholdingDeclarationId, row.withholdingDocumentId, row.freelancerVatDocumentId, row.freelancerVatRule, row.status, row.createdAt, row.paidAt])].map((line) => line.map(csvCell).join(",")).join("\r\n");
                  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "worksync-earnings-report.csv";
                  link.click();
                  URL.revokeObjectURL(url);
                }} disabled={!earnings.payouts?.length}>Download earnings CSV</Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {([
                  ["Gross earnings", earnings.summary.earned, Wallet],
                  ["Ready for payout", earnings.summary.ready, Wallet],
                  ["Processing", earnings.summary.processing, Clock3],
                  ["Paid out", earnings.summary.paid, CircleCheck],
                  ["Withholding recorded", earnings.summary.withholding ?? 0, BadgeAlert],
                ] as [string, number, LucideIcon][]).map(([label, amount, Icon]) => (
                  <div key={label} className="rounded-lg border bg-card p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="size-4" />{label}</div>
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
              <p className="text-xs text-muted-foreground">{earnings.settlementEnabled ? "Ready payouts are sent automatically after project approval and payment checks. Keep your payout account up to date; you do not need to submit a separate withdrawal request." : "Payout tracking is currently in setup mode. Transfers will not be sent until the platform has completed its PayMongo and Supabase checks."}</p>
              {earnings.payouts && earnings.payouts.length > 0 && (
                <div className="space-y-2 border-t pt-4">
                  <h5 className="text-sm font-medium">Recent payout activity</h5>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {earnings.payouts.slice(0, 5).map((payout) => (
                      <article key={payout.id} className="min-w-0 space-y-3 rounded-lg border bg-card p-3 sm:p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{payout.status === "paid" && payout.paidAt ? `Paid ${payoutDate(payout.paidAt)}` : `Created ${payoutDate(payout.createdAt)}`}</p>
                            <p className="mt-1 text-xs capitalize text-muted-foreground">{payout.status.replaceAll("_", " ")}</p>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => void openSavedTaxReceipt(payout.transactionId).catch((cause) => setError(cause instanceof Error ? cause.message : "Receipt unavailable."))}>View receipt</Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/30 p-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Gross earnings</p>
                            <p className="mt-1 font-medium tabular-nums">{php(payout.grossAmount)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Net transfer</p>
                            <p className="mt-1 font-medium tabular-nums">{php(payout.amount)}</p>
                          </div>
                        </div>
                        {payout.transferReference && <p className="break-all text-xs text-muted-foreground">Transfer reference: {payout.transferReference}</p>}
                        {(payout.freelancerVatAmount > 0 || payout.withholdingAmount > 0) && (
                          <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
                            {payout.freelancerVatAmount > 0 && <p>VAT recorded: {php(payout.freelancerVatAmount)} at {(payout.freelancerVatRate * 100).toFixed(2)}% of {php(payout.freelancerVatTaxableAmount)}.</p>}
                            {payout.withholdingAmount > 0 && <p>Withholding: {php(payout.withholdingAmount)} at {(payout.withholdingRate * 100).toFixed(2)}% of {php(payout.withholdingBasis)}.</p>}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">Loading earnings...</p>
          )}
        </div>
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
        <p role="status" className="text-sm text-muted-foreground">
          Loading payout account...</p>
      )}
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
      {data?.account && !editing ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <div>
            <p className="font-medium">{data.account.bank_label}</p>
            <p className="text-sm text-muted-foreground">
              Account ending in {data.account.account_last4}
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
              if (form.number.trim() !== repeat.trim())
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
                    maxLength={key === "number" ? 34 : key === "bic" ? 11 : 120}
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
      <p className="flex items-start gap-2 border-t pt-4 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0" />
        Account numbers are encrypted and only the final four digits are
        displayed after saving.
      </p>
    </section>
  );
}
