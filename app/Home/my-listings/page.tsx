"use client";

import { useEffect, useState } from "react";

import {
  getMyMarketplaceListings,
  deleteMarketplaceService,
  type MarketplaceService,
} from "@/services/marketplace/MarketplaceServices";

import { ListingsGrid } from "@/components/listings/ListingsGrid";
import { ListingsToolbar } from "@/components/listings/ListingsToolbar";

export default function Page() {
  const [services, setServices] = useState<MarketplaceService[]>([]);
  const [loading, setLoading] = useState(true);

  /* ==========================================================
     LOAD MY LISTINGS
     The service function determines whether the current user
     is a freelancer or client and loads the correct listings.
  ========================================================== */

  const loadServices = async () => {
    setLoading(true);

    try {
      const data = await getMyMarketplaceListings();

      setServices(data);
    } catch (error) {
      console.error("Failed to load listings:", error);

      setServices([]);
    } finally {
      setLoading(false);
    }
  };

  /* ==========================================================
     INITIAL LOAD
  ========================================================== */

  useEffect(() => {
    loadServices();
  }, []);

  /* ==========================================================
     DELETE LISTING
  ========================================================== */

  const handleDelete = async (serviceId: string) => {
    const confirmed = window.confirm("Delete this listing?");

    if (!confirmed) {
      return;
    }

    const success = await deleteMarketplaceService(serviceId);

    if (success) {
      await loadServices();
    }
  };

  /* ==========================================================
     UI
  ========================================================== */

 return (
  <main className="min-h-screen bg-background">
    <div className="w-full px-6 py-4">
      {/* Big background area */}
      <div className="bg-muted/30 p-4">

        {/* Toolbar Card */}
        <div className="rounded-2xl bg-card p-4">
          <ListingsToolbar />
        </div>

        {/* Listings Card */}
        <div className="mt-4 rounded-2xl bg-card p-6">
          {loading ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="animate-pulse overflow-hidden rounded-3xl border"
                >
                  <div className="h-44 bg-muted" />

                  <div className="space-y-3 p-4">
                    <div className="h-4 w-1/2 rounded bg-muted" />
                    <div className="h-4 rounded bg-muted" />
                    <div className="h-4 w-2/3 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : services.length === 0 ? (
            <div className="rounded-xl border border-dashed py-12 text-center">
              <p className="text-lg font-medium">
                No listings available
              </p>

              <p className="mt-2 text-sm text-muted-foreground">
                Create your first listing to get started.
              </p>
            </div>
          ) : (
            <ListingsGrid
              services={services}
              onDelete={handleDelete}
            />
          )}
        </div>

      </div>
    </div>
  </main>
);
}