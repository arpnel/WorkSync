import { Check, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const advantages = [
  "Submit up to 30 listings each month",
  "Keep up to 20 listings active",
  "Unlimited AI-powered applicant screening for job listings",
  "Boost listing visibility in marketplace search and browse results",
];

export default function OffersPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 py-4 sm:py-8">
      <header className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Pricing
        </p>
        <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
          Level up
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
          Unlock more room to grow with higher listing capacity and useful tools
          for your business.
        </p>
      </header>

      <section aria-label="WorkSync Pro plan" className="mx-auto max-w-2xl">
        <Card className="overflow-hidden border-primary/30 shadow-lg shadow-primary/5">
          <CardHeader className="border-b bg-primary/[0.04] p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Crown className="size-5 text-primary" aria-hidden="true" />
                Pro
              </CardTitle>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                Planned advantages
              </span>
            </div>
            <CardDescription className="max-w-prose text-sm leading-relaxed">
              More capacity and visibility to help grow your WorkSync business.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 p-6 sm:p-8">
            <ul className="space-y-4">
              {advantages.map((advantage) => (
                <li key={advantage} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                    <Check className="size-3.5" aria-hidden="true" />
                  </span>
                  <span>{advantage}</span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Pricing
                </p>
                <p className="mt-1 font-semibold">To be announced</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  No payment required yet
                </p>
              </div>
              <Button className="sm:min-w-40" disabled>
                Available soon
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <p className="mx-auto max-w-2xl text-center text-xs text-muted-foreground sm:text-sm">
        These are sample Pro advantages. Paid plan pricing and plan changes are
        not available yet. Your current subscription and listing usage are
        shown in Settings.
      </p>
    </div>
  );
}
