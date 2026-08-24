// services/marketplace/MarketplaceSorting.ts

import type {
  MarketplaceQuery,
  MarketplaceService,
  MarketplaceSort,
} from "./MarketplaceServices";

/* ==========================================================
   SORT TYPES
========================================================== */

export type MarketplaceSortOption =
  | "latest"
  | "lowestPrice"
  | "highestPrice";

/* ==========================================================
   FILTER TYPES
========================================================== */

export interface MarketplaceFilterValues {
  sort: MarketplaceSortOption[];

  showFreelancers: boolean;
  showClientJobs: boolean;

  minPrice: string;
  maxPrice: string;

  rating: number;
}

/* ==========================================================
   DEFAULT FILTERS
========================================================== */

export const DEFAULT_MARKETPLACE_FILTERS: MarketplaceFilterValues = {
  sort: ["latest"],

  // Show BOTH by default.
  showFreelancers: true,
  showClientJobs: true,

  minPrice: "",
  maxPrice: "",

  rating: 0,
};

/* ==========================================================
   GET LISTING TYPES
==========================================================

   Freelancer Services -> "service"
   Client Job Posts    -> "job"

   Both selected -> null
   Neither selected -> "__none__"
========================================================== */

export function getMarketplaceListingType(
  filters: MarketplaceFilterValues,
): "service" | "job" | null | "__none__" {
  if (
    filters.showFreelancers &&
    filters.showClientJobs
  ) {
    return null;
  }

  if (filters.showFreelancers) {
    return "service";
  }

  if (filters.showClientJobs) {
    return "job";
  }

  return "__none__";
}

/* ==========================================================
   CONVERT PRICE
========================================================== */

function parsePrice(
  value: string,
): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (parsed < 0) {
    return null;
  }

  return parsed;
}

/* ==========================================================
   CONVERT SORT
========================================================== */

export function getMarketplaceSort(
  filters: MarketplaceFilterValues,
): MarketplaceSort {
  /*
   * The database query supports one sort at a time.
   *
   * If multiple sort chips are selected, the first
   * selected supported sort takes priority.
   */

  if (filters.sort.includes("lowestPrice")) {
    return "lowestPrice";
  }

  if (filters.sort.includes("highestPrice")) {
    return "highestPrice";
  }

  return "latest";
}

/* ==========================================================
   BUILD MARKETPLACE QUERY
========================================================== */

export function buildMarketplaceQuery(
  filters: MarketplaceFilterValues,
): MarketplaceQuery {
  const listingType =
    getMarketplaceListingType(filters);

  /*
   * If neither listing type is selected,
   * return a query that can never produce results.
   *
   * The page can detect "__none__" before querying.
   */
  if (listingType === "__none__") {
    return {
      sort: getMarketplaceSort(filters),
      minPrice: parsePrice(filters.minPrice),
      maxPrice: parsePrice(filters.maxPrice),
      listingType: null,
    };
  }

  return {
    sort: getMarketplaceSort(filters),

    minPrice: parsePrice(filters.minPrice),

    maxPrice: parsePrice(filters.maxPrice),

    /*
     * null means:
     * service + job
     *
     * service means:
     * freelancer services only
     *
     * job means:
     * client jobs only
     */
    listingType,
  };
}

/* ==========================================================
   CLIENT-SIDE SORT
==========================================================

   This is useful if the marketplace already has the
   listings loaded and you want to sort them without
   querying Supabase again.
========================================================== */

export function sortMarketplaceListings(
  listings: MarketplaceService[],
  sort: MarketplaceSortOption,
): MarketplaceService[] {
  const sorted = [...listings];

  switch (sort) {
    case "lowestPrice":
      return sorted.sort(
        (a, b) =>
          Number(a.price) - Number(b.price),
      );

    case "highestPrice":
      return sorted.sort(
        (a, b) =>
          Number(b.price) - Number(a.price),
      );

    case "latest":
    default:
      return sorted.sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime(),
      );
  }
}

/* ==========================================================
   CLIENT-SIDE LISTING TYPE FILTER
========================================================== */

export function filterMarketplaceListings(
  listings: MarketplaceService[],
  filters: MarketplaceFilterValues,
): MarketplaceService[] {
  /*
   * Both selected
   * -> show services + jobs
   */
  if (
    filters.showFreelancers &&
    filters.showClientJobs
  ) {
    return listings;
  }

  /*
   * Freelancer Services only
   */
  if (filters.showFreelancers) {
    return listings.filter(
      (listing) =>
        listing.listing_type === "service",
    );
  }

  /*
   * Client Job Posts only
   */
  if (filters.showClientJobs) {
    return listings.filter(
      (listing) =>
        listing.listing_type === "job",
    );
  }

  /*
   * Nothing selected
   */
  return [];
}

/* ==========================================================
   CLIENT-SIDE PRICE FILTER
========================================================== */

export function filterMarketplaceByPrice(
  listings: MarketplaceService[],
  minPrice: string,
  maxPrice: string,
): MarketplaceService[] {
  const min = parsePrice(minPrice);
  const max = parsePrice(maxPrice);

  return listings.filter((listing) => {
    const price = Number(listing.price);

    if (!Number.isFinite(price)) {
      return false;
    }

    if (min !== null && price < min) {
      return false;
    }

    if (max !== null && price > max) {
      return false;
    }

    return true;
  });
}

/* ==========================================================
   COMPLETE CLIENT-SIDE FILTER
========================================================== */

export function applyMarketplaceFilters(
  listings: MarketplaceService[],
  filters: MarketplaceFilterValues,
): MarketplaceService[] {
  let result = [...listings];

  /*
   * Listing type
   */
  result = filterMarketplaceListings(
    result,
    filters,
  );

  /*
   * Price
   */
  result = filterMarketplaceByPrice(
    result,
    filters.minPrice,
    filters.maxPrice,
  );

  /*
   * Sort
   */
  const sort = filters.sort[0] ?? "latest";

  result = sortMarketplaceListings(
    result,
    sort,
  );

  return result;
}

/* ==========================================================
   CHECK IF FILTERS ARE VALID
========================================================== */

export function validateMarketplaceFilters(
  filters: MarketplaceFilterValues,
): {
  valid: boolean;
  error?: string;
} {
  const min = parsePrice(filters.minPrice);
  const max = parsePrice(filters.maxPrice);

  if (
    filters.minPrice.trim() &&
    min === null
  ) {
    return {
      valid: false,
      error: "Minimum price must be a valid number.",
    };
  }

  if (
    filters.maxPrice.trim() &&
    max === null
  ) {
    return {
      valid: false,
      error: "Maximum price must be a valid number.",
    };
  }

  if (
    min !== null &&
    max !== null &&
    min > max
  ) {
    return {
      valid: false,
      error:
        "Minimum price cannot be greater than maximum price.",
    };
  }

  return {
    valid: true,
  };
}

/* ==========================================================
   RESET
========================================================== */

export function resetMarketplaceFilters(): MarketplaceFilterValues {
  return {
    ...DEFAULT_MARKETPLACE_FILTERS,

    sort: ["latest"],
  };
}