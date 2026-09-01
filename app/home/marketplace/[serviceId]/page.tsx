"use client";

import { useParams } from "next/navigation";

import MarketplaceService from "@/components/detailedservice/MarketplaceService";

export default function MarketplaceServicePage() {
  const params = useParams();

  const serviceId = params.serviceId as string;

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="w-full px-6 py-4">
        <MarketplaceService serviceId={serviceId} />
      </div>
    </main>
  );
}