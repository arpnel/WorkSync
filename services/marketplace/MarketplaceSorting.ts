import type {
  MarketplaceItem,
  MarketplaceQuery,
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

  showFreelancers: true,
  showClientJobs: true,

  minPrice: "",
  maxPrice: "",

  rating: 0,
};

/* ==========================================================
   LISTING TYPE
========================================================== */

export function getMarketplaceListingType(
  filters: MarketplaceFilterValues,
):
  | "service"
  | "job"
  | null
  | "__none__" {
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
   PRICE PARSER
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
   SORT
========================================================== */

export function getMarketplaceSort(
  filters: MarketplaceFilterValues,
): MarketplaceSort {
  if (
    filters.sort.includes(
      "lowestPrice",
    )
  ) {
    return "lowestPrice";
  }

  if (
    filters.sort.includes(
      "highestPrice",
    )
  ) {
    return "highestPrice";
  }

  return "latest";
}

/* ==========================================================
   BUILD QUERY
========================================================== */

export function buildMarketplaceQuery(
  filters: MarketplaceFilterValues,
): MarketplaceQuery {
  const listingType =
    getMarketplaceListingType(
      filters,
    );

  return {
    sort:
      getMarketplaceSort(
        filters,
      ),

    minPrice:
      parsePrice(
        filters.minPrice,
      ),

    maxPrice:
      parsePrice(
        filters.maxPrice,
      ),

    listingType:
      listingType ===
      "__none__"
        ? null
        : listingType,
  };
}

/* ==========================================================
   GET ITEM PRICE
========================================================== */

function getItemPrice(
  item: MarketplaceItem,
): number {
  if (
    item.listing_type ===
    "service"
  ) {
    return Number(
      item.price,
    );
  }

  /*
   * For jobs we use budget_min
   * as the sorting/filtering base.
   */
  return Number(
    item.budget_min,
  );
}

/* ==========================================================
   CLIENT-SIDE SORT
========================================================== */

export function sortMarketplaceListings(
  listings: MarketplaceItem[],
  sort: MarketplaceSortOption,
): MarketplaceItem[] {
  const sorted = [
    ...listings,
  ];

  switch (sort) {
    case "lowestPrice":
      return sorted.sort(
        (a, b) =>
          getItemPrice(a) -
          getItemPrice(b),
      );

    case "highestPrice":
      return sorted.sort(
        (a, b) =>
          getItemPrice(b) -
          getItemPrice(a),
      );

    case "latest":
    default:
      return sorted.sort(
        (a, b) =>
          new Date(
            b.created_at,
          ).getTime() -
          new Date(
            a.created_at,
          ).getTime(),
      );
  }
}

/* ==========================================================
   LISTING TYPE FILTER
========================================================== */

export function filterMarketplaceListings(
  listings: MarketplaceItem[],
  filters: MarketplaceFilterValues,
): MarketplaceItem[] {
  if (
    filters.showFreelancers &&
    filters.showClientJobs
  ) {
    return listings;
  }

  if (filters.showFreelancers) {
    return listings.filter(
      (listing) =>
        listing.listing_type ===
        "service",
    );
  }

  if (filters.showClientJobs) {
    return listings.filter(
      (listing) =>
        listing.listing_type ===
        "job",
    );
  }

  return [];
}

/* ==========================================================
   PRICE FILTER
========================================================== */

export function filterMarketplaceByPrice(
  listings: MarketplaceItem[],
  minPrice: string,
  maxPrice: string,
): MarketplaceItem[] {
  const min =
    parsePrice(minPrice);

  const max =
    parsePrice(maxPrice);

  return listings.filter(
    (listing) => {
      const price =
        getItemPrice(listing);

      if (
        !Number.isFinite(
          price,
        )
      ) {
        return false;
      }

      if (
        min !== null &&
        price < min
      ) {
        return false;
      }

      if (
        max !== null &&
        price > max
      ) {
        return false;
      }

      return true;
    },
  );
}

/* ==========================================================
   COMPLETE FILTER
========================================================== */

export function applyMarketplaceFilters(
  listings: MarketplaceItem[],
  filters: MarketplaceFilterValues,
): MarketplaceItem[] {
  let result = [
    ...listings,
  ];

  result =
    filterMarketplaceListings(
      result,
      filters,
    );

  result =
    filterMarketplaceByPrice(
      result,
      filters.minPrice,
      filters.maxPrice,
    );

  const sort =
    filters.sort[0] ??
    "latest";

  result =
    sortMarketplaceListings(
      result,
      sort,
    );

  return result;
}

/* ==========================================================
   VALIDATION
========================================================== */

export function validateMarketplaceFilters(
  filters: MarketplaceFilterValues,
): {
  valid: boolean;
  error?: string;
} {
  const min =
    parsePrice(
      filters.minPrice,
    );

  const max =
    parsePrice(
      filters.maxPrice,
    );

  if (
    filters.minPrice.trim() &&
    min === null
  ) {
    return {
      valid: false,
      error:
        "Minimum price must be a valid number.",
    };
  }

  if (
    filters.maxPrice.trim() &&
    max === null
  ) {
    return {
      valid: false,
      error:
        "Maximum price must be a valid number.",
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