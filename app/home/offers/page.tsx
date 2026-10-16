import { Check, Crown, Sparkles, Star } from "lucide-react";
import { WorkspacePageHeader } from "@/components/shared/WorkspacePageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const offers = [
  {
    name: "Free",
    icon: Star,
    price: "₱0",
    cadence: "forever",
    description: "A simple way to get started on WorkSync.",
    monthlyListings: 3,
    activeListings: 3,
    features: ["Create and manage listings", "Access marketplace tools", "Administrator listing review"],
  },
  {
    name: "Plus",
    icon: Sparkles,
    price: "Coming soon",
    cadence: "pricing announced soon",
    description: "More room to grow your work and reach more clients.",
    monthlyListings: 15,
    activeListings: 10,
    features: ["Everything in Free", "Higher monthly listing allowance", "More active listings"],
  },
  {
    name: "Pro",
    icon: Crown,
    price: "Coming soon",
    cadence: "pricing announced soon",
    description: "The highest listing capacity for an established business.",
    monthlyListings: 40,
    activeListings: 25,
    features: ["Everything in Plus", "Highest monthly listing allowance", "Most active listings"],
  },
];

export default function OffersPage() {
  return (
    <div className="space-y-8">
      <WorkspacePageHeader
        title="Plans and offers"
        description="Compare WorkSync plans and choose the listing capacity that fits your goals."
      />

      <section aria-label="WorkSync plans" className="grid items-stretch gap-5 lg:grid-cols-3">
        {offers.map((offer) => {
          const Icon = offer.icon;
          return (
            <Card key={offer.name} className={`relative flex h-full flex-col ${offer.name === "Plus" ? "border-primary shadow-md" : ""}`}>
              {offer.name === "Plus" && (
                <Badge className="absolute -top-3 right-5">Popular</Badge>
              )}
              <CardHeader className="gap-4 pb-4">
                <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </div>
                <div className="space-y-1.5">
                  <CardTitle className="text-xl">{offer.name}</CardTitle>
                  <CardDescription>{offer.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-5">
                <div>
                  <p className="text-3xl font-bold tracking-tight">{offer.price}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{offer.cadence}</p>
                </div>

                <div className="rounded-xl bg-muted/50 p-4 text-sm">
                  <p className="font-semibold">Listing capacity</p>
                  <p className="mt-2 text-muted-foreground">
                    {offer.monthlyListings} monthly submissions · up to {offer.activeListings} active listings
                  </p>
                </div>

                <ul className="flex-1 space-y-3 text-sm">
                  {offer.features.map((feature) => (
                    <li key={feature} className="flex gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button className="w-full" variant={offer.name === "Plus" ? "default" : "outline"} disabled>
                  {offer.name === "Free" ? "Included" : "Available soon"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <p className="text-sm text-muted-foreground">
        Paid plan pricing and plan changes are not available yet. Your current subscription and listing usage are shown in Settings.
      </p>
    </div>
  );
}
