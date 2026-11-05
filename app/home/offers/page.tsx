"use client";

import { useEffect, useState } from "react";
import { Check, Crown, Headphones, Infinity, Percent, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePremiumStatus } from "@/hooks/usePremiumStatus";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";

const freeFeatures = [
  { icon: Check, label: "1 saved project draft" },
  { icon: Check, label: "1 job application every 3 months" },
  { icon: Check, label: "1 hiring request to a freelancer every 3 months" },
  { icon: Check, label: "1 active job posting total" },
  { icon: Sparkles, label: "1 AI applicant screening every 6 months" },
  { icon: Percent, label: "10% transaction fee per job" },
  { icon: Headphones, label: "Standard email support" },
];

const premiumFeatures = [
  { icon: Infinity, label: "Unlimited project drafts" },
  { icon: Infinity, label: "Unlimited job applications" },
  { icon: Infinity, label: "Unlimited hiring requests" },
  { icon: Check, label: "Up to 100 active job postings" },
  { icon: Sparkles, label: "Unlimited AI applicant screenings" },
  { icon: Percent, label: "5% transaction fee per job" },
  { icon: Headphones, label: "24/7 priority support" },
];

export default function OffersPage() {
  const premium = usePremiumStatus();
  const [monthlyPrice, setMonthlyPrice] = useState<number | null>(null);
  const [yearlyPrice, setYearlyPrice] = useState<number | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");

  useEffect(() => {
    let active = true;
    void supabase
      .from("subscription_plans")
      .select("provisional_monthly_price,provisional_annual_price")
      .eq("plan_code", "pro")
      .maybeSingle()
      .then(({ data }) => {
        if (active && data?.provisional_monthly_price != null) {
          setMonthlyPrice(Number(data.provisional_monthly_price));
        }
        if (active && data?.provisional_annual_price != null) {
          setYearlyPrice(Number(data.provisional_annual_price));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const price = billingPeriod === "monthly" ? monthlyPrice : yearlyPrice;
  const priceLabel = price == null
    ? "Price unavailable"
    : new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        maximumFractionDigits: 2,
      }).format(price);
  const eligibleForTrial =
    billingPeriod === "monthly" && !premium.active && !premium.claimed;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-10 px-4 py-8 sm:px-6 sm:py-12">
      <header className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Pricing
        </p>
        <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
          Level up
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
          Unlock more room to grow with higher listing capacity and useful tools for your business.
        </p>
        <div className="mx-auto mt-6 inline-flex rounded-xl bg-muted p-1 text-xs font-medium">
          <button type="button" onClick={() => setBillingPeriod("monthly")} className={`rounded-lg px-4 py-2 ${billingPeriod === "monthly" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Monthly</button>
          <button type="button" onClick={() => setBillingPeriod("yearly")} className={`rounded-lg px-4 py-2 ${billingPeriod === "yearly" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Yearly</button>
        </div>
      </header>

      <section aria-label="WorkSync plans" className="grid gap-5 md:grid-cols-2">
        <article className={`flex flex-col rounded-2xl border bg-card p-6 shadow-sm sm:p-7 ${!premium.active ? "border-emerald-600/30" : ""}`}>
          <div>
            <h2 className="font-semibold">Free</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Essential tools to save a project draft and land initial gigs.
            </p>
          </div>
          <p className="mt-6 text-3xl font-bold tracking-tight">
            ₱0<span className="ml-1 text-xs font-normal text-muted-foreground">/ month</span>
          </p>
          <ul className="my-6 flex-1 space-y-3 border-t pt-5">
            {freeFeatures.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-xs">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#e5e2d2] text-[#68706b]">
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
                {label}
              </li>
            ))}
          </ul>
          {!premium.active ? (
            <Button
              className="w-full bg-[#aac5f7] text-white opacity-100 hover:bg-[#aac5f7] disabled:pointer-events-none disabled:opacity-100"
              disabled
            >
              Current Active Plan
            </Button>
          ) : (
            <Button asChild variant="outline" className="w-full">
              <Link href="/home/subscription">View subscription</Link>
            </Button>
          )}
        </article>

        <article className={`flex flex-col rounded-2xl border border-primary/60 bg-card p-6 shadow-sm sm:p-7 ${premium.active ? "ring-1 ring-primary/20" : ""}`}>
          <div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-semibold">
                <Crown className="size-4 text-primary" aria-hidden="true" />
                Premium
              </h2>
              {billingPeriod === "yearly" && (
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                  2 months free · yearly plan
                </span>
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              More room to grow, with expanded listings and powerful AI tools.
            </p>
          </div>
          <p className="mt-6 text-3xl font-bold tracking-tight">
            {priceLabel}
            <span className="ml-1 text-xs font-normal text-muted-foreground">/ {billingPeriod === "monthly" ? "month" : "year"}</span>
          </p>
          <ul className="my-6 flex-1 space-y-3 border-t pt-5">
            {premiumFeatures.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-xs">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
                {label}
              </li>
            ))}
          </ul>
          <Button
            className="w-full"
            disabled={price == null}
            onClick={() => window.location.assign(
              eligibleForTrial
                ? "/home/subscription?billing=monthly&startTrial=1"
                : `/home/subscription?billing=${billingPeriod}`,
            )}
          >
              {premium.active
                ? "Manage subscription"
                : premium.claimed
                  ? "Renew Premium"
                  : eligibleForTrial
                    ? "Start free 3 months trial"
                    : "Get Started"}
              <span aria-hidden="true">→</span>
          </Button>
        </article>
      </section>
    </main>
  );
}
