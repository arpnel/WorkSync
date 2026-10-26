"use client";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { WorkspacePageHeader } from "@/components/shared/WorkspacePageHeader";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getArchivedListings, restoreArchivedListing, removeArchivedListing, type ArchivedListing } from "@/services/marketplace/archiveService";
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
  const [view, setView] = useState<
    "active" | "pending" | "rejected" | "archived"
  >("active");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingArchiveId, setPendingArchiveId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<ArchivedListing | null>(null);
  const [removing, setRemoving] = useState(false);
  const loadVersion = useRef(0);

  /* ==========================================================
     LOAD MY LISTINGS
  ========================================================== */

  const loadListings = useCallback(async () => {
    const request = ++loadVersion.current;
    setLoading(true);

    try {
      const [data, archivedData] = await Promise.all([getMyMarketplaceListings(), getArchivedListings()]);
      if (request !== loadVersion.current) return;

      setLoadError("");
      setListings(Array.isArray(data) ? data.filter(Boolean) : []);
      setArchived(archivedData);
    } catch (error) {
      if (request !== loadVersion.current) return;
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load your listings.",
      );

      setListings([]);
      setArchived([]);
    } finally {
      if (request === loadVersion.current) setLoading(false);
    }
  }, []);

  /* ==========================================================
     INITIAL LOAD
  ========================================================== */

  useEffect(() => {
    void loadListings();
    const onRoleChanged = () => {
      setListings([]);
      setArchived([]);
      void loadListings();
    };
    window.addEventListener("account-role-changed", onRoleChanged);
    return () => window.removeEventListener("account-role-changed", onRoleChanged);
  }, [loadListings]);

  /* ==========================================================
     ARCHIVE LISTING
  ========================================================== */

  const handleArchive = (listingId: string) => {
    if (listingId) setPendingArchiveId(listingId);
  };

  const rejectedListings = listings.filter(
    (item) => item.moderationStatus === "rejected",
  );
  const pendingListings = listings.filter((item) =>
    ["editing", "pending_review", "manual_review"].includes(
      item.moderationStatus ?? "",
    ),
  );
  const activeListings = listings.filter(
    (item) => item.moderationStatus === "approved",
  );
  const visibleListings =
    view === "pending"
      ? pendingListings
      : view === "rejected"
        ? rejectedListings
        : activeListings;
  const visible = visibleListings.filter(
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

  const confirmRemoval = async () => {
    if (!pendingRemoval || removing) return;
    try {
      setRemoving(true);
      await removeArchivedListing(pendingRemoval);
      setPendingRemoval(null);
      toast.success("Removed from My Listings. Administrator history is retained.");
      await loadListings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to remove this archived listing.");
    } finally {
      setRemoving(false);
    }
  };

  /* ==========================================================
     LOADING SKELETON
  ========================================================== */

  const renderSkeleton = () => (
    <ContentSkeleton label="Loading listings" variant="listings" />
  );

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

      <div className="flex flex-wrap gap-2 border-b pb-2">
        <Button
          variant={view === "active" ? "default" : "ghost"}
          onClick={() => setView("active")}
        >
          Active listings ({activeListings.length})
        </Button>
        <Button
          variant={view === "pending" ? "default" : "ghost"}
          onClick={() => setView("pending")}
        >
          Pending ({pendingListings.length})
        </Button>
        <Button
          variant={view === "rejected" ? "default" : "ghost"}
          onClick={() => setView("rejected")}
        >
          Rejected ({rejectedListings.length})
        </Button>
        <Button
          variant={view === "archived" ? "default" : "ghost"}
          onClick={() => setView("archived")}
        >
          Archived ({archived.length})
        </Button>
      </div>
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
        {loading ? renderSkeleton() : view !== "archived" ? (
          visible.length === 0 ? (
            <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed bg-muted/20 px-6">
              <div className="max-w-md text-center">
                <h2 className="text-lg font-semibold">
                  {view === "rejected"
                    ? "No rejected listings"
                    : view === "pending"
                      ? "No listings pending review"
                      : "No active listings"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {view === "rejected"
                    ? "Listings that need changes after review will appear here with the decision reason."
                    : view === "pending"
                      ? "New and resubmitted listings stay hidden from the marketplace until they are reviewed."
                      : "Approved listings will appear here. Create a listing to submit it for review."}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((listing) => (
                <ListingCard
                  key={"service_id" in listing ? listing.service_id : listing.job_id}
                  listing={listing}
                  onEdit={() => setEditing(listing)}
                  onArchive={handleArchive}
                />
              ))}
            </div>
          )
        ) : archived.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No archived listings.</div>
        ) : (
          <div className="divide-y rounded-xl border bg-card">
            {archived.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">{item.title} <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal">{item.kind}</span></p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Posted {new Date(item.createdAt).toLocaleDateString()} · Archived {item.archivedAt ? new Date(item.archivedAt).toLocaleDateString() : "date unavailable"} · Previous status: {item.previousStatus}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {item.canRestore ? (
                    <Button variant="outline" onClick={async () => { try { await restoreArchivedListing(item); toast.success("Listing restored."); await loadListings(); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to restore this listing."); } }}>
                      <RotateCcw className="mr-2 size-4" />Restore
                    </Button>
                  ) : (
                    <span className="self-center rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">Accepted; closed</span>
                  )}
                  <Button variant="outline" onClick={() => setPendingRemoval(item)}>
                    <Trash2 className="mr-2 size-4" />Remove from My Listings
                  </Button>
                </div>
              </div>
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

      <AlertDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open && !removing) setPendingRemoval(null);
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-md bg-muted">
              <Trash2 className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Remove from My Listings?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">
                {pendingRemoval?.title ?? "This archived listing"}
              </span>{" "}
              will disappear from your archived list. The listing record and moderation history remain available to administrators.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Keep listing</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(event) => {
                event.preventDefault();
                void confirmRemoval();
              }}
            >
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Remove from My Listings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
