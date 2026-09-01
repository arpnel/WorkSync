"use client";

import { useCallback, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import MarketplaceHeader from "../../../components/marketplace/MarketplaceHeader";
import MarketplaceFilterSheet from "../../../components/marketplace/MarketplaceFilterSheet";
import MarketplaceGrid from "../../../components/marketplace/MarketplaceGrid";

import { getMarketplaceServices } from "@/services/marketplace/MarketplaceServices";

import type {
  MarketplaceItem,
  MarketplaceSort,
} from "@/services/marketplace/MarketplaceServices";

import type { MarketplaceFiltersValue } from "../../../components/marketplace/MarketplaceFilters";

export default function MarketplacePage() {
  const router = useRouter();

  /* ==========================================================
     MARKETPLACE LISTINGS
  ========================================================== */

  const [services, setServices] = useState<MarketplaceItem[]>([]);

  const [loading, setLoading] = useState(true);

  /* ==========================================================
     SEARCH
  ========================================================== */

  const [search, setSearch] = useState("");

  /* ==========================================================
     CATEGORY / SERVICE
  ========================================================== */

  const [selectedService, setSelectedService] = useState<string | null>(null);

  /* ==========================================================
     FILTERS
  ========================================================== */

  const [sort, setSort] = useState<MarketplaceSort>("latest");

  const [minPrice, setMinPrice] = useState<number | null>(null);

  const [maxPrice, setMaxPrice] = useState<number | null>(null);

  /*
   * Marketplace service layer uses:
   *
   * service = Freelancer Service
   * job     = Client Job
   */
  const [listingType, setListingType] = useState<"service" | "job">("service");

  const [rating, setRating] = useState(0);

  /* ==========================================================
     FILTER SHEET
  ========================================================== */

  const [filterOpen, setFilterOpen] = useState(false);

  /* ==========================================================
     LOAD MARKETPLACE
  ========================================================== */

  const loadServices = useCallback(async () => {
    setLoading(true);

    try {
      const data = await getMarketplaceServices({
        search,
        sort,
        minPrice,
        maxPrice,
        listingType,
      });

      setServices(data);
    } catch (error) {
      console.error("Marketplace failed to load:", error);

      setServices([]);
    } finally {
      setLoading(false);
    }
  }, [search, sort, minPrice, maxPrice, listingType]);

  /* ==========================================================
     INITIAL / FILTERED LOAD
  ========================================================== */

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  /* ==========================================================
     SEARCH
  ========================================================== */

  function handleSearch() {
    loadServices();
  }

  /* ==========================================================
     SERVICE CATEGORY
  ========================================================== */

  function handleServiceChange(service: string | null) {
    setSelectedService(service);

    /*
     * Category/subcategory mapping can be
     * connected later.
     */
  }

  /* ==========================================================
     APPLY FILTERS
  ========================================================== */

  function handleApplyFilters(filters: MarketplaceFiltersValue) {
    /*
     * IMPORTANT:
     *
     * MarketplaceFilters uses:
     *
     * freelancer = Freelancer Services
     * client     = Client Job Posts
     *
     * MarketplaceServices uses:
     *
     * service = Freelancer Services
     * job     = Client Job Posts
     *
     * Convert between them here.
     */

    setListingType(filters.listingType === "freelancer" ? "service" : "job");

    /* ========================================================
       PRICE
    ======================================================== */

    setMinPrice(filters.minPrice ? Number(filters.minPrice) : null);

    setMaxPrice(filters.maxPrice ? Number(filters.maxPrice) : null);

    /* ========================================================
       RATING
    ======================================================== */

    setRating(filters.rating);

    /* ========================================================
       SORT
    ======================================================== */

    if (filters.sort.includes("lowestPrice")) {
      setSort("lowestPrice");
    } else if (filters.sort.includes("highestRated")) {
      /*
       * highestRated is not currently available
       * in MarketplaceSort, so keep latest until
       * rating aggregation is implemented.
       */
      setSort("latest");
    } else {
      setSort("latest");
    }

    /* ========================================================
       CLOSE FILTER SHEET
    ======================================================== */

    setFilterOpen(false);
  }

  /* ==========================================================
     FILTER BUTTON
  ========================================================== */

  function handleFilterClick() {
    setFilterOpen(true);
  }

  /* ==========================================================
     CREATE
  ========================================================== */

  function handleCreateClick() {}

  /* ==========================================================
     OPEN LISTING
  ========================================================== */

  function handleServiceClick(listing: MarketplaceItem) {
    if (listing.listing_type !== "service") return;
    const serviceId = listing.service_id;

    if (!serviceId) {
      console.error("Cannot open marketplace listing: serviceId is undefined.");

      return;
    }

    router.push(`/home/marketplace/${serviceId}`);
  }

  /* ==========================================================
     CURRENT FILTERS
  ========================================================== */

  const currentFilters: MarketplaceFiltersValue = {
    sort: [sort === "lowestPrice" ? "lowestPrice" : "latest"],

    /*
     * Convert the marketplace service-layer
     * value back into the filter-layer value.
     */
    listingType: listingType === "service" ? "freelancer" : "client",

    minPrice: minPrice !== null ? String(minPrice) : "",

    maxPrice: maxPrice !== null ? String(maxPrice) : "",

    rating,
  };

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="w-full px-6 py-4">
        {/* ==================================================
            HEADER
        ================================================== */}

        <MarketplaceHeader
          search={search}
          onSearchChange={setSearch}
          onSearch={handleSearch}
          onFilterClick={handleFilterClick}
          onCreateClick={handleCreateClick}
          selectedService={selectedService}
          onServiceChange={handleServiceChange}
        />

        {/* ==================================================
            FILTER SHEET
        ================================================== */}

        <MarketplaceFilterSheet
          open={filterOpen}
          onOpenChange={setFilterOpen}
          onApply={handleApplyFilters}
          initialFilters={currentFilters}
        />

        {/* ==================================================
            MARKETPLACE GRID
        ================================================== */}

        <div className="mt-4">
          <MarketplaceGrid
            services={services}
            loading={loading}
            onCardClick={handleServiceClick}
          />
        </div>
      </div>
    </main>
  );
}
