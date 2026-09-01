"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  getMyMarketplaceListings,
  archiveMarketplaceService,
  archiveMarketplaceJob,
  type MarketplaceItem,
} from "@/services/marketplace/MarketplaceServices";

import { ListingCard } from "@/components/listings/ListingsGrid";
import { ListingsToolbar } from "@/components/listings/ListingsToolbar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Page() {
  const [listings, setListings] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingArchiveId, setPendingArchiveId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

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
     ARCHIVE LISTING
  ========================================================== */

  const handleArchive = (listingId: string) => {
    if (listingId) setPendingArchiveId(listingId);
  };

  const pendingListing = listings.find((item) =>
    item.listing_type === "service"
      ? item.service_id === pendingArchiveId
      : item.job_id === pendingArchiveId,
  );

  const confirmArchive = async () => {
    if (!pendingArchiveId || !pendingListing) return;

    try {
      setArchiving(true);
      const success =
        pendingListing.listing_type === "job"
          ? await archiveMarketplaceJob(pendingArchiveId)
          : await archiveMarketplaceService(pendingArchiveId);

      if (!success) {
        toast.error("The listing could not be archived.");
        return;
      }

      setPendingArchiveId(null);
      toast.success("Listing archived.");
      await loadListings();
    } catch (error) {
      console.error("Failed to archive listing:", error);
      toast.error("The listing could not be archived.");
    } finally {
      setArchiving(false);
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
                    onArchive={handleArchive}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <AlertDialog
        open={Boolean(pendingArchiveId)}
        onOpenChange={(open) => {
          if (!open && !archiving) setPendingArchiveId(null);
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-md bg-muted">
              <Archive className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Archive this listing?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">
                {pendingListing?.title ?? "This listing"}
              </span>{" "}
              will be removed from My Listings and the marketplace. Existing
              project records will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>
              Keep listing
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={archiving}
              onClick={(event) => {
                event.preventDefault();
                void confirmArchive();
              }}
            >
              {archiving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
