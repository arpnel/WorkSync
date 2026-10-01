"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import MarketplaceService from "@/components/detailedservice/MarketplaceService";
export default function Page() {
  const { serviceId } = useParams<{ serviceId: string }>();
  return (
    <main className="min-h-screen bg-muted/30 px-6 py-4">
      <div className="mx-auto mb-5 max-w-6xl">
        <Button asChild variant="default">
          <Link href="/marketplace" aria-label="Back to marketplace">
            <ChevronLeft className="size-4" aria-hidden="true" />
            Back
          </Link>
        </Button>
      </div>
      <MarketplaceService serviceId={serviceId} guest />
    </main>
  );
}
