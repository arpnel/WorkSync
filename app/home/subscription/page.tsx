"use client";
import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  Check,
  Crown,
  LoaderCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { WorkspacePageHeader } from "@/components/shared/WorkspacePageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type Plan = {
  plan_code: string;
  display_name: string;
  monthly_job_limit: number;
  monthly_service_limit: number;
  active_listing_limit: number;
  active_job_limit: number;
  active_service_limit: number;
  provisional_monthly_price: number | null;
};
type Assignment = {
  plan_code: string;
  period_ends_at: string;
  access_type: "free" | "trial" | "paid";
  trial_claimed_at: string | null;
};
const uuid =
  /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

export default function SubscriptionPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plan, setPlan] = useState("free");
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [role, setRole] = useState("client");
  const [usage, setUsage] = useState({ used: 0, active: 0 });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user)
        throw new Error("Sign in to view your subscription.");
      const userId = auth.user.id;
      const [planResult, assignmentResult, profile] = await Promise.all([
        supabase
          .from("subscription_plans")
          .select("*")
          .order("monthly_job_limit"),
        supabase
          .from("user_subscriptions")
          .select("plan_code,period_ends_at,access_type,trial_claimed_at")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("Users")
          .select("role")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      if (planResult.error || assignmentResult.error)
        throw new Error(
          "Subscription setup is incomplete. Apply the prepared subscription migrations first.",
        );
      const activeAssignment = assignmentResult.data as Assignment | null;
      const activePlan =
        activeAssignment?.plan_code === "pro" &&
        Date.parse(activeAssignment.period_ends_at) > Date.now();
      const activeRole =
        profile.data?.role === "freelancer" ? "freelancer" : "client";
      const type = activeRole === "client" ? "job" : "service";
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const activeListings = supabase
        .from("listing_submissions")
        .select("submission_id", { count: "exact", head: true })
        .eq("owner_id", userId)
        .eq("status", "approved")
        .is("archived_at", null);
      if (!activePlan) activeListings.eq("listing_type", type);
      const [submitted, active] = await Promise.all([
        supabase
          .from("listing_submissions")
          .select("submission_id", { count: "exact", head: true })
          .eq("owner_id", userId)
          .eq("listing_type", type)
          .gte("created_at", start.toISOString()),
        activeListings,
      ]);
      if (profile.error || submitted.error || active.error)
        throw new Error(
          "Your subscription usage could not be loaded. Please try again.",
        );
      setPlans((planResult.data ?? []) as Plan[]);
      setAssignment(activeAssignment);
      setPlan(activePlan ? "pro" : "free");
      if (typeof window !== "undefined")
        window.dispatchEvent(new Event("worksync:subscription-updated"));
      setRole(activeRole);
      setUsage({
        used: submitted.count ?? 0,
        active: active.count ?? 0,
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
      const orderId = new URLSearchParams(window.location.search).get("order");
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
          setCheckoutStatus(
            result.status === "paid"
              ? "Premium payment confirmed. Your plan is active."
              : "Payment is not confirmed yet. Refresh the status after completing checkout.",
          );
          if (result.status === "paid") await load();
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

  async function startTrial() {
    if (acting) return;
    setActing(true);
    setError("");
    try {
      const { error: trialError } = await supabase.rpc(
        "worksync_claim_premium_trial",
      );
      if (trialError) throw new Error(trialError.message);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to start your Premium trial.",
      );
    } finally {
      setActing(false);
    }
  }

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
        body: "{}",
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
      setCheckoutStatus(
        result.status === "paid"
          ? "Premium payment confirmed. Your plan is active."
          : "Payment is not confirmed yet. Try again after completing checkout.",
      );
      if (result.status === "paid") await load();
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
  const displayPlanName = (name?: string) =>
    name?.replace(/\bpro\b/gi, "Premium");
  const monthly =
    role === "client"
      ? current?.monthly_job_limit
      : current?.monthly_service_limit;
  const kind = role === "client" ? "job" : "service";
  const activeLimit =
    plan === "pro"
      ? current?.active_listing_limit
      : role === "client"
        ? current?.active_job_limit
        : current?.active_service_limit;
  const hasActivePremium = plan === "pro" && assignment;
  const price = offer?.provisional_monthly_price;
  const priceLabel =
    price == null
      ? "Unavailable"
      : new Intl.NumberFormat("en-PH", {
          style: "currency",
          currency: "PHP",
        }).format(price);
  const planName =
    displayPlanName(current?.display_name) ??
    (plan === "pro" ? "Premium" : "Free");
  const usedPercent = monthly ? Math.min(100, (usage.used / monthly) * 100) : 0;
  const activePercent = activeLimit
    ? Math.min(100, (usage.active / activeLimit) * 100)
    : 0;
  const periodEnd = assignment?.period_ends_at
    ? new Date(assignment.period_ends_at).toLocaleString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Manila",
      })
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-8">
      <WorkspacePageHeader
        title="Subscription"
        description="Manage your plan, track marketplace usage, and control Premium access."
        actions={
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            Refresh
          </Button>
        }
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
          <section aria-label="Current plan overview">
            <Card
              className={`gap-0 overflow-hidden p-0 ${plan === "pro" ? "border-primary/30" : ""}`}
            >
              <div
                className={`flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6 ${plan === "pro" ? "bg-primary/10" : "bg-muted/40"}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex size-10 items-center justify-center rounded-xl ${plan === "pro" ? "bg-primary/15 text-primary" : "bg-background text-muted-foreground"}`}
                  >
                    {plan === "pro" ? (
                      <Crown className="size-5" />
                    ) : (
                      <CalendarDays className="size-5" />
                    )}
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Current plan
                    </p>
                    <p className="font-semibold">{planName}</p>
                  </div>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${plan === "pro" ? "bg-primary/15 text-primary" : "bg-background text-muted-foreground"}`}
                >
                  {hasActivePremium
                    ? assignment.access_type === "trial"
                      ? "Premium active · trial"
                      : "Premium active"
                    : "Free plan active"}
                </span>
              </div>

              <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
                <div className="space-y-4">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight">
                      {plan === "pro"
                        ? "Your Premium access"
                        : "Your marketplace plan"}
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                      {hasActivePremium
                        ? `Premium is active${assignment.access_type === "trial" ? " on your three-month trial" : ""}${periodEnd ? ` until ${periodEnd} Philippine Time` : ""}. Access returns to Free at that time unless you renew. Renewals are manual; you will not be charged automatically.`
                        : "Your Free plan is active. Upgrade when you need more marketplace capacity or AI screening."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Check className="size-4 text-primary" />
                      {monthly ?? "—"} monthly {kind} submissions
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Check className="size-4 text-primary" />
                      {activeLimit ?? "—"} active{" "}
                      {plan === "pro"
                        ? "listings across jobs and services"
                        : `${kind} postings`}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Sparkles className="size-4 text-primary" />
                      {plan === "pro" ? "Unlimited" : "5 per six months"} AI
                      screenings
                    </span>
                  </div>
                </div>

                {offer && (
                  <div className="rounded-xl border bg-background p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {plan === "pro"
                        ? "Manual monthly renewal"
                        : "Upgrade to Premium"}
                    </p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight">
                      {priceLabel}
                      <span className="text-sm font-normal text-muted-foreground">
                        {" "}
                        / month
                      </span>
                    </p>
                    <Button
                      className="mt-4 w-full"
                      variant={plan === "pro" ? "outline" : "default"}
                      disabled={
                        acting ||
                        (price == null &&
                          (plan === "pro" || !!assignment?.trial_claimed_at))
                      }
                      onClick={() =>
                        void (!assignment?.trial_claimed_at && plan === "free"
                          ? startTrial()
                          : renew())
                      }
                    >
                      {acting ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Crown className="size-4" />
                      )}
                      {acting
                        ? assignment?.trial_claimed_at
                          ? "Opening checkout…"
                          : "Starting trial…"
                        : !assignment?.trial_claimed_at && plan === "free"
                          ? "Start 3-month free trial"
                          : plan === "pro"
                            ? `Add one month · ${priceLabel}`
                            : `Get Premium · ${priceLabel}/month`}
                    </Button>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      {plan === "pro"
                        ? "One-time checkout. Pay early to add one month after your current end date. No automatic charge."
                        : assignment?.trial_claimed_at
                          ? "Your one-time trial has been used. Premium renews only when you choose to pay."
                          : "One trial per account. No payment details or automatic charges; choose a monthly renewal after the trial."}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </section>

          <section aria-labelledby="usage-title" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="usage-title" className="text-lg font-semibold">
                  Usage and allowances
                </h2>
                <p className="text-sm text-muted-foreground">
                  A clear view of the limits included in your {planName} plan.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Listing submissions reset on the first day of each month.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <UsageCard
                title="Monthly listing submissions"
                value={`${usage.used} of ${monthly ?? "—"}`}
                caption={`${monthly == null ? "Limit unavailable" : `${Math.max(0, monthly - usage.used)} submissions remaining`} · ${kind} listings`}
                progress={usedPercent}
              />
              <UsageCard
                title="Active marketplace postings"
                value={`${usage.active} of ${activeLimit ?? "—"}`}
                caption={
                  plan === "pro"
                    ? "Jobs and services combined"
                    : `Active ${kind} postings`
                }
                progress={activePercent}
              />
              <Card className="gap-0 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      AI applicant screening
                    </p>
                    <p className="mt-3 text-2xl font-semibold">
                      {plan === "pro" ? "Unlimited" : "5 screenings"}
                    </p>
                  </div>
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Sparkles className="size-4" />
                  </span>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {plan === "pro"
                    ? "Included with Premium access."
                    : "Available every rolling six months on the Free plan."}
                </p>
              </Card>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Every recorded listing submission counts toward the monthly
              allowance, including listings awaiting review or rejected. Active
              postings count approved, unarchived listings.
            </p>
          </section>

          {plan === "free" && offer && (
            <section
              aria-label="Premium plan details"
              className="rounded-2xl border bg-card px-5 py-4 sm:px-6"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="flex items-center gap-2 font-semibold">
                    <Crown className="size-4 text-primary" />
                    Premium plan
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {offer.monthly_job_limit} monthly submissions,{" "}
                    {offer.active_listing_limit} active listings across jobs and
                    services, and unlimited AI screening.
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium">
                  {priceLabel}
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    / month · manual renewal
                  </span>
                </p>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function UsageCard({
  title,
  value,
  caption,
  progress,
}: {
  title: string;
  value: string;
  caption: string;
  progress: number;
}) {
  return (
    <Card className="gap-0 p-5 sm:p-6">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
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
