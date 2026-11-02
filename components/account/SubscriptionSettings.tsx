"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Crown, LoaderCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PremiumExpiryNotice } from "@/components/account/PremiumExpiryNotice";

type Subscription = {
  plan_code: string;
  period_ends_at: string;
  access_type: "free" | "trial" | "paid";
  trial_claimed_at: string | null;
};

export default function SubscriptionSettings() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [annualPrice, setAnnualPrice] = useState<number | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [clockNow, setClockNow] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: auth, error: authError } = await supabase.auth.getSession();
      const user = auth.session?.user;
      if (authError || !user)
        throw new Error("Sign in to view your subscription.");
      const [assignment, plan] = await Promise.all([
        supabase
          .from("user_subscriptions")
          .select("plan_code,period_ends_at,access_type,trial_claimed_at")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("subscription_plans")
          .select("provisional_monthly_price,provisional_annual_price")
          .eq("plan_code", "pro")
          .maybeSingle(),
      ]);
      if (assignment.error || plan.error) {
        throw new Error(
          "Subscription details are unavailable. Refresh to try again.",
        );
      }
      setSubscription(assignment.data as Subscription | null);
      setPrice(plan.data?.provisional_monthly_price ?? null);
      setAnnualPrice(plan.data?.provisional_annual_price ?? null);
      setClockNow(Date.now());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Subscription details are unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  const active =
    subscription?.plan_code === "pro" &&
    Date.parse(subscription.period_ends_at) > Date.now();
  const trialClaimed = subscription?.trial_claimed_at != null;
  async function managePremium() {
    if (acting) return;
    setActing(true);
    setError("");
    setNotice("");
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
        cause instanceof Error ? cause.message : "Unable to update Premium.",
      );
    } finally {
      setActing(false);
    }
  }

  const selectedPrice = billingPeriod === "monthly" ? price : annualPrice;
  const priceLabel =
    selectedPrice == null
      ? "Price unavailable"
      : `${new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(selectedPrice)} / ${billingPeriod === "monthly" ? "month" : "year"}`;

  return (
    <Card className="gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={`flex size-10 items-center justify-center rounded-xl ${active ? "bg-amber-400/20 text-amber-500" : "bg-muted text-muted-foreground"}`}
          >
            {active ? (
              <Crown className="size-5 fill-amber-400" />
            ) : (
              <CalendarDays className="size-5" />
            )}
          </span>
          <div>
            <p className="font-semibold">
              {active ? "Premium active" : "Free plan"}
              {active && subscription?.access_type === "trial"
                ? " · trial"
                : ""}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {loading
                ? "Loading your subscription…"
                : active
                  ? "Your Premium access is active. Renewals are manual; you will not be charged automatically."
                  : trialClaimed
                    ? "Your previous trial has ended. Choose a manual renewal to activate Premium."
                    : "Choose a monthly or yearly Premium plan. Renewals are manual."}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </div>

      {active && subscription && (
        <PremiumExpiryNotice
          periodEndsAt={subscription.period_ends_at}
          now={clockNow}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div>
          <p className="text-sm font-medium">Premium</p>
          <div className="mt-2 inline-flex rounded-lg bg-muted p-1 text-xs">
            <button type="button" onClick={() => setBillingPeriod("monthly")} className={`rounded-md px-3 py-1.5 ${billingPeriod === "monthly" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Monthly</button>
            <button type="button" onClick={() => setBillingPeriod("yearly")} className={`rounded-md px-3 py-1.5 ${billingPeriod === "yearly" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Yearly · 2 months free</button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{priceLabel} · one-time payment</p>
        </div>
        <Button
          disabled={loading || acting || selectedPrice == null}
          onClick={() => void managePremium()}
        >
          {acting ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Crown className="size-4" />
          )}
          {acting
            ? "Please wait…"
            : active
              ? `Pay early · add one ${billingPeriod === "monthly" ? "month" : "year"}`
              : trialClaimed
                ? "Renew Premium"
                : "Get Premium"}
        </Button>
      </div>
      {active && (
        <p className="text-xs text-muted-foreground">
          Pay early to add one {billingPeriod === "monthly" ? "month" : "year"} after your current end date. Renewals are
          manual.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
    </Card>
  );
}
