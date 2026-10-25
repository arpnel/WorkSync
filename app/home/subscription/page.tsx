"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { WorkspacePageHeader } from "@/components/shared/WorkspacePageHeader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

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
      if (authError || !auth.user) throw new Error("Sign in to view your subscription.");
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
        supabase.from("Users").select("role").eq("user_id", userId).maybeSingle(),
      ]);
      if (planResult.error || assignmentResult.error)
        throw new Error(
          "Subscription setup is incomplete. Apply the prepared subscription migrations first.",
        );
      const activeAssignment = assignmentResult.data as Assignment | null;
      const activePlan =
        activeAssignment?.plan_code === "pro" &&
        Date.parse(activeAssignment.period_ends_at) > Date.now();
      const activeRole = profile.data?.role === "freelancer" ? "freelancer" : "client";
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
      setPlans((planResult.data ?? []) as Plan[]);
      setAssignment(activeAssignment);
      setPlan(activePlan ? "pro" : "free");
      setRole(activeRole);
      setUsage({
        used: submitted.count ?? 0,
        active: active.count ?? 0,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load subscription information.");
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
          { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store" },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to verify Premium checkout.");
        if (live) {
          setCheckoutStatus(
            result.status === "paid"
              ? "Premium payment confirmed. Your plan is active."
              : "Payment is not confirmed yet. Refresh the status after completing checkout.",
          );
          if (result.status === "paid") await load();
        }
      } catch (cause) {
        if (live) setCheckoutStatus(cause instanceof Error ? cause.message : "Unable to verify Premium checkout.");
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
      const { error: trialError } = await supabase.rpc("worksync_claim_premium_trial");
      if (trialError) throw new Error(trialError.message);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start your Premium trial.");
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
      if (!response.ok) throw new Error(result.error || "Unable to open Premium checkout.");
      window.location.assign(result.checkoutUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open Premium checkout.");
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
        { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to verify Premium checkout.");
      setCheckoutStatus(
        result.status === "paid"
          ? "Premium payment confirmed. Your plan is active."
          : "Payment is not confirmed yet. Try again after completing checkout.",
      );
      if (result.status === "paid") await load();
    } catch (cause) {
      setCheckoutStatus(cause instanceof Error ? cause.message : "Unable to verify Premium checkout.");
    } finally {
      setLoading(false);
    }
  }

  const current = plans.find((item) => item.plan_code === plan);
  const offer = plans.find((item) => item.plan_code === "pro") ?? current;
  const displayPlanName = (name?: string) => name?.replace(/\bpro\b/gi, "Premium") ?? "Unavailable";
  const monthly = role === "client" ? current?.monthly_job_limit : current?.monthly_service_limit;
  const kind = role === "client" ? "job" : "service";
  const activeLimit =
    plan === "pro"
      ? current?.active_listing_limit
      : role === "client"
        ? current?.active_job_limit
        : current?.active_service_limit;
  const hasActivePremium = plan === "pro" && assignment;
  const price = offer?.provisional_monthly_price;
  const priceLabel = price == null
    ? "Unavailable"
    : new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(price);

  return (
    <div className="space-y-8">
      <WorkspacePageHeader
        title="Subscription"
        description="Manage your current plan, listing allowance, and Premium access."
      />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {checkoutStatus && (
        <div className="space-y-2" role="status">
          <p className="text-sm">{checkoutStatus}</p>
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void refreshCheckout()}>
            Refresh payment status
          </Button>
        </div>
      )}

      {offer && (
        <section aria-label="Subscription plan" className="max-w-2xl">
          <Card className="border-primary/30">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>{displayPlanName(offer.display_name)}</CardTitle>
                {plan === "pro" && (
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    Current plan
                  </span>
                )}
              </div>
              <CardDescription>
                {hasActivePremium
                  ? `${assignment.access_type === "trial" ? "Trial" : "Premium"} access until ${new Date(assignment.period_ends_at).toLocaleDateString("en-PH")}`
                  : "Three-month free trial, then optional manual monthly renewal"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="text-3xl font-bold tracking-tight">{priceLabel}</p>
                <p className="text-sm text-muted-foreground">per month · one-time payment each renewal</p>
              </div>
              <div className="border-t pt-4">
                <p className="mb-3 text-sm font-semibold">Plan benefits</p>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li>{role === "client" ? offer.monthly_job_limit : offer.monthly_service_limit} monthly {kind} submissions</li>
                  <li>Up to {offer.active_listing_limit} active marketplace postings total across jobs and services</li>
                  <li>AI-assisted listing moderation</li>
                  <li>Administrator review</li>
                  <li>Archive and restore listings</li>
                  <li>Unlimited AI applicant screening</li>
                </ul>
              </div>
              {!assignment?.trial_claimed_at && plan === "free" ? (
                <Button className="w-full" disabled={loading || acting} onClick={() => void startTrial()}>
                  {acting ? "Starting trial…" : "Start 3-month free trial"}
                </Button>
              ) : (
                <Button className="w-full" variant={plan === "pro" ? "outline" : "default"} disabled={loading || acting || price == null} onClick={() => void renew()}>
                  {acting
                    ? "Opening checkout…"
                    : plan === "pro"
                      ? `Renew manually · ${priceLabel}`
                      : `Get Premium · ${priceLabel}/month`}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                The trial is available once per account and does not require payment details. We will not charge automatically. After it ends, Free limits apply until you choose a monthly renewal.
              </p>
              {plan === "free" && (
                <p className="text-sm text-muted-foreground">
                  Free includes up to {activeLimit ?? 3} active {kind} postings and five AI applicant screenings per rolling six months.
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Current usage</CardTitle>
          <CardDescription>
            Current plan: {displayPlanName(current?.display_name)}. Your {kind} listing allowance for this calendar month.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <p className="text-sm">{usage.used} of {monthly ?? "—"} monthly submissions used</p>
          <p className="text-sm">{Math.max(0, (monthly ?? 0) - usage.used)} submissions remaining</p>
          <p className="text-sm">
            {plan === "pro"
              ? `${usage.active} of ${activeLimit ?? "—"} active marketplace postings (jobs + services)`
              : `${usage.active} of ${activeLimit ?? "—"} active ${kind} postings`}
          </p>
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        Monthly submission counts reset with the calendar month. Every recorded submission counts, including listings awaiting review or rejected.
      </p>
    </div>
  );
}
