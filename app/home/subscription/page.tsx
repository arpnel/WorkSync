"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Crown,
  LoaderCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { WorkspacePageHeader } from "@/components/shared/WorkspacePageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { calculateVat } from "@/lib/payments/philippineTax";

type Plan = {
  plan_code: string;
  display_name: string;
  active_listing_limit: number;
  provisional_monthly_price: number | null;
  provisional_annual_price: number | null;
};
type Assignment = {
  plan_code: string;
  period_ends_at: string;
  access_type: "free" | "trial" | "paid";
  trial_claimed_at: string | null;
};
type PremiumPayment = {
  order_id: string;
  amount: number;
  billing_period: "monthly" | "yearly";
  paid_at: string | null;
  created_at: string;
  status: "paid" | "refunded";
};
const uuid =
  /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const php = (amount: number) => new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(amount);
const dateInManila = (date: Date) => new Intl.DateTimeFormat("en-PH", {
  dateStyle: "long",
  timeZone: "Asia/Manila",
}).format(date);
const dateTimeInManila = (date: Date) => new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
}).format(date);
function subtractUtcMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}
function addBillingPeriod(startedAt: number, period: "monthly" | "yearly") {
  const date = new Date(startedAt);
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  if (period === "monthly") date.setUTCMonth(date.getUTCMonth() + 1);
  else date.setUTCFullYear(date.getUTCFullYear() + 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDay));
  return date;
}
const planFeatures = [
  ["Project drafts", "1 saved draft", "Unlimited"],
  ["Job applications", "1 every 3 months", "Unlimited"],
  ["Hiring Requests", "1 to a freelancer every 3 months", "Unlimited"],
  ["Active job postings", "1 listing total", "Up to 100 listings"],
  ["AI applicant screenings", "1 every 6 months", "Unlimited"],
  ["Transaction fee", "10% per job", "5% reduced fee"],
  ["Support", "Standard email support", "24/7 priority support"],
] as const;

