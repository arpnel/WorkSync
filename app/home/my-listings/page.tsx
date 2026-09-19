"use client";
import ContentSkeleton from "@/components/shared/ContentSkeleton";

import { useCallback, useEffect, useState } from "react";
import { Archive, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  getMyMarketplaceListings,
  archiveMarketplaceService,
  archiveMarketplaceJob,
  type MarketplaceItem,
} from "@/services/marketplace/MarketplaceServices";

import { ListingEditDialog } from "@/components/listings/ListingEditDialog";
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
  const [editing, setEditing] = useState<MarketplaceItem | null>(null);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [listings, setListings] = useState<MarketplaceItem[]>([]);
  const [loadError, setLoadError] = useState("");
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

      setLoadError("");
      setListings(Array.isArray(data) ? data.filter(Boolean) : []);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load your listings.",
      );

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

  const visible = listings.filter(
    (item) =>
      (kind === "all" || item.listing_type === kind) &&
      [item.title, item.description].some((value) =>
        value.toLowerCase().includes(search.toLowerCase()),
      ),
  );
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

  const renderSkeleton = () => (
    <ContentSkeleton label="Loading listings" variant="listings" />
  );

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
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          My Listings
        </h1>
      </div>
      {/* ==================================================
              TOOLBAR
          ================================================== */}

      <div className="space-y-3">
        {loadError && (
          <p role="alert" className="text-sm text-destructive">
            {loadError}{" "}
            <button
              className="underline"
              type="button"
              onClick={() => void loadListings()}
            >
              Retry
            </button>
          </p>
        )}
        <ListingsToolbar
          onCreated={() => loadListings()}
          search={search}
          onSearchChange={setSearch}
          kind={kind}
          onKindChange={setKind}
        />
        {editing && (
          <ListingEditDialog
            key={
              editing.listing_type === "service"
                ? editing.service_id
                : editing.job_id
            }
            listing={editing}
            onClose={() => setEditing(null)}
            onSaved={loadListings}
          />
        )}
      </div>

      {/* ==================================================
              LISTINGS
          ================================================== */}

      <div className="min-w-0">
        {loading ? (
          renderSkeleton()
        ) : visible.length === 0 ? (
          renderEmptyState()
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((listing) => (
              <ListingCard
                key={
                  "service_id" in listing
                    ? listing.service_id
                    : "job_id" in listing
                      ? listing.job_id
                      : crypto.randomUUID()
                }
                listing={listing}
                onEdit={() => setEditing(listing)}
                onArchive={handleArchive}
              />
            ))}
          </div>
        )}
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
    </div>
  );
}
