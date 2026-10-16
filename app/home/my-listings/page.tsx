"use client";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { WorkspacePageHeader } from "@/components/shared/WorkspacePageHeader";

import { useCallback, useEffect, useState } from "react";
import { Archive, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getArchivedListings, restoreArchivedListing, type ArchivedListing } from "@/services/marketplace/archiveService";
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
  const [archived, setArchived] = useState<ArchivedListing[]>([]);
  const [view, setView] = useState<"active" | "archived">("active");
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
      const [data, archivedData] = await Promise.all([getMyMarketplaceListings(), getArchivedListings()]);

      setLoadError("");
      setListings(Array.isArray(data) ? data.filter(Boolean) : []);
      setArchived(archivedData);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load your listings.",
      );

      setListings([]);
      setArchived([]);
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
      <WorkspacePageHeader
        title="My listings"
        description="Manage your services and opportunities, all in one place."
      />
      {/* ==================================================
              TOOLBAR
          ================================================== */}

      <div className="flex gap-2 border-b pb-2"><Button variant={view === "active" ? "default" : "ghost"} onClick={() => setView("active")}>Active listings</Button><Button variant={view === "archived" ? "default" : "ghost"} onClick={() => setView("archived")}>Archived ({archived.length})</Button></div>
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
        {view === "active" && <ListingsToolbar
          onCreated={() => loadListings()}
          search={search}
          onSearchChange={setSearch}
          kind={kind}
          onKindChange={setKind}
        />}
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
        {loading ? renderSkeleton() : view === "active" ? (visible.length === 0 ? renderEmptyState() : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{visible.map((listing) => <ListingCard key={"service_id" in listing ? listing.service_id : listing.job_id} listing={listing} onEdit={() => setEditing(listing)} onArchive={handleArchive} />)}</div>) : archived.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No archived listings.</div> : <div className="divide-y rounded-xl border bg-card">{archived.map((item) => <div key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-semibold">{item.title} <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal">{item.kind}</span></p><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p><p className="mt-2 text-xs text-muted-foreground">Posted {new Date(item.createdAt).toLocaleDateString()} · Archived {item.archivedAt ? new Date(item.archivedAt).toLocaleDateString() : "date unavailable"} · Previous status: {item.previousStatus}</p></div><Button variant="outline" onClick={async () => { try { await restoreArchivedListing(item); toast.success("Listing restored."); await loadListings(); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to restore this listing."); } }}><RotateCcw className="mr-2 size-4" />Restore</Button></div>)}</div>}
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
