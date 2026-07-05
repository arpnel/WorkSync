import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BriefcaseBusiness, CheckCircle2, Clock3, Filter, Plus, Search } from "lucide-react";

const listings = [
  {
    title: "Website Redesign",
    client: "Northstar Studio",
    budget: "$2,400",
    status: "In Progress",
    due: "Due in 5 days",
  },
  {
    title: "Brand Identity Kit",
    client: "Lumen Labs",
    budget: "$1,150",
    status: "Pending Review",
    due: "Due in 12 days",
  },
  {
    title: "Landing Page Copy",
    client: "BrightLoop",
    budget: "$780",
    status: "Completed",
    due: "Delivered",
  },
];

export default function Page() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Freelance workspace</p>
          <h1 className="text-3xl font-semibold tracking-tight">My Listings</h1>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Listing
        </Button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative max-w-xl flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search listings, clients, or tags" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            Filter
          </Button>
          <Button variant="outline">Newest</Button>
          <Button variant="outline">Active</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {listings.map((listing) => (
          <button key={listing.title} type="button" className="text-left">
            <Card className="h-full transition hover:-translate-y-1 hover:shadow-lg">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{listing.title}</CardTitle>
                    <CardDescription>{listing.client}</CardDescription>
                  </div>
                  <Badge
                    variant={listing.status === "Completed" ? "secondary" : "default"}
                    className={listing.status === "Completed" ? "bg-emerald-100 text-emerald-700" : ""}
                  >
                    {listing.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <BriefcaseBusiness className="h-4 w-4" />
                  <span>Budget: {listing.budget}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {listing.status === "Completed" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Clock3 className="h-4 w-4" />
                  )}
                  <span>{listing.due}</span>
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
