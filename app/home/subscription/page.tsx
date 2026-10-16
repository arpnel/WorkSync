"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { WorkspacePageHeader } from "@/components/shared/WorkspacePageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Plan = { plan_code: string; display_name: string; monthly_job_limit: number; monthly_service_limit: number; active_job_limit: number; active_service_limit: number; provisional_monthly_price: number | null };
export default function SubscriptionPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plan, setPlan] = useState("free");
  const [role, setRole] = useState("client");
  const [usage, setUsage] = useState({ used: 0, active: 0 });
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { if (live) setError("Sign in to view your subscription."); return; }
      const userId = auth.user.id;
      const [planResult, assignment, profile] = await Promise.all([
        supabase.from("subscription_plans").select("*").order("monthly_job_limit"),
        supabase.from("user_subscriptions").select("plan_code,period_started_at,period_ends_at").eq("user_id", userId).maybeSingle(),
        supabase.from("Users").select("role").eq("user_id", userId).maybeSingle(),
      ]);
      if (planResult.error) { if (live) setError("Subscription information requires the WorkSync listing and subscription database update."); return; }
      const activeRole = profile.data?.role === "freelancer" ? "freelancer" : "client";
      const type = activeRole === "client" ? "job" : "service";
      const profileId = activeRole === "client"
        ? (await supabase.from("client_profiles").select("client_id").eq("user_id", userId).maybeSingle()).data?.client_id
        : (await supabase.from("freelancer_profiles").select("freelancer_id").eq("user_id", userId).maybeSingle()).data?.freelancer_id;
      const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
      const [submitted, active] = await Promise.all([
        supabase.from("listing_submissions").select("submission_id", { count: "exact", head: true }).eq("owner_id", userId).eq("listing_type", type).gte("created_at", start.toISOString()),
        type === "job" ? supabase.from("jobs").select("job_id", { count: "exact", head: true }).eq("client_id", profileId ?? "").eq("is_archived", false).eq("status", "open") : supabase.from("services").select("service_id", { count: "exact", head: true }).eq("freelancer_id", profileId ?? "").eq("is_archived", false).eq("status", "Active"),
      ]);
      if (live) { setPlans((planResult.data ?? []) as Plan[]); setPlan(assignment.data?.plan_code ?? "free"); setRole(activeRole); setUsage({ used: submitted.count ?? 0, active: active.count ?? 0 }); }
    })().catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : "Unable to load subscription information."); });
    return () => { live = false; };
  }, []);
  const current = plans.find((item) => item.plan_code === plan);
  const monthly = role === "client" ? current?.monthly_job_limit : current?.monthly_service_limit;
  const activeLimit = role === "client" ? current?.active_job_limit : current?.active_service_limit;
  const kind = role === "client" ? "job" : "service";
  return (
    <div className="space-y-8">
      <WorkspacePageHeader
        title="Subscription"
        description="Choose the listing allowance that fits your work."
      />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <section aria-label="Subscription plans" className="grid items-stretch gap-4 lg:grid-cols-3">
        {plans.map((item) => {
          const monthlyLimit = role === "client" ? item.monthly_job_limit : item.monthly_service_limit;
          const activeListingLimit = role === "client" ? item.active_job_limit : item.active_service_limit;
          const isCurrent = item.plan_code === plan;

          return (
            <Card
              key={item.plan_code}
              className={`flex h-full flex-col ${isCurrent ? "border-primary ring-1 ring-primary/20" : ""}`}
            >
              <CardHeader className="pb-4">
                <div className="flex min-h-7 items-center justify-between gap-2">
                  <CardTitle>{item.display_name}</CardTitle>
                  {isCurrent && (
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                      Current plan
                    </span>
                  )}
                </div>
                <CardDescription>
                  {item.plan_code === "free" ? "Free forever" : "Billing coming soon"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-5">
                <div className="space-y-1">
                  <p className="text-3xl font-bold tracking-tight">
                    {item.provisional_monthly_price == null
                      ? "Coming soon"
                      : item.provisional_monthly_price === 0
                        ? "$0"
                        : `$${item.provisional_monthly_price}`}
                  </p>
                  {item.provisional_monthly_price === 0 && (
                    <p className="text-sm text-muted-foreground">No monthly charge</p>
                  )}
                </div>

                <div className="border-t pt-4">
                  <p className="mb-3 text-sm font-semibold">Plan benefits</p>
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    <li>{monthlyLimit} monthly {kind} submissions</li>
                    <li>Up to {activeListingLimit} active listings</li>
                    <li>AI-assisted listing moderation</li>
                    <li>Administrator review</li>
                    <li>Archive and restore listings</li>
                  </ul>
                </div>

                <Button
                  className="mt-auto w-full"
                  variant={isCurrent ? "outline" : "default"}
                  disabled
                >
                  {isCurrent ? "Current plan" : "Plan selection unavailable"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Current usage</CardTitle>
          <CardDescription>
            Your {kind} listing allowance for this calendar month.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <p className="text-sm">{usage.used} of {monthly ?? "—"} monthly submissions used</p>
          <p className="text-sm">{Math.max(0, (monthly ?? 0) - usage.used)} submissions remaining</p>
          <p className="text-sm">{usage.active} of {activeLimit ?? "—"} active listings</p>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Monthly submission counts reset with the calendar month. Every recorded submission counts, including listings awaiting review or rejected. Pro and Pro Plus prices and plan changes are provisional and are not billed yet.
      </p>
    </div>
  );
}


