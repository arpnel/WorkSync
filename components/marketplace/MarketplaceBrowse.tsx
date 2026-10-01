"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { WorkspacePageHeader } from "@/components/shared/WorkspacePageHeader";
import { invalidatePageReads } from "@/lib/pageReadCache";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import MarketplaceHeader from "@/components/marketplace/MarketplaceHeader";
import MarketplaceFilterSheet from "@/components/marketplace/MarketplaceFilterSheet";
import MarketplaceGrid from "@/components/marketplace/MarketplaceGrid";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SignupDialog } from "@/components/auth/signup/SignupDialog";
import { Button } from "@/components/ui/button";
import {
  getMarketplaceServices,
  type MarketplaceItem,
  type MarketplaceSort,
} from "@/services/marketplace/MarketplaceServices";
import {
  getSavedListings,
  saveListing,
  listingKey,
  getFreelancerRatings,
} from "@/services/marketplace/listingActions";
import type {
  MarketplaceFiltersValue,
  SortOption,
} from "@/components/marketplace/MarketplaceFilters";

export default function MarketplaceBrowse({
  guest = false,
}: {
  guest?: boolean;
}) {
  const [signup, setSignup] = useState(false);
  const router = useRouter();
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  const [services, setServices] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<MarketplaceFiltersValue>({
    sort: ["latest"],
    listingType: "freelancer",
    minPrice: "",
    maxPrice: "",
    rating: 0,
    savedOnly: false,
  });
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const savedOnly = filters.savedOnly;
  const [saving, setSaving] = useState<string | null>(null);
  const version = useRef(0);
  const load = useCallback(
    async (quiet = false) => {
      const request = ++version.current;
      if (!quiet) setLoading(true);
      setError("");
      try {
        const sort: MarketplaceSort = filters.sort.includes("lowestPrice")
          ? "lowestPrice"
          : "latest";
        const result = await getMarketplaceServices({
          ...(guest ? { guest: true } : {}),
          search,
          sort,
          listingType: filters.listingType === "freelancer" ? "service" : "job",
          minPrice: filters.minPrice ? Number(filters.minPrice) : null,
          maxPrice: filters.maxPrice ? Number(filters.maxPrice) : null,
        });
        const ratings = await getFreelancerRatings(
          result.flatMap((item) =>
            item.freelancer_id ? [item.freelancer_id] : [],
          ),
        );
        const rated = result.filter(
          (item) =>
            item.listing_type === "job" ||
            (ratings.get(item.freelancer_id ?? "") ?? 0) >= filters.rating,
        );
        if (filters.sort.includes("highestRated"))
          rated.sort(
            (a, b) =>
              (ratings.get(b.freelancer_id ?? "") ?? 0) -
              (ratings.get(a.freelancer_id ?? "") ?? 0),
          );
        if (request === version.current) {
          setServices(rated);
          setRatings(ratings);
        }
      } catch (cause) {
        if (request === version.current)
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load marketplace.",
          );
      } finally {
        if (request === version.current) setLoading(false);
      }
    },
    [search, filters, guest],
  );
  useEffect(() => {
    const requests = version;
    const timer = setTimeout(() => void load(), 250);
    return () => {
      clearTimeout(timer);
      requests.current++;
    };
  }, [load]);
  useEffect(() => {
    if (guest) return;
    let alive = true;
    void getSavedListings()
      .then((data) => {
        if (alive) setSaved(data);
      })
      .catch((cause) => {
        if (alive) setSaveError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [guest]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const changed = () => {
      invalidatePageReads();
      clearTimeout(timer);
      timer = setTimeout(refresh, 150);
    };
    const channel = supabase.channel("marketplace:" + crypto.randomUUID());
    for (const table of ["services", "jobs", "reviews"])
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        changed,
      );
    channel.subscribe();
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 30000);
    return () => {
      clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      void supabase.removeChannel(channel);
    };
  }, [load]);
  async function toggle(listing: MarketplaceItem) {
    if (guest) {
      setSignup(true);
      return;
    }
    if (saving) return;
    const id =
      listing.listing_type === "service" ? listing.service_id : listing.job_id;
    const key = listingKey(listing.listing_type, id);
    setSaving(key);
    setSaveError("");
    try {
      await saveListing(listing.listing_type, id, !saved.has(key));
      setSaved((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : "Unable to save listing.",
      );
    } finally {
      setSaving(null);
    }
  }
  const visible = services.filter((listing) => {
    const id =
      listing.listing_type === "service" ? listing.service_id : listing.job_id;
    return (
      (!savedOnly || saved.has(listingKey(listing.listing_type, id))) &&
      (!selectedService ||
        (typeof listing.category?.name === "string" &&
          listing.category.name.toLowerCase() ===
            selectedService.toLowerCase()))
    );
  });
  return (
    <main className="min-w-0">
      <Dialog open={signup} onOpenChange={setSignup}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-sm">
          <DialogTitle className="sr-only">
            Create an account to continue
          </DialogTitle>
          <DialogDescription>
            Join WorkSync to request work, save listings, or view profiles.
          </DialogDescription>
          <SignupDialog />
        </DialogContent>
      </Dialog>
      <div className="mx-auto w-full max-w-[1600px] space-y-5">
        <WorkspacePageHeader
          title="Marketplace"
          description="Discover expert services and opportunities for your next collaboration."
        />
        <MarketplaceHeader
          search={search}
          onSearchChange={setSearch}
          onSearch={() => void load()}
          onFilterClick={() => setFilterOpen(true)}
          onCreateClick={() =>
            guest ? setSignup(true) : router.push("/home/my-listings")
          }
          selectedService={selectedService}
          onServiceChange={setSelectedService}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm text-muted-foreground">
            {loading ? "Finding listings..." : `${visible.length} listings`}
          </p>
          <label className="flex w-full min-w-0 items-center gap-2 text-sm sm:ml-auto sm:w-auto">
            <span className="shrink-0 text-muted-foreground">Sort by</span>
            <select
              className="h-11 min-w-0 flex-1 rounded-lg border bg-card px-3 text-foreground"
              value={filters.sort[0] ?? "latest"}
              onChange={(event) => {
                const sort = event.target.value as SortOption;
                setFilters((current) => ({ ...current, sort: [sort] }));
              }}
            >
              <option value="latest">Latest</option>
              <option value="lowestPrice">Lowest price</option>
              <option value="highestRated">Highest rated</option>
            </select>
          </label>
        </div>
        <MarketplaceFilterSheet
          open={filterOpen}
          onOpenChange={setFilterOpen}
          initialFilters={filters}
          onApply={(value) => {
            if (guest && value.savedOnly) {
              setSignup(true);
              return;
            }
            setFilters((current) => ({ ...value, sort: current.sort }));
            setFilterOpen(false);
          }}
        />
        {saveError && (
          <p role="alert" className="my-2 text-sm text-destructive">
            Saved listings: {saveError}
          </p>
        )}
        {error ? (
          <div role="alert" className="p-4 text-sm text-destructive">
            {error}
            <Button variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : (
          <MarketplaceGrid
            services={visible}
            ratings={ratings}
            loading={loading}
            saved={saved}
            saving={saving}
            onSave={toggle}
            onCardClick={(listing) =>
              router.push(
                listing.listing_type === "service"
                  ? `${guest ? "/marketplace" : "/home/marketplace"}/${listing.service_id}`
                  : `${guest ? "/marketplace" : "/home/marketplace"}/jobs/${listing.job_id}`,
              )
            }
          />
        )}
      </div>
    </main>
  );
}
