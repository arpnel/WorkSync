"use client";
import { useEffect, useState } from "react";
import { Wallet, ShieldCheck, Loader2 } from "lucide-react";
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
export default function PayoutSettings() {
  const [data, setData] = useState<{
    eligible: boolean;
    mode?: string;
    account?: { bank_label: string; account_last4: string } | null;
  } | null>(null);
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
    void payoutAccountRequest()
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
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
      {data?.mode === "test" && (
        <p className="rounded-lg bg-muted p-3 text-sm">
          Test mode: use PayMongo test recipient details. This account is
          separate from your live payout account.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!data && !error && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading payout account�
        </p>
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
                await payoutAccountRequest(form);
                setData(await payoutAccountRequest());
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
                setNotice(
                  "Payout account saved. Transfers already queued keep their original destination.",
                );
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
                  ["name", "Account holder�s full name"],
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
                <select
                  id="payout-provider"
                  className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                  value={form.provider}
                  onChange={(e) =>
                    setForm({ ...form, provider: e.target.value })
                  }
                >
                  <option value="instapay">InstaPay � up to PHP 50,000</option>
                  <option value="pesonet">PESONet � larger payments</option>
                </select>
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
                  onClick={() => setEditing(false)}
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
