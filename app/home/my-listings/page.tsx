"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getMyMarketplaceListings,
  deleteMarketplaceService,
  deleteMarketplaceJob,
  type MarketplaceItem,
} from "@/services/marketplace/MarketplaceServices";

import { ListingCard } from "@/components/listings/ListingsGrid";
import { ListingsToolbar } from "@/components/listings/ListingsToolbar";

export default function Page() {
  const [listings, setListings] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);

  /* ==========================================================
     LOAD MY LISTINGS
  ========================================================== */

  const loadListings = useCallback(async () => {
    setLoading(true);

    try {
      const data = await getMyMarketplaceListings();

      setListings(Array.isArray(data) ? data.filter(Boolean) : []);
    } catch (error) {
      console.error("Failed to load listings:", error);

      setListings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ==========================================================
     INITIAL LOAD
  ========================================================== */

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  /* ==========================================================
     DELETE LISTING
  ========================================================== */

  const handleDelete = async (listingId: string) => {
    if (!listingId) {
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to delete this listing?",
    );

    if (!confirmed) {
      return;
    }

    try {
      const listing = listings.find((item) =>
        item.listing_type === "service"
          ? item.service_id === listingId
          : item.job_id === listingId,
      );
      const success =
        listing?.listing_type === "job"
          ? await deleteMarketplaceJob(listingId)
          : await deleteMarketplaceService(listingId);

      if (success) {
        await loadListings();
      }
    } catch (error) {
      console.error("Failed to delete listing:", error);
    }
  };

  /* ==========================================================
     LOADING SKELETON
  ========================================================== */

  const renderSkeleton = () => {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="animate-pulse overflow-hidden rounded-3xl border bg-background"
          >
            <div className="h-44 bg-muted" />

            <div className="space-y-4 p-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-muted" />

                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/2 rounded bg-muted" />
                  <div className="h-2.5 w-1/3 rounded bg-muted" />
                </div>
              </div>

              <div className="h-4 w-4/5 rounded bg-muted" />

              <div className="flex gap-2">
                <div className="h-6 w-20 rounded-full bg-muted" />
                <div className="h-6 w-16 rounded-full bg-muted" />
              </div>

              <div className="h-4 w-1/3 rounded bg-muted" />

              <div className="border-t pt-3">
                <div className="h-6 w-24 rounded bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  /* ==========================================================
     EMPTY STATE
  ========================================================== */

  const renderEmptyState = () => {
    return (
      <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed bg-muted/20 px-6">
        <div className="max-w-md text-center">
          <h2 className="text-lg font-semibold">No listings available</h2>

          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            You do not have any listings yet. Create your first listing to get
            started.
          </p>
        </div>
      </div>
    );
  };

  /* ==========================================================
     UI
  ========================================================== */

  return (
    <main className="min-h-screen bg-background">
      <div className="w-full px-3 py-4 sm:px-6 sm:py-6">
        <div className="mx-auto w-full max-w-7xl rounded-2xl bg-muted/30 p-3 sm:p-4">
          {/* ==================================================
              TOOLBAR
          ================================================== */}

          <div className="rounded-2xl border bg-card p-3 sm:p-4">
            <ListingsToolbar onCreated={() => loadListings()} />
          </div>

          {/* ==================================================
              LISTINGS
          ================================================== */}

          <div className="mt-3 rounded-2xl border bg-card p-3 sm:mt-4 sm:p-6">
            {loading ? (
              renderSkeleton()
            ) : listings.length === 0 ? (
              renderEmptyState()
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {listings.map((listing) => (
                  <ListingCard
                    key={
                      "service_id" in listing
                        ? listing.service_id
                        : "job_id" in listing
                          ? listing.job_id
                          : crypto.randomUUID()
                    }
                    listing={listing}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
