"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { WorkspacePageHeader } from "@/components/shared/WorkspacePageHeader";
import { invalidatePageReads } from "@/lib/pageReadCache";
import { supabase } from "@/lib/supabaseClient";
import { usePathname, useRouter } from "next/navigation";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  initialCategoryId = "",
  initialSkillId = "",
  initialService = "",
}: {
  guest?: boolean;
  initialCategoryId?: string;
  initialSkillId?: string;
  initialService?: string;
}) {
  const [signup, setSignup] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const [deepCategoryId, setDeepCategoryId] = useState(initialCategoryId);
  const [deepSkillId, setDeepSkillId] = useState(
    initialCategoryId ? initialSkillId : "",
  );
  const [deepCategoryName, setDeepCategoryName] = useState("");
  const [deepSkillName, setDeepSkillName] = useState("");
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  const [services, setServices] = useState<MarketplaceItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedService, setSelectedService] = useState<string | null>(
    initialService || null,
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<MarketplaceFiltersValue>({
    sort: guest ? ["latest"] : ["highestRated"],
    listingType: guest ? "service" : "freelancer",
    minPrice: "",
    maxPrice: "",
    rating: 0,
    savedOnly: false,
  });
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const savedOnly = filters.savedOnly;
  const [saving, setSaving] = useState<string | null>(null);
  const version = useRef(0);
  const updateDeepFilters = useCallback(
    (categoryId: string, skillId: string) => {
      setDeepCategoryId(categoryId);
      setDeepSkillId(categoryId ? skillId : "");
      setSelectedService(null);
      const params = new URLSearchParams(window.location.search);
      if (categoryId) params.set("category", categoryId);
      else params.delete("category");
      if (categoryId && skillId) params.set("subcategory", skillId);
      else params.delete("subcategory");
      params.delete("service");
      const query = params.toString();
      const nextUrl = query ? `${pathname}?${query}` : pathname;
      const currentUrl = window.location.pathname + window.location.search;
      if (nextUrl !== currentUrl) window.history.pushState({}, "", nextUrl);
    },
    [pathname],
  );
  useEffect(() => {
    setDeepCategoryId(initialCategoryId);
    setDeepSkillId(initialCategoryId ? initialSkillId : "");
    setSelectedService(initialService || null);
  }, [initialCategoryId, initialSkillId, initialService]);
  const updateServiceFilter = useCallback(
    (service: string | null) => {
      setSelectedService(service);
      setDeepCategoryId("");
      setDeepSkillId("");
      const params = new URLSearchParams(window.location.search);
      params.delete("category");
      params.delete("subcategory");
      if (service) params.set("service", service);
      else params.delete("service");
      const query = params.toString();
      const nextUrl = query ? `${pathname}?${query}` : pathname;
      if (nextUrl !== window.location.pathname + window.location.search)
        window.history.pushState({}, "", nextUrl);
    },
    [pathname],
  );
  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      setDeepCategoryId(params.get("category") ?? "");
      setDeepSkillId(
        params.get("category") ? (params.get("subcategory") ?? "") : "",
      );
      setSelectedService(params.get("service") ?? null);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      const [category, skill] = await Promise.all([
        deepCategoryId
          ? supabase
              .from("job_categories")
              .select("name")
              .eq("id", deepCategoryId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        deepSkillId
          ? supabase
              .from("skills")
              .select("name")
              .eq("id", deepSkillId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (!active) return;
      setDeepCategoryName(category.data?.name ?? "");
      setDeepSkillName(skill.data?.name ?? "");
    })();
    return () => {
      active = false;
    };
  }, [deepCategoryId, deepSkillId]);
  const load = useCallback(
    async (quiet = false, pageIndex = 0, append = false) => {
      const request = ++version.current;
      if (append) setLoadingMore(true);
      else {
        setLoadingMore(false);
        if (!quiet) setLoading(true);
      }
      setError("");
      try {
        const sort: MarketplaceSort = filters.sort.includes("lowestPrice")
          ? "lowestPrice"
          : "latest";
        const result = await getMarketplaceServices({
          ...(guest ? { guest: true } : {}),
          search,
          categoryId: deepCategoryId || null,
          skillId: deepSkillId || null,
          sort,
          listingType: filters.listingType === "job" ? "job" : "service",
          page: pageIndex,
          pageSize: 24,
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
            filters.listingType === "job" ||
            (ratings.get(item.freelancer_id ?? "") ?? 0) >= filters.rating,
        );
        const pageItems = filters.listingType === "freelancer"
          ? rated.filter((item, index, rows) => item.freelancer_id && rows.findIndex((candidate) => candidate.freelancer_id === item.freelancer_id) === index)
          : rated;
        if (filters.sort.includes("highestRated"))
          pageItems.sort(
            (a, b) =>
              (ratings.get(b.freelancer_id ?? "") ?? 0) -
              (ratings.get(a.freelancer_id ?? "") ?? 0),
          );
        if (request === version.current) {
          setServices((current) => {
            const next = append ? [...current, ...pageItems] : pageItems;
            if (filters.listingType === "freelancer") {
              const unique = new Map<string, MarketplaceItem>();
              for (const item of next) {
                if (item.freelancer_id && !unique.has(item.freelancer_id)) {
                  unique.set(item.freelancer_id, item);
                }
              }
              return [...unique.values()];
            }
            return next;
          });
          setRatings((current) => append ? new Map([...current, ...ratings]) : ratings);
          setHasMore(result.length === 24);
          setPage(pageIndex);
        }
      } catch (cause) {
        if (request === version.current)
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load marketplace.",
          );
      } finally {
        if (request === version.current) {
          if (append) setLoadingMore(false);
          else setLoading(false);
        }
      }
    },
    [search, filters, guest, deepCategoryId, deepSkillId],
  );
  useEffect(() => {
    const requests = version;
    setPage(0);
    setHasMore(false);
    setServices([]);
    const timer = setTimeout(() => void load(false, 0, false), 250);
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
    for (const table of ["services", "jobs", "reviews", "job_applications"])
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
          hasExternalFilter={Boolean(deepCategoryId)}
          externalFilterLabel={`${deepCategoryName || "Category"}${deepSkillName ? ` · ${deepSkillName}` : ""}`}
          onServiceChange={(value) => {
            updateServiceFilter(value);
          }}
        />
        {(deepCategoryId || deepSkillId) && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/20 p-3 text-sm">
            <span className="font-medium">Filtered by</span>
            {deepCategoryId && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => updateDeepFilters("", "")}
              >
                {deepCategoryName || "Selected category"}{" "}
                <span aria-hidden="true">×</span>
              </Button>
            )}
            {deepSkillId && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => updateDeepFilters(deepCategoryId, "")}
              >
                {deepSkillName || "Selected specialty"}{" "}
                <span aria-hidden="true">×</span>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => updateDeepFilters("", "")}
            >
              Clear filters
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 md:px-5">
          <p role="status" className="text-sm text-muted-foreground">
            {loading ? "Finding listings..." : `${visible.length} ${filters.listingType === "freelancer" ? "freelancers" : "listings"}`}
          </p>
          <div className="flex w-full min-w-0 items-center justify-end gap-3 text-sm sm:ml-auto sm:w-auto">
            <span className="shrink-0 text-muted-foreground">Sort by</span>
            <Select
              value={filters.sort[0] ?? "latest"}
              onValueChange={(value) => {
                setFilters((current) => ({
                  ...current,
                  sort: [value as SortOption],
                }));
              }}
            >
              <SelectTrigger className="!h-11 min-w-0 flex-1 rounded-lg border bg-card px-3 text-foreground shadow-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30 sm:flex-none">
                <SelectValue placeholder="Choose sorting" />
              </SelectTrigger>
              <SelectContent
                position="popper"
                side="bottom"
                sideOffset={4}
                avoidCollisions={false}
                align="end"
                className="rounded-lg border bg-card p-1 shadow-md"
              >
                <SelectItem className="rounded-lg py-2.5" value="latest">
                  Latest
                </SelectItem>
                <SelectItem className="rounded-lg py-2.5" value="lowestPrice">
                  Lowest price
                </SelectItem>
                <SelectItem className="rounded-lg py-2.5" value="highestRated">
                  Highest rated
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>{" "}
        <MarketplaceFilterSheet
          open={filterOpen}
          onOpenChange={setFilterOpen}
          initialFilters={filters}
          onApply={(value) => {
            if (guest && value.savedOnly) {
              setSignup(true);
              return;
            }
            setFilters(value);
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
            freelancerMode={filters.listingType === "freelancer"}
            ratings={ratings}
            loading={loading}
            saved={saved}
            saving={saving}
            onSave={filters.listingType === "freelancer" ? undefined : toggle}
            onCardClick={(listing) =>
              router.push(
                filters.listingType === "freelancer" && listing.freelancer?.user_id
                  ? guest
                    ? `/marketplace/${listing.service_id}`
                    : `/home/profile/${listing.freelancer.user_id}`
                  : listing.listing_type === "service"
                  ? `${guest ? "/marketplace" : "/home/marketplace"}/${listing.service_id}`
                  : `${guest ? "/marketplace" : "/home/marketplace"}/jobs/${listing.job_id}`,
              )
            }
          />
        )}
        {!error && hasMore && (
          <div className="flex justify-center pb-4">
            <Button
              variant="outline"
              disabled={loadingMore}
              onClick={() => void load(false, page + 1, true)}
            >
              {loadingMore ? "Loading..." : "Load more"}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