export default function SubscriptionPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plan, setPlan] = useState("free");
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PremiumPayment[]>([]);
  const [paymentHistoryError, setPaymentHistoryError] = useState("");
  const [usage, setUsage] = useState<{
    active: number;
    applications: number | null;
  }>({ active: 0, applications: null });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState("");
  const [paymentReceivedOpen, setPaymentReceivedOpen] = useState(false);
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [buyer, setBuyer] = useState({ name: "", email: "" });
  const [clockNow, setClockNow] = useState<number | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("billing");
    if (requested === "yearly" || requested === "monthly") setBillingPeriod(requested);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: auth, error: authError } = await supabase.auth.getSession();
      const user = auth.session?.user;
      if (authError || !user)
        throw new Error("Sign in to view your subscription.");
      const accessToken = auth.session!.access_token;
      const userId = user.id;
      const historyPromise = (async () => {
        try {
          const response = await fetch("/api/subscriptions/history", {
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: "no-store",
          });
          const result = await response.json();
          if (!response.ok)
            return {
              payments: [] as PremiumPayment[],
              error: result.error || "Unable to load Premium payment history.",
            };
          return {
            payments: (Array.isArray(result.payments) ? result.payments : []) as PremiumPayment[],
            error: "",
          };
        } catch {
          return {
            payments: [] as PremiumPayment[],
            error: "Unable to load Premium payment history.",
          };
        }
      })();
      const [planResult, assignmentResult, historyResult] = await Promise.all([
        supabase
          .from("subscription_plans")
          .select("plan_code,display_name,active_listing_limit,provisional_monthly_price,provisional_annual_price")
          .order("active_listing_limit"),
        supabase
          .from("user_subscriptions")
          .select("plan_code,period_ends_at,access_type,trial_claimed_at")
          .eq("user_id", userId)
          .maybeSingle(),
        historyPromise,
      ]);
      if (planResult.error || assignmentResult.error)
        throw new Error(
          "Subscription setup is incomplete. Apply the prepared subscription migrations first.",
        );
      const activeAssignment = assignmentResult.data as Assignment | null;
      const activePlan =
        activeAssignment?.plan_code === "pro" &&
        Date.parse(activeAssignment.period_ends_at) > Date.now();
      const activeListings = supabase
        .from("listing_submissions")
        .select("submission_id", { count: "exact", head: true })
        .eq("owner_id", userId)
        .eq("listing_type", "job")
        .eq("status", "approved")
        .is("archived_at", null);
      const freelancerProfile = supabase
        .from("freelancer_profiles")
        .select("freelancer_id")
        .eq("user_id", userId)
        .maybeSingle();
      const buyerProfile = supabase
        .from("profiles")
        .select("display_name,first_name,last_name")
        .eq("user_id", userId)
        .maybeSingle();
      const [active, freelancer, profile] = await Promise.all([
        activeListings,
        freelancerProfile,
        buyerProfile,
      ]);
      if (active.error)
        throw new Error(
          "Your subscription usage could not be loaded. Please try again.",
        );
      const quotaWindowStart = subtractUtcMonths(new Date(), 3).toISOString();
      const applications = freelancer.data?.freelancer_id
        ? await supabase
            .from("job_applications")
            .select("application_id", { count: "exact", head: true })
            .eq("freelancer_id", freelancer.data.freelancer_id)
            .gt("created_at", quotaWindowStart)
        : { count: 0, error: null };
      setPlans((planResult.data ?? []) as Plan[]);
      setAssignment(activeAssignment);
      setPaymentHistory(historyResult.payments);
      setPaymentHistoryError(historyResult.error);
      setPlan(activePlan ? "pro" : "free");
      const metadata = user.user_metadata ?? {};
      const metadataName = typeof metadata.full_name === "string"
        ? metadata.full_name
        : typeof metadata.name === "string" ? metadata.name : "";
      const profileName = [profile.data?.first_name, profile.data?.last_name].filter(Boolean).join(" ") ||
        profile.data?.display_name?.trim();
      setBuyer({
        name: profileName || metadataName || user.email || "Account holder",
        email: user.email || "",
      });
      setClockNow(Date.now());
      if (typeof window !== "undefined")
        window.dispatchEvent(new Event("worksync:subscription-updated"));
      setUsage({
        active: active.count ?? 0,
        applications: freelancer.error || applications.error ? null : applications.count ?? 0,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load subscription information.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      await load();
      const params = new URLSearchParams(window.location.search);
      const requestedTrial = params.get("startTrial") === "1";
      if (live && requestedTrial && params.get("billing") === "monthly") {
        params.delete("startTrial");
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}?${params.toString()}${window.location.hash}`,
        );
        setActing(true);
        try {
          const { error: trialError } = await supabase.rpc(
            "worksync_claim_premium_trial",
          );
          if (trialError) throw new Error(trialError.message);
          await load();
          if (live) setCheckoutStatus("Your three-month Premium trial is active.");
        } catch (cause) {
          if (live)
            setCheckoutStatus(
              cause instanceof Error
                ? cause.message
                : "Unable to start your Premium trial.",
            );
        } finally {
          if (live) setActing(false);
        }
        return;
      }
      const orderId = params.get("order");
      if (!live || !orderId || !uuid.test(orderId)) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      try {
        const response = await fetch(
          `/api/subscriptions/checkout?orderId=${encodeURIComponent(orderId)}`,
          {
            headers: { Authorization: `Bearer ${data.session.access_token}` },
            cache: "no-store",
          },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Unable to verify Premium checkout.");
        if (live) {
          if (result.status === "paid") {
            setCheckoutStatus("");
            setPaymentReceivedOpen(true);
            params.delete("order");
            window.history.replaceState(
              null,
              "",
              `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`,
            );
            await load();
          } else {
            setCheckoutStatus(
              "Payment is not confirmed yet. Refresh the status after completing checkout.",
            );
          }
        }
      } catch (cause) {
        if (live)
          setCheckoutStatus(
            cause instanceof Error
              ? cause.message
              : "Unable to verify Premium checkout.",
          );
      }
    })();
    return () => {
      live = false;
    };
  }, [load]);

  useEffect(() => {
    const onRoleChanged = () => void load();
    window.addEventListener("account-role-changed", onRoleChanged);
    return () => window.removeEventListener("account-role-changed", onRoleChanged);
  }, [load]);

  async function renew() {
    if (acting) return;
    setActing(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sign in to renew Premium.");
      const response = await fetch("/api/subscriptions/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ billingPeriod }),
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to open Premium checkout.");
      window.location.assign(result.checkoutUrl);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to open Premium checkout.",
      );
      setCheckoutDialogOpen(false);
      setActing(false);
    }
  }

  async function refreshCheckout() {
    setCheckoutStatus("");
    setLoading(true);
    const orderId = new URLSearchParams(window.location.search).get("order");
    const { data } = await supabase.auth.getSession();
    if (!orderId || !data.session) {
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(
        `/api/subscriptions/checkout?orderId=${encodeURIComponent(orderId)}`,
        {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          cache: "no-store",
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to verify Premium checkout.");
      if (result.status === "paid") {
        setCheckoutStatus("");
        setPaymentReceivedOpen(true);
        const url = new URL(window.location.href);
        url.searchParams.delete("order");
        window.history.replaceState(
          null,
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
        await load();
      } else {
        setCheckoutStatus(
          "Payment is not confirmed yet. Try again after completing checkout.",
        );
      }
    } catch (cause) {
      setCheckoutStatus(
        cause instanceof Error
          ? cause.message
          : "Unable to verify Premium checkout.",
      );
    } finally {
      setLoading(false);
    }
  }

  const current = plans.find((item) => item.plan_code === plan);
  const offer = plans.find((item) => item.plan_code === "pro") ?? current;
  const activeLimit = current?.active_listing_limit;
  const hasUnlimitedJobPostingAllowance =
    plan === "pro" && activeLimit != null && activeLimit > 100_000;
  const hasActivePremium = plan === "pro" && assignment;
  const eligibleForTrial =
    billingPeriod === "monthly" &&
    plan === "free" &&
    !assignment?.trial_claimed_at;
  const price = billingPeriod === "monthly"
    ? offer?.provisional_monthly_price
    : offer?.provisional_annual_price;
  const priceLabel =
    price == null
      ? "Unavailable"
      : new Intl.NumberFormat("en-PH", {
          style: "currency",
          currency: "PHP",
        }).format(price);
  const activePercent = activeLimit
    ? Math.min(100, (usage.active / activeLimit) * 100)
    : 0;
  const premiumEndsAt = assignment ? new Date(assignment.period_ends_at) : null;
  const daysRemaining = premiumEndsAt && clockNow != null
    ? Math.max(0, Math.ceil((premiumEndsAt.getTime() - clockNow) / 86_400_000))
    : null;
  const trialProgress = assignment?.access_type === "trial" && assignment.trial_claimed_at && premiumEndsAt && clockNow != null
    ? Math.max(0, Math.min(100, ((clockNow - Date.parse(assignment.trial_claimed_at)) / (premiumEndsAt.getTime() - Date.parse(assignment.trial_claimed_at))) * 100))
    : null;
  const checkoutBreakdown = price == null ? null : calculateVat(price, "exclusive", true);
  const extensionBase = hasActivePremium && assignment
    ? new Date(assignment.period_ends_at).getTime()
    : clockNow ?? Date.now();
  const newExpirationDate = addBillingPeriod(extensionBase, billingPeriod);
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-8">
      <WorkspacePageHeader
        title="Subscription"
        description="Manage your plan tier and marketplace limits."
      />

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      {checkoutStatus && (
        <div
          className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <p className="text-sm">{checkoutStatus}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void refreshCheckout()}
          >
            Refresh payment status
          </Button>
        </div>
      )}

      {loading ? (
        <div
          className="space-y-5"
          aria-busy="true"
          aria-label="Loading subscription details"
        >
          <div className="h-56 animate-pulse rounded-2xl bg-muted" />
          <div className="h-72 animate-pulse rounded-2xl bg-muted" />
        </div>
      ) : !plans.length ? (
        <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
          Subscription details are unavailable. Refresh to try again.
        </div>
      ) : (
        <>
          <section aria-label="Current plan overview" className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="gap-0 space-y-4 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
                  <span className="size-2 rounded-full bg-primary" />{plan === "pro" ? "Premium access" : "Free access"}
                </p>
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  {hasActivePremium ? assignment.access_type === "trial" ? "Trial active" : "Premium active" : "Free plan"}
                </span>
              </div>
              <div className="rounded-lg border bg-background/60 p-4">
                {hasActivePremium && assignment ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">Expiration date</span>
                      <span className="font-semibold text-primary">{daysRemaining ?? "—"} days remaining</span>
                    </div>
                    <p className="mt-2 font-semibold">
                      {new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeZone: "Asia/Manila" }).format(new Date(assignment.period_ends_at))}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">at {new Intl.DateTimeFormat("en-PH", { timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(assignment.period_ends_at))} PHT</span>
                    </p>
                    {trialProgress != null && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${trialProgress}%` }} /></div>}
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">Current plan</p>
                    <p className="mt-2 font-semibold">Free plan active</p>
                    <p className="mt-1 text-xs text-muted-foreground">Upgrade to extend your marketplace limits.</p>
                  </>
                )}
              </div>
            </Card>

            {offer && (
              <Card className="gap-3 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Extend plan</p>
                </div>
                <div className="grid grid-cols-2 rounded-md border bg-background p-1 text-xs">
                  <button type="button" aria-pressed={billingPeriod === "monthly"} onClick={() => setBillingPeriod("monthly")} className={`rounded px-2 py-1.5 font-medium ${billingPeriod === "monthly" ? "bg-muted" : "text-muted-foreground"}`}>Monthly</button>
                  <button type="button" aria-pressed={billingPeriod === "yearly"} onClick={() => setBillingPeriod("yearly")} className={`whitespace-nowrap rounded px-2 py-1.5 font-medium ${billingPeriod === "yearly" ? "bg-muted" : "text-muted-foreground"}`}>Yearly<span className="ml-1 text-primary">2 months free</span></button>
                </div>
                <p className="text-2xl font-bold tracking-tight">{priceLabel}<span className="ml-1 text-xs font-normal text-muted-foreground">/ {billingPeriod === "monthly" ? "monthly" : "yearly"}</span></p>
                <Button className="w-full" disabled={acting || price == null} onClick={() => {
                  if (eligibleForTrial) {
                    window.location.assign("/home/subscription?billing=monthly&startTrial=1");
                    return;
                  }
                  setCheckoutDialogOpen(true);
                }}>
                  {acting ? <LoaderCircle className="size-4 animate-spin" /> : <Crown className="size-4" />}
                  {acting ? "Opening checkout..." : eligibleForTrial ? "Start 3-Month Trial" : `Extend ${billingPeriod === "monthly" ? "1 Month" : "1 Year"} · ${priceLabel}`}
                </Button>
              </Card>
            )}
          </section>
          <section aria-labelledby="payment-history-title" className="space-y-3">
            <div>
              <h2 id="payment-history-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Premium payment history
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Completed payments and Premium time added to your account.
              </p>
            </div>
            <Card className="overflow-hidden p-0">
              {paymentHistoryError ? (
                <p role="alert" className="p-4 text-sm text-destructive">{paymentHistoryError}</p>
              ) : paymentHistory.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No Premium payments yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-semibold">Date paid</th>
                        <th scope="col" className="px-4 py-3 font-semibold">Premium added</th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">Amount paid</th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentHistory.map((payment) => (
                        <tr key={payment.order_id} className="border-t">
                          <td className="whitespace-nowrap px-4 py-3">
                            {dateTimeInManila(new Date(payment.paid_at ?? payment.created_at))}
                          </td>
                          <td className="px-4 py-3">
                            Premium · {payment.billing_period === "monthly" ? "1 month" : "1 year"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">
                            {php(payment.amount)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                              {payment.status === "refunded" ? "Refunded" : "Paid"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </section>
          <section aria-labelledby="usage-title" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="usage-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Usage and allowances
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">Approved job postings count toward this allowance</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <UsageCard
                title="Active job postings"
                value={hasUnlimitedJobPostingAllowance ? "Unlimited" : `${usage.active} / ${activeLimit ?? "—"}`}
                caption={hasUnlimitedJobPostingAllowance
                  ? `${usage.active} active job posting${usage.active === 1 ? "" : "s"}`
                  : `${activeLimit == null ? 0 : Math.max(0, activeLimit - usage.active)} job-posting slots remaining`}
                progress={activePercent}
                indicator={hasUnlimitedJobPostingAllowance ? "Unlimited" : `${Math.round(activePercent)}%`}
              />
              <Card className="gap-0 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">AI applicant screening</p>
                    <p className="mt-3 text-2xl font-semibold">{plan === "pro" ? "Unlimited" : "1 every 6 months"}</p>
                  </div>
                  <span className="rounded border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">{plan === "pro" ? "Unlimited" : "Free tier"}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Screen job applicants with AI powered rankings and insights.</p>
              </Card>
              <UsageCard
                title="Job applications"
                value={plan === "pro" ? "Unlimited" : `${usage.applications ?? "—"} / 1`}
                caption={usage.applications == null
                  ? "Application usage unavailable"
                  : plan === "pro"
                    ? `${usage.applications} applications in the last 3 months`
                    : `${usage.applications} of 1 used in the last 3 months`}
                progress={usage.applications == null ? 0 : Math.min(100, usage.applications * 100)}
                indicator={plan === "pro" ? "Unlimited" : usage.applications == null ? undefined : `${Math.min(100, usage.applications * 100)}%`}
              />
            </div>
          </section>

          <section aria-labelledby="plan-comparison-title" className="space-y-3">
            <div>
              <h2 id="plan-comparison-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Plan matrix
              </h2>
            </div>
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <div
                  role="table"
                  aria-label="Free and Premium plan comparison"
                  className="min-w-[640px]"
                >
                  <div
                    role="row"
                    className="grid grid-cols-[minmax(180px,1.1fr)_minmax(180px,1fr)_minmax(220px,1.2fr)] border-b bg-muted/40 text-xs font-semibold uppercase tracking-wide"
                  >
                    <div role="columnheader" className="px-4 py-3">
                      Feature
                    </div>
                    <div role="columnheader" className="px-4 py-3">
                      Free tier
                    </div>
                    <div role="columnheader" className="bg-primary/5 px-4 py-3 text-primary">
                      Premium tier
                    </div>
                  </div>
                  {planFeatures.map(([feature, free, premium]) => (
                    <div
                      key={feature}
                      role="row"
                      className="grid grid-cols-[minmax(180px,1.1fr)_minmax(180px,1fr)_minmax(220px,1.2fr)] border-b text-sm last:border-b-0"
                    >
                      <div role="rowheader" className="px-4 py-3 font-medium">
                        {feature}
                      </div>
                      <div
                        role="cell"
                        className={`px-4 py-3 text-muted-foreground ${plan === "free" ? "bg-primary/5" : ""}`}
                      >
                        {free}
                      </div>
                      <div
                        role="cell"
                        className={`px-4 py-3 text-muted-foreground ${plan === "pro" ? "bg-primary/5" : ""}`}
                      >
                        {premium}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </section>

        </>
      )}
      <Dialog open={checkoutDialogOpen} onOpenChange={(open) => { if (!acting) setCheckoutDialogOpen(open); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Review your Premium checkout</DialogTitle>
            <DialogDescription>This payment extends your Premium access for the selected period.</DialogDescription>
          </DialogHeader>
          {checkoutBreakdown && (
            <div className="space-y-4">
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-sm">
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Plan</span><span className="font-medium">Premium · {billingPeriod === "monthly" ? "1 month" : "1 year"}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Current Premium expiry</span><span className="text-right font-medium">{hasActivePremium && assignment ? dateInManila(new Date(assignment.period_ends_at)) : "No active Premium access"}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">New expiration date</span><span className="text-right font-medium">{dateInManila(newExpirationDate)}</span></div>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Buyer</p>
                <p className="mt-2 font-medium">{buyer.name || "Account holder"}</p>
                <p className="text-sm text-muted-foreground">{buyer.email || "Email unavailable"}</p>
              </div>
              <div className="space-y-2 border-t pt-3 text-sm">
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{php(checkoutBreakdown.taxableAmount)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">VAT (12%)</span><span className="tabular-nums">{php(checkoutBreakdown.vatAmount)}</span></div>
                <div className="flex justify-between gap-4 border-t pt-3 text-base font-semibold"><span>Total due</span><span className="tabular-nums">{php(checkoutBreakdown.total)}</span></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={acting} onClick={() => setCheckoutDialogOpen(false)}>Cancel</Button>
            <Button type="button" disabled={acting || !checkoutBreakdown} onClick={() => void renew()}>
              {acting ? <LoaderCircle className="size-4 animate-spin" /> : <Crown className="size-4" />}
              {acting ? "Loading..." : "Checkout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={paymentReceivedOpen} onOpenChange={setPaymentReceivedOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader className="items-center gap-4 py-5 text-center">
            <div className="flex size-20 items-center justify-center rounded-full bg-emerald-600">
              <Check aria-hidden="true" className="size-11 text-white" strokeWidth={3} />
            </div>
            <DialogTitle className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
              Payment Successful!
            </DialogTitle>
            <DialogDescription>
              Your Premium subscription is now active.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t-0 bg-transparent p-0">
            <Button type="button" className="w-full" onClick={() => setPaymentReceivedOpen(false)}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UsageCard({
  title,
  value,
  caption,
  progress,
  indicator,
}: {
  title: string;
  value: string;
  caption: string;
  progress: number;
  indicator?: string;
}) {
  return (
    <Card className="gap-0 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {indicator && (indicator === "Unlimited"
          ? <span className="rounded border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">{indicator}</span>
          : <span className="text-xs text-muted-foreground">{indicator}</span>)}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <Progress
        value={progress}
        className="mt-4 h-2"
        aria-label={`${title} usage`}
      />
      <p className="mt-3 text-xs text-muted-foreground">{caption}</p>
    </Card>
  );
}
